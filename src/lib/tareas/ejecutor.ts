/**
 * El ejecutor de las tareas programadas estilo wp-cron (ver `reglas.ts`).
 *
 * `correrTareasVencidas` lo llama el latido de las páginas abiertas: corre las
 * tareas cuya hora ya pasó y que no corrieron en esta ranura. `correrTarea`
 * con `manual` lo llama el botón de cada tarea y corre aunque ya hubiera
 * corrido.
 *
 * El candado vive en la base (`bloqueada_hasta`): la tarea se toma con un
 * UPDATE condicionado, así que de varias pestañas que laten al mismo segundo
 * solo una la corre. Nunca lanza.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/operativo/constants";
import { minutosAhoraBogota } from "@/lib/biometrico/auto-pendientes";
import { CANDADO_MS, SIN_CANDADO, ranuraTrasEjecutar, vencimiento } from "./reglas";
import { TAREAS, type Tarea } from "./registro";

const TABLA = "tareas_programadas";

export interface EjecucionTarea {
  id: string;
  /** Si corrió en esta llamada. */
  corrio: boolean;
  /** Por qué no corrió, si no corrió. */
  motivo?: string;
  resultado?: Record<string, unknown>;
  error?: string;
}

type Db = ReturnType<typeof createAdminClient>;

/**
 * Toma el candado. Devuelve la ranura anotada si lo consiguió, o null si otra
 * pestaña la tiene o (en automático) la ranura ya se corrió.
 */
async function tomar(db: Db, id: string, ranura: string | null): Promise<string | null> {
  // La fila puede no existir si la tarea es nueva: se crea vacía.
  await db.from(TABLA).upsert({ id }, { onConflict: "id", ignoreDuplicates: true });
  const ahora = new Date();
  let q = db
    .from(TABLA)
    .update({ bloqueada_hasta: new Date(ahora.getTime() + CANDADO_MS).toISOString(), updated_at: ahora.toISOString() })
    .eq("id", id)
    .lt("bloqueada_hasta", ahora.toISOString());
  if (ranura) q = q.neq("ultima_ranura", ranura);
  const { data, error } = await q.select("ultima_ranura");
  if (error) throw new Error(error.message);
  const fila = (data ?? [])[0] as { ultima_ranura: string } | undefined;
  return fila ? fila.ultima_ranura : null;
}

async function ejecutar(
  db: Db,
  tarea: Tarea,
  opciones: { manual: boolean; usuario?: string | null; hoy: string; hora: string; ranuraAuto: string | null }
): Promise<EjecucionTarea> {
  const previa = await tomar(db, tarea.id, opciones.ranuraAuto);
  if (previa === null) {
    return { id: tarea.id, corrio: false, motivo: opciones.manual ? "en_curso" : "ya_corrio" };
  }

  let resultado: Record<string, unknown> | undefined;
  let error: string | undefined;
  try {
    resultado = await tarea.ejecutar({ hoy: opciones.hoy, manual: opciones.manual });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[tareas] ${tarea.id}:`, error);
  }

  // Con error la ranura NO se gasta: el siguiente latido lo reintenta.
  const ranura = error
    ? previa
    : ranuraTrasEjecutar({
        hoy: opciones.hoy,
        ahoraMinutos: minutosAhoraBogota(),
        hora: opciones.hora,
        manual: opciones.manual,
        ranuraPrevia: previa,
      });
  const { error: errGuardar } = await db
    .from(TABLA)
    .update({
      ultima_ranura: ranura,
      ultima_ejecucion: new Date().toISOString(),
      ultimo_origen: opciones.manual ? "manual" : "automatico",
      ultimo_usuario: opciones.usuario ?? null,
      ultimo_resultado: resultado ?? null,
      ultimo_error: error ?? null,
      bloqueada_hasta: SIN_CANDADO,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tarea.id);
  if (errGuardar) console.error(`[tareas] guardar ${tarea.id}:`, errGuardar.message);

  return { id: tarea.id, corrio: true, resultado, error };
}

/** Lo que hace un latido: corre las tareas vencidas. Nunca lanza. */
export async function correrTareasVencidas(): Promise<EjecucionTarea[]> {
  const salida: EjecucionTarea[] = [];
  let db: Db;
  let estados: Map<string, string>;
  try {
    db = createAdminClient();
    const { data, error } = await db.from(TABLA).select("id, ultima_ranura");
    if (error) throw new Error(error.message);
    estados = new Map(((data ?? []) as { id: string; ultima_ranura: string }[]).map((f) => [f.id, f.ultima_ranura]));
  } catch (e) {
    // Lo normal si la migración no se ha aplicado: no hay nada que hacer.
    console.error("[tareas] leer estado:", e instanceof Error ? e.message : e);
    return salida;
  }

  const hoy = hoyBogota();
  const ahoraMinutos = minutosAhoraBogota();
  for (const tarea of TAREAS) {
    try {
      const { hora, activa } = await tarea.programacion();
      const v = vencimiento({ hoy, ahoraMinutos, hora, activa, ultimaRanura: estados.get(tarea.id) });
      if (!v.vence) {
        salida.push({ id: tarea.id, corrio: false, motivo: v.motivo });
        continue;
      }
      salida.push(await ejecutar(db, tarea, { manual: false, hoy, hora, ranuraAuto: v.ranura }));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[tareas] ${tarea.id}:`, error);
      salida.push({ id: tarea.id, corrio: false, error });
    }
  }
  return salida;
}

/** Corre una tarea ya, aunque haya corrido en esta ranura. Nunca lanza. */
export async function correrTareaManual(id: string, usuario: string | null): Promise<EjecucionTarea> {
  const tarea = TAREAS.find((t) => t.id === id);
  if (!tarea) return { id, corrio: false, error: "Tarea desconocida." };
  try {
    const { hora } = await tarea.programacion();
    return await ejecutar(createAdminClient(), tarea, { manual: true, usuario, hoy: hoyBogota(), hora, ranuraAuto: null });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[tareas] ${id} (manual):`, error);
    return { id, corrio: false, error };
  }
}
