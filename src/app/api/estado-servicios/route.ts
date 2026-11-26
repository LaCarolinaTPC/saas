import { NextResponse } from "next/server";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { leerEstadoServicios } from "@/lib/estado-servicios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de los servicios externos para la barra de estado (26-nov-2026), que
 * se actualiza sola en Candidatos, Comunicaciones y el chat de prueba. Va por
 * ruta y no por server action para no hacer fila con las acciones de la
 * página (el chat de prueba hace muchas). Se calcula con las respuestas ya
 * recibidas; no consulta a los servicios. Un minuto en memoria.
 */
export async function GET() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") && !canAccess(perms, "comunicaciones")) {
    return NextResponse.json({ ok: false, error: "Sin permiso." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, estados: await leerEstadoServicios() });
}
