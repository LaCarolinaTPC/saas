import { NextRequest, NextResponse } from "next/server";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { getFilasIndicadores, getConductoresActivos } from "@/lib/ausentismo/matriz";
import { calcularIndicadores } from "@/lib/ausentismo/indicadores";
import { esCondicionMaestro, parseTiposConductor, tasaTieneBase } from "@/lib/ausentismo/matriz-reglas";
import { construirExcelIndicadores } from "@/lib/ausentismo/indicadores-excel";
import { nombreArchivoIndicadores } from "@/lib/ausentismo/indicadores-pdf";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Excel de los indicadores con la misma segmentación de la pestaña: los
 * parámetros son los de la URL del dashboard. Las cifras salen del mismo
 * módulo de cálculo que la pantalla y el PDF.
 */
export async function GET(request: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const valida = (v: string | null) => (v && FECHA_RE.test(v) ? v : null);
  const hasta = valida(sp.get("hasta")) ?? hoy;
  const desde = valida(sp.get("desde")) ?? `${hasta.slice(0, 4)}-01-01`;
  const estado = sp.get("estado");
  const tipos = parseTiposConductor(sp.get("tipo"));
  const cond = sp.get("cond");
  const condicion = esCondicionMaestro(cond) ? cond : null;
  const filtros = {
    desde,
    hasta,
    origen: sp.get("origen") || null,
    eps: sp.get("eps") || null,
    tipo: tipos.join(",") || null,
    estado: estado === "pendiente" || estado === "cerrado" ? estado : null,
    condicion,
  };

  const [filas, activos] = await Promise.all([
    getFilasIndicadores({ ...filtros, tiposConductor: tipos }),
    // Misma regla que la pantalla: sin base comparable no hay tasa.
    tasaTieneBase(condicion, tipos) ? getConductoresActivos() : Promise.resolve(null),
  ]);
  const indicadores = calcularIndicadores(filas, { desde, hasta, activos });
  const buffer = await construirExcelIndicadores({ indicadores, filtros, filas });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoIndicadores(filtros)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
