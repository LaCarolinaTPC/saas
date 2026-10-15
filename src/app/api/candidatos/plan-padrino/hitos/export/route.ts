import { NextRequest, NextResponse } from "next/server";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cedulaDelUsuario, listarHitos, VISTAS_HITOS } from "@/lib/padrino/datos";
import { construirExcelHitos } from "@/lib/padrino/excel";
import { bitacoraHito } from "@/lib/padrino/servidor";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Excel de hitos con los filtros de la bandeja (nómina y coordinación). */
export async function GET(req: NextRequest) {
  const perms = await getCurrentPermissions();
  const puede =
    canAccessSub(perms, "candidatos", "padrino_consulta") &&
    (canAccessSub(perms, "candidatos", "padrino_pago") || canAccessSub(perms, "candidatos", "padrino_aprobacion"));
  if (!puede) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const vista = VISTAS_HITOS.some((v) => v.value === sp.get("vista")) ? (sp.get("vista") as string) : "aprobado";
  const desde = FECHA_RE.test(sp.get("desde") ?? "") ? sp.get("desde") : null;
  const hasta = FECHA_RE.test(sp.get("hasta") ?? "") ? sp.get("hasta") : null;
  const cedula = await cedulaDelUsuario(perms.userId, perms.userEmail);
  const hitos = await listarHitos({ vista, desde, hasta, q: sp.get("q") ?? "" }, cedula);

  const etiqueta = VISTAS_HITOS.find((v) => v.value === vista)?.label ?? vista;
  const titulo = `${etiqueta}${desde || hasta ? ` · causación ${desde ?? "…"} a ${hasta ?? "…"}` : ""} · ${hitos.length} hitos`;
  const buffer = await construirExcelHitos(hitos, titulo);
  // Deja constancia de la exportación en la bitácora de cada hito (Control Interno).
  for (const h of hitos) await bitacoraHito(h.referido_id, h.id, "hito_exportado", { vista, desde, hasta }, perms);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plan-padrino-hitos-${vista}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
