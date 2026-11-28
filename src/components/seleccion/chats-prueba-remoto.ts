/**
 * Guardado de los chats de prueba en la base (26-nov-2026), para verlos y
 * seguirlos desde cualquier equipo. Habla con /api/seleccion/chats-prueba.
 *
 * Todas las funciones devuelven null si la base no está disponible (falta la
 * migración, sin red, sin permiso): entonces el chat sigue guardándose solo
 * en el navegador, como antes.
 */
import type { ConfigChatPrueba, ResumenChatPrueba } from "./chat-prueba";

const RUTA = "/api/seleccion/chats-prueba";

export interface ChatRemoto {
  id: number;
  numero: number;
  config: ConfigChatPrueba;
  resumen: ResumenChatPrueba | null;
  creado_por: string | null;
  actualizado_por: string | null;
  updated_at: string;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", ...init });
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean } & T;
    return j.ok ? j : null;
  } catch {
    return null;
  }
}

export async function listarChatsRemotos(): Promise<ChatRemoto[] | null> {
  const j = await pedir<{ chats: ChatRemoto[] }>(RUTA);
  return j ? j.chats : null;
}

/** La conversación guardada de un chat; `chat: null` si no está en la base. */
export async function leerChatRemoto(id: number): Promise<{ estado: unknown; updated_at: string; cerrado_at: string | null } | null | undefined> {
  const j = await pedir<{ chat: { estado: unknown; updated_at: string; cerrado_at: string | null } | null }>(`${RUTA}?id=${id}`);
  return j ? j.chat : undefined;
}

export async function guardarChatRemoto(
  datos: { id: number; numero?: number; config?: ConfigChatPrueba; resumen?: ResumenChatPrueba | null; estado?: unknown },
  opciones: { keepalive?: boolean } = {}
): Promise<{ updated_at: string; cerrado: boolean } | null> {
  const cuerpo = JSON.stringify(datos);
  // keepalive (al cerrar la pestaña) solo admite cuerpos de hasta 64 KB.
  const keepalive = Boolean(opciones.keepalive) && cuerpo.length < 60_000;
  return pedir<{ updated_at: string; cerrado: boolean }>(RUTA, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: cuerpo,
    keepalive,
  });
}

export async function cerrarChatRemoto(id: number): Promise<boolean> {
  return Boolean(await pedir<object>(`${RUTA}?id=${id}`, { method: "DELETE" }));
}
