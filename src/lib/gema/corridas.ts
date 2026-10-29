/**
 * Bitácora de sincronizaciones con GEMA (`gema_corridas`, migración
 * 20261029181941). Cada corrida —el cron de las 03:00 o el botón de
 * Tesorería › Parámetros— abre una fila y la cierra con su resultado por
 * tabla. Abrir es también el candado: si ya hay una en curso, no se abre otra.
 *
 * Si la migración no está aplicada, todo sigue funcionando sin bitácora ni
 * candado (como antes): `abrirCorridaGema` devuelve null y avisa en el log.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncResult } from "./sync";

type Admin = ReturnType<typeof createAdminClient>;

export type OrigenCorridaGema = "cron" | "manual";
export type EstadoCorridaGema = "corriendo" | "ok" | "parcial" | "error" | "abandonada";

export interface CorridaGema {
  id: number;
  iniciada_at: string;
  terminada_at: string | null;
  origen: OrigenCorridaGema;
  usuario_email: string | null;
  rango_desde: string | null;
  rango_hasta: string | null;
  estado: EstadoCorridaGema;
  duracion_ms: number | null;
  resultados: SyncResult[] | null;
  error: string | null;
}

/** Ya hay otra corrida en curso: no es un fallo, es el candado. */
export class CorridaEnCurso extends Error {}

/** La tabla o la función no existen todavía (migración sin aplicar). */
function faltaMigracion(mensaje: string): boolean {
  return /gema_corridas|gema_abrir_corrida|does not exist|schema cache|PGRST20[02]/i.test(mensaje);
}

/**
 * Abre una corrida. Devuelve su id, o null si la migración no está aplicada.
 * Lanza `CorridaEnCurso` si ya hay otra corriendo.
 */
export async function abrirCorridaGema(
  db: Admin,
  datos: { origen: OrigenCorridaGema; usuarioEmail?: string | null; desde: string; hasta: string }
): Promise<number | null> {
  const { data, error } = await db.rpc("gema_abrir_corrida", {
    p_origen: datos.origen,
    p_usuario: datos.usuarioEmail ?? null,
    p_desde: datos.desde,
    p_hasta: datos.hasta,
  });
  if (error) {
    if (error.message.includes("GEMA_EN_CURSO")) {
      throw new CorridaEnCurso(error.message.replace(/^.*GEMA_EN_CURSO:\s*/, ""));
    }
    if (faltaMigracion(error.message)) {
      console.warn("[gema] sin bitácora de corridas (falta la migración 20261029181941):", error.message);
      return null;
    }
    throw new Error(`abrir corrida de GEMA: ${error.message}`);
  }
  return Number(data);
}

/** Estado de una corrida según lo que devolvió cada tabla. PURO. */
export function estadoDeResultados(resultados: SyncResult[]): Exclude<EstadoCorridaGema, "corriendo" | "abandonada"> {
  if (resultados.some((r) => r.error)) return "error";
  if (resultados.some((r) => r.aviso)) return "parcial";
  return "ok";
}

/** Cierra la corrida. Nunca lanza: la sincronización ya ocurrió. */
export async function cerrarCorridaGema(
  db: Admin,
  id: number | null,
  datos: { resultados?: SyncResult[]; error?: string | null; duracionMs: number }
): Promise<void> {
  if (id == null) return;
  const resultados = datos.resultados ?? [];
  const estado = datos.error ? "error" : estadoDeResultados(resultados);
  const fallidas = resultados.filter((r) => r.error).map((r) => `${r.dataset}: ${r.error}`);
  const { error } = await db
    .from("gema_corridas")
    .update({
      estado,
      terminada_at: new Date().toISOString(),
      duracion_ms: Math.round(datos.duracionMs),
      resultados,
      error: datos.error ?? (fallidas.length ? fallidas.join(" · ").slice(0, 2000) : null),
    })
    .eq("id", id);
  if (error) console.error(`[gema] no se pudo cerrar la corrida #${id}:`, error.message);
}

/** Las últimas corridas, la más reciente primero. [] si no hay bitácora. */
export async function getUltimasCorridasGema(n = 10): Promise<CorridaGema[]> {
  const { data, error } = await createAdminClient()
    .from("gema_corridas")
    .select("*")
    .order("iniciada_at", { ascending: false })
    .limit(n);
  if (error) return [];
  return (data ?? []) as CorridaGema[];
}

/** La última corrida del cron, o null si nunca corrió (o no hay bitácora). */
export async function getUltimaCorridaCron(): Promise<CorridaGema | null> {
  const { data, error } = await createAdminClient()
    .from("gema_corridas")
    .select("*")
    .eq("origen", "cron")
    .order("iniciada_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as CorridaGema | null) ?? null;
}

/**
 * ¿Hay que avisar que el cron no corrió? El cron es diario a las 03:00; si la
 * última corrida automática tiene más de 26 h (o nunca hubo una desde que
 * existe la bitácora), algo lo está impidiendo. PURO.
 */
export function cronAtrasado(ultima: CorridaGema | null, ahora: Date, bitacoraDesde: string | null): boolean {
  const limite = ahora.getTime() - 26 * 3600_000;
  if (ultima) return new Date(ultima.iniciada_at).getTime() < limite;
  // Sin ninguna del cron: solo es alarma si la bitácora ya lleva más de 26 h.
  return bitacoraDesde != null && new Date(bitacoraDesde).getTime() < limite;
}
