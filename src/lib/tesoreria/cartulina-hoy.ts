/**
 * Revisión cartulina del DÍA EN CURSO, casi en tiempo real.
 *
 * Los días cerrados se leen de las tablas espejo que llena la sincronización
 * con GEMA. El día de hoy no sirve así: GEMA registra los puntos virtuales al
 * instante (5–7 s de atraso, medido) pero con números provisionales que chocan
 * con días ya guardados, y la sincronización de la mañana no trae el recaudo ni
 * los descuentos de la tarde. Esto trae, para HOY y solo para hoy:
 *
 *   - los eventos de entrada y salida del terminal, a `pv_terminal_hoy`
 *     (llave: IMEI + hora + tipo de evento, no el número provisional);
 *   - el despacho (con `refrescarDespachoDelDia`, el mismo de Marcaciones);
 *   - el recaudo y las timbradas descontadas del día.
 *
 * Se refresca al abrir la página si el dato tiene más de `EDAD_MAXIMA_MIN`, o
 * a mano con «Actualizar ahora». Un candado en `gema_sync_state`
 * (`cartulina_hoy`) evita que varias pestañas traigan lo mismo a la vez.
 * **Nunca lanza**: si GEMA falla, la página se pinta con lo guardado.
 *
 * Todo lo de hoy es PROVISIONAL: GEMA puede corregirlo al cerrar el día. La
 * pantalla lo dice («Datos sujetos al proceso de cierre de GEMA»).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { callProc } from "@/lib/gema/client";
import { toNum, toStr, toTimestamp } from "@/lib/gema/map";
import { refrescarDespachoDelDia } from "@/lib/gema/despacho-al-dia";
import { syncTimbradasDescontadas, syncViajesRecaudados } from "@/lib/gema/sync";
import { EVENTO_ENTRADA, EVENTO_SALIDA } from "./revision-timbradas-reglas";

type Db = ReturnType<typeof createAdminClient>;

/** Antigüedad máxima del dato de hoy al abrir la página. */
export const EDAD_MAXIMA_MIN = 5;
/** Una traída «en curso» de hace más de esto se da por muerta. */
const SEGUNDOS_EN_CURSO = 90;
const ESTADO = "cartulina_hoy";

export interface RefrescoCartulinaHoy {
  refrescado: boolean;
  /** Cuándo se trajo por última vez de GEMA. */
  actualizadoAt: string | null;
  motivo?: "está fresco" | "lo está trayendo otro" | "falló GEMA" | "sin tabla";
  /** Eventos del terminal de hoy guardados. */
  eventos?: number;
  ms?: number;
  error?: string;
}

const edadMin = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60_000) : null);

/**
 * Eventos del terminal del día, de lo que GEMA tiene AHORA. PURO salvo la
 * consulta: se filtra aquí porque el procedimiento no admite filtro y devuelve
 * todo el día (~140.000 filas al cierre); se queda con unos 2.000.
 */
export function filasTerminal(raw: Record<string, unknown>[], hoy: string) {
  const porLlave = new Map<string, Record<string, unknown>>();
  for (const r of raw) {
    const descripcion = toStr(r.Descripcion);
    if (descripcion !== EVENTO_SALIDA && descripcion !== EVENTO_ENTRADA) continue;
    const base = r.isBase;
    if (!(base === 1 || base === true || base === "1")) continue;
    const imei = toStr(r.IMEI);
    const fechaHora = toTimestamp(r.FechaHora);
    const fecha = toStr(r.Fecha)?.slice(0, 10);
    if (!imei || !fechaHora || fecha !== hoy) continue;
    // GEMA repite filas idénticas; la llave natural las colapsa.
    porLlave.set(`${imei}|${fechaHora}|${descripcion}`, {
      fecha,
      imei,
      fecha_hora: fechaHora,
      descripcion,
      hora: toStr(r.Hora),
      placa: toStr(r.Vehiculo),
      codigo_vehiculo: toStr(r.Codigo),
      subidas: toNum(r.subidas),
      bajadas: toNum(r.bajadas),
      registradora: toNum(r.Registradora),
      numero_provisional: toNum(r.Numero),
    });
  }
  return [...porLlave.values()];
}

async function traerTerminalHoy(db: Db, hoy: string): Promise<number> {
  const raw = (await callProc("pa_ext_get_PuntosVirtualesByFecha", [hoy])) as Record<string, unknown>[];
  const filas = filasTerminal(raw, hoy);
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db
      .from("pv_terminal_hoy")
      .upsert(filas.slice(i, i + 500).map((f) => ({ ...f, sincronizado_at: new Date().toISOString() })), {
        onConflict: "imei,fecha_hora,descripcion",
      });
    if (error) throw new Error(`pv_terminal_hoy: ${error.message}`);
  }
  return filas.length;
}

/**
 * Borra de `pv_terminal_hoy` los días que ya llegaron cerrados a
 * `puntos_virtuales`: los anteriores al marcador de su sincronización (el día
 * del marcador puede seguir a medias).
 */
async function purgarCerrados(db: Db): Promise<void> {
  const { data } = await db.from("gema_sync_state").select("last_synced_date").eq("dataset", "puntos_virtuales").maybeSingle();
  const marcador = (data?.last_synced_date as string | null) ?? null;
  if (!marcador) return;
  const { error } = await db.from("pv_terminal_hoy").delete().lt("fecha", marcador);
  if (error) console.error("[cartulina-hoy] no se pudieron purgar los días cerrados:", error.message);
}

/** Trae de GEMA lo de hoy si el dato está viejo (o si se fuerza). Nunca lanza. */
export async function refrescarCartulinaHoy(hoy: string, opciones: { forzar?: boolean } = {}): Promise<RefrescoCartulinaHoy> {
  const db = createAdminClient();
  const { data, error: errorEstado } = await db
    .from("gema_sync_state")
    .select("last_run_at")
    .eq("dataset", ESTADO)
    .maybeSingle();
  if (errorEstado || !data) {
    // Sin la migración 20261029183325 no hay fila de estado ni tabla.
    return { refrescado: false, actualizadoAt: null, motivo: "sin tabla", error: errorEstado?.message };
  }
  const antes = (data.last_run_at as string | null) ?? null;
  const edad = edadMin(antes);
  if (!opciones.forzar && edad !== null && edad < EDAD_MAXIMA_MIN) {
    return { refrescado: false, actualizadoAt: antes, motivo: "está fresco" };
  }

  // Candado: se gana adelantando last_run_at en un solo UPDATE con condición.
  const umbral = new Date(Date.now() - SEGUNDOS_EN_CURSO * 1000).toISOString();
  const { data: ganado } = await db
    .from("gema_sync_state")
    .update({ last_run_at: new Date().toISOString(), status: "corriendo" })
    .eq("dataset", ESTADO)
    .or(`last_run_at.is.null,last_run_at.lt.${umbral}`)
    .select("dataset");
  if (!ganado || ganado.length === 0) return { refrescado: false, actualizadoAt: antes, motivo: "lo está trayendo otro" };

  const arranque = Date.now();
  const errores: string[] = [];
  let eventos = 0;
  // Cada fuente por separado: que falle una no impide las demás.
  try {
    eventos = await traerTerminalHoy(db, hoy);
  } catch (e) {
    errores.push(`terminal: ${e instanceof Error ? e.message : String(e)}`);
  }
  const despacho = await refrescarDespachoDelDia(hoy, hoy, { forzar: true });
  if (despacho.error) errores.push(`despacho: ${despacho.error}`);
  for (const [nombre, fn] of [["recaudo", syncViajesRecaudados], ["descuentos", syncTimbradasDescontadas]] as const) {
    try {
      await fn(db, hoy, hoy);
    } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await purgarCerrados(db);

  const ahora = new Date().toISOString();
  await db
    .from("gema_sync_state")
    .update({
      // Si TODO falló, se devuelve la hora anterior para no bloquear el reintento.
      last_run_at: errores.length === 4 ? antes : ahora,
      last_synced_date: hoy,
      rows_synced: eventos,
      status: errores.length ? "parcial" : "ok",
      error: errores.length ? errores.join(" · ").slice(0, 2000) : null,
    })
    .eq("dataset", ESTADO);

  return {
    refrescado: errores.length < 4,
    actualizadoAt: errores.length === 4 ? antes : ahora,
    eventos,
    ms: Date.now() - arranque,
    ...(errores.length ? { motivo: "falló GEMA" as const, error: errores.join(" · ") } : {}),
  };
}

/** Cuándo se trajo por última vez lo de hoy (para la pantalla). */
export async function actualizadoCartulinaHoy(): Promise<string | null> {
  const { data } = await createAdminClient().from("gema_sync_state").select("last_run_at").eq("dataset", ESTADO).maybeSingle();
  return (data?.last_run_at as string | null) ?? null;
}
