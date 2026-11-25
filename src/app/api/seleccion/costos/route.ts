import { NextRequest, NextResponse } from "next/server";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { resolverRangoCostos } from "@/lib/seleccion/costos";
import { aspirantesDeCostos, leerCostosSeleccion } from "@/lib/seleccion/costos-servidor";
import { construirExcelCostos } from "@/lib/seleccion/costos-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Excel del costo de la selección: ?costo_desde=AAAA-MM-DD&costo_hasta=AAAA-MM-DD (sin fechas, el mes en curso). */
export async function GET(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) {
    return NextResponse.json({ ok: false, error: "Sin permiso para el módulo Candidatos." }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const { rango } = resolverRangoCostos({ desde: sp.get("costo_desde") ?? undefined, hasta: sp.get("costo_hasta") ?? undefined });
  const { detalle, consumos, consultas } = await leerCostosSeleccion(rango);
  const aspirantes = await aspirantesDeCostos([...consumos, ...consultas].map((f) => f.proceso_id ?? ""));
  const buffer = await construirExcelCostos({ detalle, consumos, consultas, aspirantes });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="costo_seleccion_${rango.desde}_a_${rango.hasta}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
