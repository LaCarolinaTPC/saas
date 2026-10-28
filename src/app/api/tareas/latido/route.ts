import { NextResponse } from "next/server";
import { getCurrentPermissions } from "@/lib/permissions";
import { correrTareasVencidas } from "@/lib/tareas/ejecutor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * El latido de las páginas abiertas (estilo wp-cron): corre las tareas
 * programadas cuya hora ya pasó y que no corrieron en esta ranura. Lo llama
 * `LatidoTareas` al abrir cualquier página del panel y cada 5 minutos.
 *
 * Exige sesión, pero ningún módulo: no decide nada que no esté ya decidido —
 * qué tarea y a qué hora lo configura quien tiene permiso—, solo pone el reloj.
 * Responde `refrescar` si alguna tarea cambió datos, para que la página se relea.
 */
export async function POST() {
  const perms = await getCurrentPermissions();
  if (!perms.userId) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });

  const tareas = await correrTareasVencidas();
  const refrescar = tareas.some(
    (t) => t.corrio && (Number(t.resultado?.creados ?? 0) > 0 || Number(t.resultado?.eliminados ?? 0) > 0)
  );
  return NextResponse.json(
    { tareas: tareas.map((t) => ({ id: t.id, corrio: t.corrio, motivo: t.motivo ?? null, error: t.error ?? null })), refrescar },
    { headers: { "Cache-Control": "no-store" } }
  );
}
