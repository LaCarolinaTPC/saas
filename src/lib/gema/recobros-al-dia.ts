/**
 * Mantener al día, durante la jornada, lo que necesitan las pantallas de
 * revisión de recobros: los abonos «REVISIÓN CÁMARA» (de ahí nacen las
 * solicitudes a Cámaras), las timbradas del despacho y el pasaje del recaudo.
 *
 * El cron de GEMA corre una vez al día (03:00) y Vercel Hobby no admite crons
 * más seguidos, así que un abono registrado hoy llegaría a Cámaras mañana y
 * la meta de 1 día hábil ya estaría perdida. Por eso, como en Marcaciones
 * (`despacho-al-dia.ts`), el dato se trae cuando alguien abre la pantalla si
 * tiene más de 15 minutos, o cuando pulsa «Actualizar desde GEMA».
 *
 * Trae hoy y ayer: un abono puede registrarse pasada la medianoche y GEMA
 * entrega los abonos por el día en que se registraron.
 *
 * El despacho va por `refrescarDespachoDelDia`, que tiene su propio candado:
 * si Marcaciones y Cámaras lo pidieran a la vez sin él, las dos reemplazarían
 * el mismo día y una podría borrar lo que la otra acababa de insertar.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/operativo/constants";
import { sincronizarSolicitudesDesdeAbonos, type ResultadoAbonos } from "@/lib/tesoreria/recobros-solicitudes";
import { refrescarDespachoDelDia } from "./despacho-al-dia";
import { syncAbonos, syncViajesRecaudados } from "./sync";

/** Fila propia en gema_sync_state: su `last_run_at` es la hora y el candado. */
const DATASET = "recobros_al_dia";
export const EDAD_MAXIMA_MIN = 15;
const SEGUNDOS_EN_CURSO = 30;

export interface RefrescoRecobros {
  refrescado: boolean;
  actualizadoAt: string | null;
  edadMin: number | null;
  motivo?: "está fresco" | "lo está trayendo otro" | "falló GEMA";
  solicitudes?: ResultadoAbonos;
  ms?: number;
  error?: string;
}

function edadEnMinutos(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 60_000));
}

function menosUnDia(fecha: string): string {
  const t = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  return new Date(t - 86_400_000).toISOString().slice(0, 10);
}

/** Cuándo se trajo por última vez (para mostrarlo sin refrescar). */
export async function ultimaActualizacionRecobros(): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("gema_sync_state").select("last_run_at").eq("dataset", DATASET).maybeSingle();
  return (data?.last_run_at as string | null) ?? null;
}

/**
 * Trae de GEMA los abonos, el despacho y el recaudo de hoy y ayer, y abre las
 * solicitudes de los abonos nuevos. Respeta la ventana de 15 minutos salvo
 * con `forzar`. **Nunca lanza**: si GEMA falla, la pantalla sigue con lo
 * guardado y muestra el error.
 */
export async function refrescarRecobrosDelDia(opciones: { forzar?: boolean } = {}): Promise<RefrescoRecobros> {
  const db = createAdminClient();
  // La fila del candado se crea la primera vez; el candado es el UPDATE con condición.
  await db.from("gema_sync_state").upsert({ dataset: DATASET }, { onConflict: "dataset", ignoreDuplicates: true });

  const antes = await ultimaActualizacionRecobros();
  const edad = edadEnMinutos(antes);
  if (!opciones.forzar && edad !== null && edad < EDAD_MAXIMA_MIN) {
    return { refrescado: false, actualizadoAt: antes, edadMin: edad, motivo: "está fresco" };
  }

  const umbral = new Date(Date.now() - SEGUNDOS_EN_CURSO * 1000).toISOString();
  const { data: ganado, error: errorCandado } = await db
    .from("gema_sync_state")
    .update({ last_run_at: new Date().toISOString(), status: "running" })
    .eq("dataset", DATASET)
    .or(`last_run_at.is.null,last_run_at.lt.${umbral}`)
    .select("dataset");
  if (errorCandado) {
    return { refrescado: false, actualizadoAt: antes, edadMin: edad, motivo: "falló GEMA", error: errorCandado.message };
  }
  if (!ganado?.length) return { refrescado: false, actualizadoAt: antes, edadMin: edad, motivo: "lo está trayendo otro" };

  const arranque = Date.now();
  const hoy = hoyBogota();
  const ayer = menosUnDia(hoy);
  try {
    const [despacho] = await Promise.all([
      refrescarDespachoDelDia(hoy, hoy, { forzar: opciones.forzar }),
      syncAbonos(db, ayer, hoy),
      syncViajesRecaudados(db, ayer, hoy),
    ]);
    if (despacho.error) console.warn("[recobros] despacho del día sin refrescar:", despacho.error);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[recobros] no se pudo refrescar desde GEMA:", error);
    await db.from("gema_sync_state").update({ last_run_at: antes, status: "error", error }).eq("dataset", DATASET);
    return { refrescado: false, actualizadoAt: antes, edadMin: edad, motivo: "falló GEMA", ms: Date.now() - arranque, error };
  }

  const solicitudes = await sincronizarSolicitudesDesdeAbonos(ayer, hoy);
  const ahora = new Date().toISOString();
  await db
    .from("gema_sync_state")
    .update({ last_run_at: ahora, status: solicitudes.error ? "error" : "idle", error: solicitudes.error ?? null })
    .eq("dataset", DATASET);
  return { refrescado: true, actualizadoAt: ahora, edadMin: 0, solicitudes, ms: Date.now() - arranque, error: solicitudes.error };
}
