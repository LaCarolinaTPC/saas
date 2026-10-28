/**
 * Reglas PURAS de la sincronización del GPS de GEMA (kilometraje, bloqueos del
 * sensor y eventos). Sin E/S: se prueban con node --test (`npm run test:gps`).
 * La parte que habla con GEMA y Supabase está en `gps.ts`.
 */

/**
 * Eventos que NO se guardan. Lista de descarte (no de permitidos) para que un
 * código nuevo que agregue GEMA se guarde y se pueda ver:
 *   0   Modo de estacionamiento (ping con el bus quieto)
 *   1   Modo de conducción (ping cada pocos segundos: el 94 % del día)
 *   100 Over Speed PolyGeo-Fence   ┐ geocerca de velocidad; los excesos ya
 *   101 Under Speed PolyGeoFence   ┘ están en `velocidades`
 * Con esto un día pasa de ~200.000 filas a ~4.400.
 */
export const EVENTOS_DESCARTADOS: ReadonlySet<number> = new Set([0, 1, 100, 101]);

export function eventoSeGuarda(cod: number | null): boolean {
  return cod != null && !EVENTOS_DESCARTADOS.has(cod);
}

/** Más de esto en un día no es un recorrido sino un salto del odómetro. */
export const KM_DIA_MAXIMO = 600;

export function kmSospechoso(total: number | null): boolean {
  return total != null && (total < 0 || total > KM_DIA_MAXIMO);
}

/**
 * Franjas del día para pedir los eventos. GEMA incluye ambos extremos del rango
 * de horas, así que no se solapan. Cuatro llamadas en vez de una para no tener
 * las ~200.000 filas del día en memoria a la vez.
 */
export const TRAMOS_HORA: readonly (readonly [string, string])[] = [
  ["00:00:00", "05:59:59"],
  ["06:00:00", "11:59:59"],
  ["12:00:00", "17:59:59"],
  ["18:00:00", "23:59:59"],
];

/** GEMA rechaza rangos de kilometraje de más de 31 días. */
export const MAX_DIAS_KM = 31;

/** Suma `delta` días a una fecha 'AAAA-MM-DD'. */
export function sumarDias(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Días de [desde, hasta], ambos incluidos. */
export function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d);
  return out;
}

/**
 * Desde dónde repasar lo reciente: los últimos `diasRepaso` días (incluido
 * hoy) o, si el cron estuvo caído, desde el último día que alcanzó a cargar.
 */
export function desdeReciente(hoy: string, marcador: string | null, diasRepaso: number): string {
  const repaso = sumarDias(hoy, -(Math.max(1, diasRepaso) - 1));
  return marcador && marcador < repaso ? marcador : repaso;
}

/** Parte [desde, hasta] en tramos de como mucho 31 días, en orden. */
export function tramosKm(desde: string, hasta: string): { desde: string; hasta: string }[] {
  const out: { desde: string; hasta: string }[] = [];
  for (let a = desde; a <= hasta; a = sumarDias(a, MAX_DIAS_KM)) {
    const b = sumarDias(a, MAX_DIAS_KM - 1);
    out.push({ desde: a, hasta: b < hasta ? b : hasta });
  }
  return out;
}

// ── Últimas posiciones de la flota (pa_ext_get_UltimasPosiciones) ──────────

/**
 * Cuánto lleva un bus sin reportar, en minutos, para clasificarlo. El GPS
 * reporta cada pocos segundos mientras el bus anda y cada pocos minutos
 * parqueado; más de 2 horas en silencio ya es raro, y más de un día es un
 * equipo caído o un bus fuera de servicio.
 */
export const UMBRAL_REPORTE_MIN = { alDia: 15, atrasado: 120, sinReportar: 24 * 60 } as const;

export type EstadoReporte = "al_dia" | "atrasado" | "sin_reportar" | "caido";

export const ESTADO_REPORTE_LABEL: Record<EstadoReporte, string> = {
  al_dia: "Al día (≤ 15 min)",
  atrasado: "Atrasado (15 min a 2 h)",
  sin_reportar: "Sin reportar (2 a 24 h)",
  caido: "Caído (más de 1 día)",
};

/** «AAAA-MM-DD HH:MM:SS» de un reloj local (sin zona) a minutos absolutos. */
function minutosLocal(fechaHora: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(fechaHora.trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) / 60_000;
}

/**
 * Minutos entre el último reporte y `ahora`, los dos en hora de Colombia sin
 * zona (como los entrega GEMA). null si alguna fecha no se entiende.
 */
export function minutosSinReportar(fechaHora: string | null | undefined, ahora: string): number | null {
  if (!fechaHora) return null;
  const a = minutosLocal(fechaHora);
  const b = minutosLocal(ahora);
  if (a === null || b === null) return null;
  return Math.max(0, Math.round(b - a));
}

export function estadoReporte(minutos: number | null): EstadoReporte {
  if (minutos === null) return "caido";
  if (minutos <= UMBRAL_REPORTE_MIN.alDia) return "al_dia";
  if (minutos <= UMBRAL_REPORTE_MIN.atrasado) return "atrasado";
  if (minutos <= UMBRAL_REPORTE_MIN.sinReportar) return "sin_reportar";
  return "caido";
}

/** «35 min», «3 h 10 min», «4 días». */
export function textoTiempo(minutos: number | null): string {
  if (minutos === null) return "sin dato";
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 24 * 60) {
    const h = Math.floor(minutos / 60);
    const r = minutos % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const d = Math.floor(minutos / (24 * 60));
  return `${d} día${d === 1 ? "" : "s"}`;
}

/** Una posición ya normalizada (columnas de `gps_ultimas_posiciones`). */
export interface PosicionGps {
  codigo_vehiculo: string;
  placa: string | null;
  imei: string | null;
  fecha_hora: string | null;
  fecha: string | null;
  hora: string | null;
  latitud: number | null;
  longitud: number | null;
  velocidad_kph: number | null;
  rumbo_grados: number | null;
  direccion: string | null;
  evento: string | null;
  ultimo_evento_critico: string | null;
  hora_ultimo_evento_critico: string | null;
}

const txt = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s.toLowerCase() !== "null" && s !== "N/A" ? s : null;
};
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Fila cruda de GEMA → posición; null si no trae el código del bus. */
export function mapearPosicion(r: Record<string, unknown>): PosicionGps | null {
  const codigo = txt(r.codigo_vehiculo);
  if (!codigo) return null;
  const lat = num(r.latitud);
  const lng = num(r.longitud);
  // (0, 0) es «sin posición», no un punto en el golfo de Guinea.
  const sinPunto = lat === 0 && lng === 0;
  return {
    codigo_vehiculo: codigo,
    placa: txt(r.placa_vehiculo),
    imei: txt(r.imei_vehiculo),
    fecha_hora: txt(r.fecha_hora),
    fecha: txt(r.fecha),
    hora: txt(r.hora),
    latitud: sinPunto ? null : lat,
    longitud: sinPunto ? null : lng,
    velocidad_kph: num(r.velocidad_kph),
    rumbo_grados: num(r.rumbo_degrees),
    direccion: txt(r.direccion),
    evento: txt(r.evento),
    ultimo_evento_critico: txt(r.ultimo_evento_critico),
    hora_ultimo_evento_critico: txt(r.hora_ultimo_evento_critico),
  };
}

export interface ResumenFlota {
  total: number;
  porEstado: Record<EstadoReporte, number>;
  /** Al día y con velocidad > 0. */
  enMovimiento: number;
  /** Al día y quietos (estacionados o parqueados). */
  detenidos: number;
  /** Último encendido/apagado: apagados según GEMA. */
  apagados: number;
}

export function resumirFlota(posiciones: PosicionGps[], ahora: string): ResumenFlota {
  const porEstado: Record<EstadoReporte, number> = { al_dia: 0, atrasado: 0, sin_reportar: 0, caido: 0 };
  let enMovimiento = 0;
  let detenidos = 0;
  let apagados = 0;
  for (const p of posiciones) {
    const e = estadoReporte(minutosSinReportar(p.fecha_hora, ahora));
    porEstado[e] += 1;
    if (e === "al_dia") {
      if ((p.velocidad_kph ?? 0) > 0) enMovimiento += 1;
      else detenidos += 1;
    }
    if ((p.ultimo_evento_critico ?? "").toUpperCase().includes("APAGADO")) apagados += 1;
  }
  return { total: posiciones.length, porEstado, enMovimiento, detenidos, apagados };
}

/**
 * Códigos de `gps_eventos` que entran a los KPIs (verificados el 2026-10-28
 * sobre una semana real; mismos que la función SQL `gps_kpis`).
 */
export const EVENTOS_KPI: Record<string, { label: string; grupo: "brusco" | "seguridad" }> = {
  "47": { label: "Frenada brusca", grupo: "brusco" },
  "46": { label: "Aceleración brusca", grupo: "brusco" },
  "48": { label: "Giro brusco a la izquierda", grupo: "brusco" },
  "49": { label: "Giro brusco a la derecha", grupo: "brusco" },
  "42": { label: "Botón de pánico", grupo: "seguridad" },
  "45": { label: "Batería desconectada", grupo: "seguridad" },
};

/** Por cada 100 km, con un decimal; null sin kilómetros. */
export function por100km(n: number, km: number): number | null {
  return km > 0 ? Math.round((n * 1000) / km) / 10 : null;
}
