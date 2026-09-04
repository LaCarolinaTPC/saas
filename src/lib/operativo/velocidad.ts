/** Exceso de velocidad — capa de datos (solo servidor). */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PARAMETROS_DEFECTO, type Incidencia, type ParametrosVelocidad, type ReporteRrhh,
} from "./velocidad-reglas";

/** Parámetros vigentes; si la migración no está aplicada, los de defecto. */
export async function getParametrosVelocidad(): Promise<ParametrosVelocidad> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("operativo_velocidad_parametros")
    .select("umbral_kmh, minimo_incidencias, minutos_agrupacion, updated_by_email, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return PARAMETROS_DEFECTO;
  return {
    umbralKmh: Number(data.umbral_kmh),
    minimoIncidencias: Number(data.minimo_incidencias),
    minutosAgrupacion: Number(data.minutos_agrupacion),
    updatedByEmail: data.updated_by_email,
    updatedAt: data.updated_at,
  };
}

interface IncidenciaRaw {
  codigo_vehiculo: string;
  inicio: string;
  fin: string;
  eventos: number;
  velocidad_max: number | string;
  velocidad_prom: number | string | null;
  latitud: number | null;
  longitud: number | null;
  direccion: string | null;
  cedula_conductor: string | null;
  codigo_conductor: string | null;
  conductor_nombre: string | null;
  ruta: string | null;
  viaje_numero: number | string | null;
  hora_despacho: string | null;
  hora_llegada: string | null;
}

/** Incidencias del rango (fechas inclusivas) con los parámetros dados. */
export async function getIncidenciasVelocidad(
  desde: string,
  hasta: string,
  p: ParametrosVelocidad
): Promise<Incidencia[]> {
  const db = createAdminClient();
  // PostgREST recorta cada respuesta a 1.000 filas (max-rows de la instancia)
  // e ignora el encabezado Range en las funciones, así que la base devuelve
  // las incidencias como un solo JSON (una fila, sin tope). Un mes son
  // ~12.000 incidencias, unos 5 MB.
  const { data, error } = await db.rpc("get_incidencias_velocidad_json", {
    p_desde: desde,
    p_hasta: hasta,
    p_umbral: p.umbralKmh,
    p_minutos: p.minutosAgrupacion,
  });
  if (error) throw new Error(`Incidencias de velocidad: ${error.message}`);
  const filas = (Array.isArray(data) ? data : []) as IncidenciaRaw[];
  return filas.map((r) => {
    // Postgres devuelve TIMESTAMP sin zona: "2026-09-04T15:04:13".
    const inicio = String(r.inicio).slice(0, 19);
    const fin = String(r.fin).slice(0, 19);
    return {
      id: `${r.codigo_vehiculo}|${inicio}`,
      vehiculo: r.codigo_vehiculo,
      inicio,
      fin,
      fecha: inicio.slice(0, 10),
      eventos: Number(r.eventos),
      velocidadMax: Number(r.velocidad_max),
      velocidadProm: r.velocidad_prom == null ? null : Number(r.velocidad_prom),
      latitud: r.latitud,
      longitud: r.longitud,
      direccion: r.direccion,
      cedula: r.cedula_conductor,
      codigo: r.codigo_conductor,
      nombre: r.conductor_nombre,
      ruta: r.ruta,
      viaje: r.viaje_numero == null ? null : Number(r.viaje_numero),
      horaDespacho: r.hora_despacho,
      horaLlegada: r.hora_llegada,
    };
  });
}

export const REPORTE_SELECT =
  "id, cedula, codigo, nombre, semana_desde, semana_hasta, incidencias, velocidad_max, " +
  "reportado_en, observaciones, created_by_email, created_at";

interface ReporteRaw {
  id: string; cedula: string; codigo: string | null; nombre: string;
  semana_desde: string; semana_hasta: string; incidencias: number; velocidad_max: number | string | null;
  reportado_en: string; observaciones: string | null; created_by_email: string | null; created_at: string;
}

export function mapReporte(r: ReporteRaw): ReporteRrhh {
  return {
    id: r.id,
    cedula: r.cedula,
    codigo: r.codigo,
    nombre: r.nombre,
    semanaDesde: r.semana_desde,
    semanaHasta: r.semana_hasta,
    incidencias: Number(r.incidencias),
    velocidadMax: r.velocidad_max == null ? null : Number(r.velocidad_max),
    reportadoEn: r.reportado_en,
    observaciones: r.observaciones,
    createdByEmail: r.created_by_email,
    createdAt: r.created_at,
  };
}

/** Reportes a RRHH vigentes (no anulados) cuya semana toca el rango. */
export async function getReportesVelocidad(desde: string, hasta: string): Promise<ReporteRrhh[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("operativo_velocidad_reportes")
    .select(REPORTE_SELECT)
    .is("anulada_en", null)
    .lte("semana_desde", hasta)
    .gte("semana_hasta", desde)
    .order("semana_desde");
  if (error) return [];
  // El select es una cadena compuesta: el tipado de supabase-js no la interpreta.
  return ((data ?? []) as unknown as ReporteRaw[]).map(mapReporte);
}

/** Primer y último día con eventos de velocidad, para avisar el alcance del histórico. */
export async function getRangoDatosVelocidad(): Promise<{ desde: string | null; hasta: string | null }> {
  const db = createAdminClient();
  const [min, max] = await Promise.all([
    db.from("velocidades").select("fecha").order("fecha", { ascending: true }).limit(1).maybeSingle(),
    db.from("velocidades").select("fecha").order("fecha", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { desde: (min.data?.fecha as string | undefined) ?? null, hasta: (max.data?.fecha as string | undefined) ?? null };
}
