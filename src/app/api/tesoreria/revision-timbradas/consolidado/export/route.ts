import { NextRequest, NextResponse } from "next/server";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { respuestaExcel } from "@/lib/tesoreria/liquidacion-excel";
import { getConsolidadoTimbradas } from "@/lib/tesoreria/revision-timbradas-consolidado-data";
import { libroConsolidadoTimbradas } from "@/lib/tesoreria/revision-timbradas-consolidado-excel";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Excel del consolidado de la revisión de timbradas del periodo `desde`–`hasta` (máximo 62 días). */
export async function GET(request: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const desde = sp.get("desde"), hasta = sp.get("hasta");
  if (!desde || !hasta || !FECHA_RE.test(desde) || !FECHA_RE.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Periodo inválido" }, { status: 400 });
  }
  if ((Date.parse(hasta) - Date.parse(desde)) / 864e5 > 61) {
    return NextResponse.json({ error: "Máximo 62 días" }, { status: 400 });
  }
  const { consolidado } = await getConsolidadoTimbradas(desde, hasta);
  const generado = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const { buffer, archivo } = await libroConsolidadoTimbradas(consolidado, generado);
  await logTesoreriaAudit({
    accion: "exportacion", modulo: "tesoreria", rol: perms.userType,
    detalle: { reporte: "revision_timbradas_consolidado", desde, hasta, dias: consolidado.dias.length },
  });
  return respuestaExcel(buffer, archivo);
}
