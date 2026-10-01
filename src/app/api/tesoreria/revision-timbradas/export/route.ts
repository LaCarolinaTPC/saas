import { NextRequest, NextResponse } from "next/server";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { respuestaExcel } from "@/lib/tesoreria/liquidacion-excel";
import { getMarcasRevision, getRevisionTimbradas } from "@/lib/tesoreria/revision-timbradas-data";
import { libroRevisionTimbradas } from "@/lib/tesoreria/revision-timbradas-excel";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Excel de la revisión de timbradas del día `fecha`, con el resultado de la revisión. */
export async function GET(request: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const fecha = request.nextUrl.searchParams.get("fecha");
  if (!fecha || !FECHA_RE.test(fecha)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });

  const [rev, marcas] = await Promise.all([getRevisionTimbradas(fecha), getMarcasRevision(fecha)]);
  const generado = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const { buffer, archivo } = await libroRevisionTimbradas(rev, marcas.marcas, generado);

  await logTesoreriaAudit({
    accion: "exportacion",
    modulo: "tesoreria",
    rol: perms.userType,
    detalle: { reporte: "revision_timbradas", fecha, viajes: rev.filas.length },
  });
  return respuestaExcel(buffer, archivo);
}
