/**
 * Datos de Operativo › GPS de la flota. Solo servidor.
 *
 *  - Posiciones: EN VIVO de GEMA (`pa_ext_get_UltimasPosiciones`). Si GEMA no
 *    responde, la copia `gps_ultimas_posiciones` que refresca el cron local
 *    cada 5 minutos, diciendo de cuándo es.
 *  - KPIs del periodo: función SQL `gps_kpis` sobre gps_kilometraje,
 *    gps_eventos y gps_bloqueos (migración 20261028210048).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ultimasPosicionesEnVivo } from "@/lib/gema/gps";
import type { PosicionGps } from "@/lib/gema/gps-reglas";

export interface PosicionesFlota {
  posiciones: PosicionGps[];
  /** De dónde salieron: GEMA en vivo o la copia del espejo. */
  fuente: "vivo" | "copia" | "ninguna";
  /** Cuándo se leyeron de GEMA (UTC real). */
  leidoAt: string | null;
  error: string | null;
}

export async function getPosicionesFlota(): Promise<PosicionesFlota> {
  let errorVivo: string;
  try {
    const { posiciones, leidoAt } = await ultimasPosicionesEnVivo();
    return { posiciones, fuente: "vivo", leidoAt, error: null };
  } catch (e) {
    errorVivo = e instanceof Error ? e.message : String(e);
    console.warn("[gps] últimas posiciones en vivo:", errorVivo);
  }
  const { data, error } = await createAdminClient().from("gps_ultimas_posiciones").select("*");
  if (error || !data?.length) {
    return {
      posiciones: [],
      fuente: "ninguna",
      leidoAt: null,
      error: `GEMA no respondió (${errorVivo})${error ? ` y la copia no se pudo leer (${error.message})` : " y todavía no hay copia"}.`,
    };
  }
  const leidoAt = data.reduce<string | null>((m, r) => (!m || String(r.actualizado_at) > m ? String(r.actualizado_at) : m), null);
  return {
    posiciones: data.map((r) => ({
      codigo_vehiculo: String(r.codigo_vehiculo),
      placa: r.placa ?? null,
      imei: r.imei ?? null,
      fecha_hora: r.fecha_hora ? String(r.fecha_hora).replace("T", " ").slice(0, 19) : null,
      fecha: r.fecha ?? null,
      hora: r.hora ?? null,
      latitud: r.latitud ?? null,
      longitud: r.longitud ?? null,
      velocidad_kph: r.velocidad_kph == null ? null : Number(r.velocidad_kph),
      rumbo_grados: r.rumbo_grados == null ? null : Number(r.rumbo_grados),
      direccion: r.direccion ?? null,
      evento: r.evento ?? null,
      ultimo_evento_critico: r.ultimo_evento_critico ?? null,
      hora_ultimo_evento_critico: r.hora_ultimo_evento_critico ?? null,
    })),
    fuente: "copia",
    leidoAt,
    error: `GEMA no respondió (${errorVivo}); se muestra la última copia.`,
  };
}

export interface BusKpi {
  codigo_vehiculo: string;
  km: number;
  bruscos: number;
  frenadas: number;
  sensor_criticos: number;
  bruscos_100km: number | null;
}

export interface KpisGps {
  desde: string;
  hasta: string;
  km: { total: number; buses: number; bus_dias: number; sospechosos: number };
  /** Conteo por código de evento (ver EVENTOS_KPI). */
  eventos: Record<string, number>;
  sensor: { evento: string; critico: boolean; n: number }[];
  por_dia: { fecha: string; km: number; bruscos: number; sensor_criticos: number }[];
  top_bruscos: BusKpi[];
  top_sensor: BusKpi[];
}

/** KPIs del periodo; lanza si falta la migración (la pantalla lo dice). */
export async function getKpisGps(desde: string, hasta: string): Promise<KpisGps> {
  const { data, error } = await createAdminClient().rpc("gps_kpis", { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message);
  const k = data as KpisGps;
  return {
    ...k,
    km: {
      total: Number(k.km?.total ?? 0),
      buses: Number(k.km?.buses ?? 0),
      bus_dias: Number(k.km?.bus_dias ?? 0),
      sospechosos: Number(k.km?.sospechosos ?? 0),
    },
    eventos: k.eventos ?? {},
    sensor: k.sensor ?? [],
    por_dia: (k.por_dia ?? []).map((d) => ({ ...d, km: Number(d.km), bruscos: Number(d.bruscos), sensor_criticos: Number(d.sensor_criticos) })),
    top_bruscos: k.top_bruscos ?? [],
    top_sensor: k.top_sensor ?? [],
  };
}
