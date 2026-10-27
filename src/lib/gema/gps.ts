/**
 * Sincronización del GPS de GEMA: kilometraje por bus y día, bloqueos del
 * sensor de pasajeros y eventos del GPS (sin los pings). Detalle en
 * docs/gps-gema.md.
 *
 * Dos caminos, a propósito separados:
 *   - El cron /api/cron/sync-gps (`runGps`) carga SOLO lo reciente: repasa los
 *     últimos días (GEMA completa el día anterior) o, si estuvo caído, sigue
 *     desde el último día que cargó. Su avance queda en gema_sync_state.
 *   - La carga inicial del histórico (`cargarRangoGps`) se corre una vez desde
 *     un equipo con `npm run gps:carga-inicial`, sin el límite de 300 s de
 *     Vercel y sin tocar los marcadores del cron.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callProc } from "./client";
import { toBool, toDate, toNum, toStr, toTimestamp } from "./map";
import { reemplazarDia, setState, upsertBatched } from "./sync";
import { TRAMOS_HORA, desdeReciente, diasEntre, eventoSeGuarda, kmSospechoso, tramosKm } from "./gps-reglas";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;

export type DatasetGps = "km" | "bloqueos" | "eventos";
export const DATASETS_GPS: readonly DatasetGps[] = ["km", "bloqueos", "eventos"];

/** Nombre de cada dataset en gema_sync_state (y en la pantalla de Parámetros). */
export const ESTADO_GPS: Record<DatasetGps, string> = {
  km: "gps_kilometraje",
  bloqueos: "gps_bloqueos",
  eventos: "gps_eventos",
};

/** Desde cuándo carga el histórico la carga inicial (igual que el resto de la operación de GEMA). */
export const GPS_HISTORICO_DESDE = process.env.GPS_HISTORICO_DESDE ?? "2026-01-01";

function entorno(nombre: string, defecto: number): number {
  const n = Number(process.env[nombre]);
  return process.env[nombre] != null && Number.isFinite(n) && n >= 1 ? Math.floor(n) : defecto;
}

/**
 * Por dataset: marcador en gema_sync_state y días que repasa el cron.
 *
 * Medido el 2026-10-26 desde la red local: un día de eventos tarda ~6 s en
 * GEMA (cuatro franjas, ~130.000-200.000 filas que se filtran a ~2.700-4.400);
 * bloqueos y kilometraje, menos de 2 s. Una corrida normal del cron tarda
 * menos de un minuto.
 */
const CONFIG: Record<DatasetGps, { estado: string; repaso: number }> = {
  km: { estado: "gps_kilometraje", repaso: entorno("GPS_KM_REPASO_DIAS", 7) },
  bloqueos: { estado: "gps_bloqueos", repaso: entorno("GPS_BLOQUEOS_REPASO_DIAS", 3) },
  eventos: { estado: "gps_eventos", repaso: entorno("GPS_EVENTOS_REPASO_DIAS", 2) },
};

export interface ResultadoGps {
  dataset: DatasetGps;
  /** Primer día que repasó esta corrida. */
  desde: string | null;
  /** Filas guardadas. */
  filas: number;
  error?: string;
}

async function leerMarcador(db: Admin, dataset: string): Promise<string | null> {
  const { data, error } = await db.from("gema_sync_state").select("last_synced_date").eq("dataset", dataset).maybeSingle();
  if (error) throw new Error(`gema_sync_state ${dataset}: ${error.message}`);
  if (!data) throw new Error(`Falta la fila «${dataset}» en gema_sync_state: aplique la migración del GPS.`);
  return (data.last_synced_date as string | null) ?? null;
}

// ── Lectura de GEMA ─────────────────────────────────────────────────────────

/** Kilometraje de [desde, hasta] (≤ 31 días), una fila por bus y día. */
async function traerKm(desde: string, hasta: string): Promise<Row[]> {
  const raw = await callProc("pa_ext_get_KilometrajeByFecha", [desde, hasta]);
  const porLlave = new Map<string, Row>();
  for (const r of raw) {
    const vehiculo = toStr(r.codigo_vehiculo);
    const fecha = toDate(r.fecha);
    if (!vehiculo || !fecha) continue;
    const total = toNum(r.km_total);
    porLlave.set(`${vehiculo}|${fecha}`, {
      codigo_vehiculo: vehiculo,
      fecha,
      placa: toStr(r.placa_vehiculo),
      imei: toStr(r.imei_vehiculo),
      km_inicial: toNum(r.km_inicial),
      km_final: toNum(r.km_final),
      km_total: total,
      sospechoso: kmSospechoso(total),
    });
  }
  return [...porLlave.values()];
}

/** Bloqueos y novedades del sensor de un día. */
async function traerBloqueos(dia: string): Promise<Row[]> {
  const raw = await callProc("pa_ext_get_HistoricoBloqueosByFecha", [dia]);
  const filas: Row[] = [];
  for (const r of raw) {
    // Solo filas del día pedido: el reemplazo revierte si llega una de otro.
    if (toDate(r.fecha) !== dia) continue;
    filas.push({
      fecha: dia,
      hora: toStr(r.hora),
      fecha_hora: toTimestamp(r.fecha_hora),
      codigo_vehiculo: toStr(r.codigo_vehiculo),
      placa: toStr(r.placa_vehiculo),
      direccion: toStr(r.direccion),
      cod_evento: toNum(r.cod_evento),
      evento: toStr(r.evento),
      es_critico: r.es_critico == null ? null : toBool(r.es_critico),
      velocidad_kph: toNum(r.velocidad_kph),
      latitud: toNum(r.latitud),
      longitud: toNum(r.longitud),
      registro_sensor: toNum(r.registro_sensor),
      pasajero_dia: toNum(r.pasajero_dia),
      bloqueos: toNum(r.bloqueos),
    });
  }
  return filas;
}

/**
 * Eventos de un día sin los pings, pedidos por franjas de horas para no tener
 * las ~200.000 filas del día en memoria a la vez.
 */
async function traerEventos(dia: string): Promise<{ filas: Row[]; crudas: number }> {
  const filas: Row[] = [];
  let crudas = 0;
  for (const [desde, hasta] of TRAMOS_HORA) {
    const raw = await callProc("pa_ext_get_HistoricoEventosByFecha", [dia, desde, hasta]);
    crudas += raw.length;
    for (const r of raw) {
      const cod = toNum(r.cod_evento);
      if (!eventoSeGuarda(cod) || toDate(r.fecha) !== dia) continue;
      const hora = toStr(r.hora);
      filas.push({
        fecha: dia,
        hora,
        fecha_hora: hora ? toTimestamp(`${dia} ${hora}`) : null,
        codigo_vehiculo: toStr(r.codigo_vehiculo),
        placa: toStr(r.placa_vehiculo),
        cod_evento: cod,
        evento: toStr(r.evento),
        descripcion: toStr(r.descripcion),
        velocidad_kph: toNum(r.velocidad_kph),
        direccion: toStr(r.direccion),
        latitud: toNum(r.latitud),
        longitud: toNum(r.longitud),
      });
    }
  }
  return { filas, crudas };
}

// ── Escritura de un tramo ───────────────────────────────────────────────────

async function guardarKm(db: Admin, desde: string, hasta: string): Promise<{ filas: number; ultimaFecha: string | null }> {
  const filas = await traerKm(desde, hasta);
  await upsertBatched(db, "gps_kilometraje", filas, "codigo_vehiculo,fecha");
  let ultima: string | null = null;
  for (const f of filas) if (!ultima || (f.fecha as string) > ultima) ultima = f.fecha as string;
  return { filas: filas.length, ultimaFecha: ultima };
}

/**
 * Trae y reemplaza un día de bloqueos o eventos. `exigirDatos`: un día pasado
 * sin ninguna fila en lo reciente es una falla de GEMA (la flota siempre
 * genera eventos), así que no se borra lo que ya estaba guardado.
 */
async function guardarDia(db: Admin, dataset: "bloqueos" | "eventos", dia: string, exigirDatos: boolean): Promise<number> {
  const filas = dataset === "bloqueos" ? await traerBloqueos(dia) : (await traerEventos(dia)).filas;
  if (filas.length === 0 && exigirDatos) {
    throw new Error(`GEMA devolvió 0 ${dataset} para ${dia}; no se reemplaza por precaución`);
  }
  return reemplazarDia(db, dataset === "bloqueos" ? "gps_bloqueos" : "gps_eventos", dia, filas);
}

// ── Una corrida por dataset ─────────────────────────────────────────────────

/**
 * Lo reciente de un dataset: desde `desdeReciente` hasta hoy. El primer día se
 * procesa siempre para garantizar avance; los siguientes, solo si queda tiempo
 * (importa cuando el cron estuvo caído varios días y se pone al día).
 */
async function reciente(db: Admin, dataset: DatasetGps, hoy: string, deadline: number): Promise<{ filas: number; desde: string }> {
  const cfg = CONFIG[dataset];
  const marcador = await leerMarcador(db, cfg.estado);
  const desde = desdeReciente(hoy, marcador, cfg.repaso);

  if (dataset === "km") {
    let filas = 0;
    let ultima = marcador;
    for (const t of tramosKm(desde, hoy)) {
      const r = await guardarKm(db, t.desde, t.hasta);
      filas += r.filas;
      if (r.ultimaFecha && (!ultima || r.ultimaFecha > ultima)) ultima = r.ultimaFecha;
    }
    // El marcador avanza solo hasta el último día que GEMA entregó: el de hoy
    // suele llegar al día siguiente.
    await setState(db, cfg.estado, { rows_synced: filas, status: "ok", error: null, last_synced_date: ultima });
    return { filas, desde };
  }

  let filas = 0;
  const dias = diasEntre(desde, hoy);
  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i];
    if (i > 0 && Date.now() > deadline) break;
    // Hoy puede no tener nada todavía a la hora del cron: no es una falla.
    const n = await guardarDia(db, dataset, dia, dia !== hoy);
    filas += n;
    await setState(db, cfg.estado, { rows_synced: filas, status: "ok", error: null, last_synced_date: dia });
  }
  return { filas, desde };
}

/**
 * Corrida del cron: solo lo reciente de cada dataset. Cada dataset va aislado:
 * un fallo queda en su resultado y en gema_sync_state sin detener a los demás.
 * El histórico lo carga una vez `npm run gps:carga-inicial`.
 */
export async function runGps(db: Admin, hoy: string, deadline: number, solo?: DatasetGps): Promise<ResultadoGps[]> {
  const resultados: ResultadoGps[] = [];
  for (const d of solo ? [solo] : DATASETS_GPS) {
    try {
      const r = await reciente(db, d, hoy, deadline);
      resultados.push({ dataset: d, desde: r.desde, filas: r.filas });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[gps] ${CONFIG[d].estado}:`, e);
      resultados.push({ dataset: d, desde: null, filas: 0, error: msg });
      await setState(db, CONFIG[d].estado, { status: "error", error: msg }).catch(() => undefined);
    }
  }
  // Estado del histórico de cada tabla (gps_*_historico), para Parámetros.
  for (const d of solo ? [solo] : DATASETS_GPS) await actualizarEstadoHistorico(db, d);
  return resultados;
}

/**
 * Deja en gema_sync_state (`gps_*_historico`) el estado del histórico de la
 * tabla: desde qué día hay datos (`last_synced_date`), cuántos registros
 * tiene en total (`rows_synced`) y la hora de la revisión. Lo llaman el cron,
 * el botón de Parámetros y la carga inicial. Upsert: si la fila no existe, la
 * crea. Nunca falla la corrida: el estado es informativo.
 */
export async function actualizarEstadoHistorico(db: Admin, dataset: DatasetGps): Promise<void> {
  const tabla = ESTADO_GPS[dataset];
  const estado = `${tabla}_historico`;
  try {
    const [primero, conteo] = await Promise.all([
      db.from(tabla).select("fecha").order("fecha", { ascending: true }).limit(1).maybeSingle(),
      db.from(tabla).select("*", { count: "exact", head: true }),
    ]);
    if (primero.error) throw new Error(primero.error.message);
    if (conteo.error) throw new Error(conteo.error.message);
    const { error } = await db.from("gema_sync_state").upsert(
      {
        dataset: estado,
        last_synced_date: (primero.data?.fecha as string | undefined) ?? null,
        rows_synced: conteo.count ?? 0,
        status: (conteo.count ?? 0) > 0 ? "ok" : "vacio",
        error: null,
        last_run_at: new Date().toISOString(),
      },
      { onConflict: "dataset" }
    );
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error(`[gps] ${estado}:`, e);
    await db
      .from("gema_sync_state")
      .upsert({ dataset: estado, status: "error", error: e instanceof Error ? e.message : String(e), last_run_at: new Date().toISOString() }, { onConflict: "dataset" })
      .then(
        () => undefined,
        () => undefined
      );
  }
}

/**
 * Carga exacta de [desde, hasta] sin tocar los marcadores del cron: es la
 * carga inicial del histórico (scripts/backfill-gps-gema.ts). Sin límite de
 * tiempo: corre en un equipo, no en Vercel. Un día vacío se acepta (GEMA puede
 * no tener datos tan atrás). `alAvanzar` recibe el último día ya guardado, para
 * poder retomar desde ahí si la carga se corta.
 */
export async function cargarRangoGps(
  db: Admin,
  dataset: DatasetGps,
  desde: string,
  hasta: string,
  alAvanzar?: (texto: string, guardadoHasta: string) => void
): Promise<number> {
  let filas = 0;
  if (dataset === "km") {
    for (const t of tramosKm(desde, hasta)) {
      const n = (await guardarKm(db, t.desde, t.hasta)).filas;
      filas += n;
      alAvanzar?.(`km ${t.desde} … ${t.hasta}: ${n} filas`, t.hasta);
    }
    return filas;
  }
  for (const dia of diasEntre(desde, hasta)) {
    const n = await guardarDia(db, dataset, dia, false);
    filas += n;
    alAvanzar?.(`${dataset} ${dia}: ${n} filas`, dia);
  }
  return filas;
}
