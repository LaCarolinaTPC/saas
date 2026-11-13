/**
 * Operativo › Rutas: cruce de la posición GPS en vivo con el trazado KML.
 * Lógica pura, compartida por servidor y cliente.
 *
 * La ruta es UNA línea que va y vuelve, así que en las calles de doble
 * sentido la ida y la vuelta se superponen. Para no confundirlas se usa el
 * rumbo del GPS: entre los tramos cercanos se prefiere el que lleva la misma
 * dirección que el bus. El avance (km recorridos) sale de ese tramo.
 */
import { distPuntoSegmento, distanciaM, proyector, type Coord } from "./rutas-kml-reglas";

export type EstadoBusRuta =
  | "en_ruta"
  | "desviado"
  | "sentido_contrario"
  | "sin_kml"
  | "fuera_de_viaje"
  | "sin_programacion"
  | "sin_posicion"
  | "sin_senal";

export const ETIQUETA_ESTADO: Record<EstadoBusRuta, string> = {
  en_ruta: "En ruta",
  desviado: "Desviado",
  sentido_contrario: "Sentido contrario",
  sin_kml: "Ruta sin KML",
  fuera_de_viaje: "Fuera de viaje",
  sin_programacion: "Sin ruta hoy",
  sin_posicion: "Sin posición",
  sin_senal: "Sin señal reciente",
};

/** Por debajo de esta velocidad el rumbo del GPS no es confiable. */
export const VELOCIDAD_MIN_RUMBO_KPH = 5;
/** Diferencia máxima entre rumbo del bus y dirección del tramo. */
export const DIF_RUMBO_MAX_GRADOS = 60;
/** Una posición más vieja que esto se considera sin señal. */
export const SENAL_MAX_MIN = 10;
/** Radio en que se buscan tramos candidatos para decidir el sentido. */
const RADIO_CANDIDATOS_M = 60;

/** Línea preparada una vez para consultar muchas posiciones. */
export interface LineaIndexada {
  coords: Coord[];
  /** Metros acumulados hasta cada vértice. */
  acumM: number[];
  /** Rumbo (0 = norte, horario) de cada tramo i→i+1. */
  rumbos: number[];
  latRef: number;
}

/** Rumbo inicial de A hacia B, en grados [0, 360). */
export function rumbo(a: Coord, b: Coord): number {
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Diferencia angular mínima, en [0, 180]. */
export function difAngular(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function indexarLinea(coords: Coord[]): LineaIndexada {
  const acumM = [0];
  const rumbos: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    acumM.push(acumM[i - 1] + distanciaM(coords[i - 1], coords[i]));
    rumbos.push(rumbo(coords[i - 1], coords[i]));
  }
  const latRef = coords.reduce((s, c) => s + c[1], 0) / Math.max(1, coords.length);
  return { coords, acumM, rumbos, latRef };
}

export interface Proyeccion {
  /** Distancia del bus a la línea, en metros. */
  distanciaM: number;
  /** Metros recorridos sobre la línea hasta el punto proyectado. */
  avanceM: number;
  /** Índice del tramo elegido. */
  tramo: number;
  /** El rumbo del bus coincide con el tramo (null si no se pudo evaluar). */
  sentidoOk: boolean | null;
}

/**
 * Proyecta un punto sobre la línea. Si hay rumbo confiable, entre los tramos
 * a menos de RADIO_CANDIDATOS_M prefiere el más cercano en el mismo sentido.
 */
export function proyectar(
  linea: LineaIndexada,
  punto: Coord,
  rumboBus: number | null = null,
  velocidadKph: number | null = null
): Proyeccion {
  const p = proyector(linea.latRef);
  const xy = p(punto);
  const usarRumbo = rumboBus != null && (velocidadKph ?? 0) >= VELOCIDAD_MIN_RUMBO_KPH;

  let mejor = { d: Infinity, t: 0, i: 0 };
  let mejorSentido = { d: Infinity, t: 0, i: -1 };
  let a = p(linea.coords[0]);
  for (let i = 0; i < linea.coords.length - 1; i++) {
    const b = p(linea.coords[i + 1]);
    const { d, t } = distPuntoSegmento(xy, a, b);
    if (d < mejor.d) mejor = { d, t, i };
    if (usarRumbo && difAngular(rumboBus!, linea.rumbos[i]) <= DIF_RUMBO_MAX_GRADOS && d < mejorSentido.d) {
      mejorSentido = { d, t, i };
    }
    a = b;
  }

  let elegido = mejor;
  let sentidoOk: boolean | null = null;
  if (usarRumbo) {
    // Un tramo en el mismo sentido, apenas más lejos que el más cercano, es el
    // que corresponde (la vuelta por el otro carril de la misma calle).
    if (mejorSentido.i >= 0 && mejorSentido.d <= mejor.d + RADIO_CANDIDATOS_M) {
      elegido = mejorSentido;
      sentidoOk = true;
    } else {
      sentidoOk = false;
    }
  }

  const largo = linea.acumM[elegido.i + 1] - linea.acumM[elegido.i];
  return {
    distanciaM: elegido.d,
    avanceM: linea.acumM[elegido.i] + elegido.t * largo,
    tramo: elegido.i,
    sentidoOk,
  };
}

export interface EntradaEstado {
  /** El bus tiene ruta hoy (programada o despachada). */
  programado: boolean;
  /**
   * Va en un viaje despachado y sin llegada. Fuera de viaje (patio, entre
   * vueltas) no se juzga el desvío: sería una falsa alarma.
   */
  enViaje: boolean;
  /** Línea indexada de la ruta (null si la ruta no tiene KML vigente). */
  linea: LineaIndexada | null;
  toleranciaM: number;
  lat: number | null;
  lon: number | null;
  rumbo: number | null;
  velocidadKph: number | null;
  /** Minutos desde la última posición (null si no se sabe). */
  edadMin: number | null;
}

export interface EstadoCalculado {
  estado: EstadoBusRuta;
  proyeccion: Proyeccion | null;
}

/** Estado de un bus frente a su ruta programada. */
export function estadoBus(e: EntradaEstado): EstadoCalculado {
  if (e.lat == null || e.lon == null) return { estado: "sin_posicion", proyeccion: null };
  if (!e.programado) return { estado: "sin_programacion", proyeccion: null };
  if (!e.linea) return { estado: "sin_kml", proyeccion: null };
  const proyeccion = proyectar(e.linea, [e.lon, e.lat], e.rumbo, e.velocidadKph);
  if (e.edadMin != null && e.edadMin > SENAL_MAX_MIN) return { estado: "sin_senal", proyeccion };
  if (!e.enViaje) return { estado: "fuera_de_viaje", proyeccion };
  if (proyeccion.distanciaM > e.toleranciaM) return { estado: "desviado", proyeccion };
  if (proyeccion.sentidoOk === false) return { estado: "sentido_contrario", proyeccion };
  return { estado: "en_ruta", proyeccion };
}

// ── Viaje actual del bus ────────────────────────────────────────────────────

/** Fila de `historico_despacho` del día para un bus. */
export interface ViajeDespacho {
  viaje: number | null;
  hora_despacho: string | null;
  hora_llegada: string | null;
  estado: string | null;
  ruta_programada: string | null;
  ruta_reprogramada: string | null;
}

export interface ViajeActual {
  /** Ruta que el bus está haciendo (la reprogramada manda). */
  ruta: string;
  viaje: number | null;
  horaDespacho: string;
  /** Despachado y todavía sin llegada (o con llegada después de `ahora`). */
  enViaje: boolean;
}

/** Estados de GEMA en los que el viaje nunca salió. */
const NO_SALIO = new Set(["POR_DESPACHAR", "NO_DESPACHADO"]);
const HORA_VACIA = (h: string | null | undefined) => !h || h.startsWith("00:00:00");

/**
 * El viaje que el bus está haciendo a la hora `ahora` («HH:MM:SS» de Bogotá):
 * el último despachado antes de esa hora. GEMA deja «00:00:00» cuando no hay
 * hora. Null si todavía no ha salido en el día.
 */
export function viajeActual(filas: ViajeDespacho[], ahora: string): ViajeActual | null {
  let mejor: ViajeDespacho | null = null;
  for (const f of filas) {
    if (NO_SALIO.has((f.estado ?? "").toUpperCase()) || HORA_VACIA(f.hora_despacho)) continue;
    if (f.hora_despacho! > ahora) continue;
    if (!mejor || f.hora_despacho! > mejor.hora_despacho!) mejor = f;
  }
  if (!mejor) return null;
  const ruta = (mejor.ruta_reprogramada || mejor.ruta_programada || "").trim();
  if (!ruta) return null;
  return { ruta, viaje: mejor.viaje, horaDespacho: mejor.hora_despacho!, enViaje: HORA_VACIA(mejor.hora_llegada) || mejor.hora_llegada! > ahora };
}

// ── Confirmación del desvío ─────────────────────────────────────────────────

/**
 * Con una tolerancia tan fina (10 m) una sola lectura mala del GPS marcaría
 * desvío. Se confirma cuando el bus sigue fuera en este número de lecturas
 * DISTINTAS seguidas (otra fecha_hora del GPS, no el mismo dato releído).
 */
export const LECTURAS_CONFIRMAR_DESVIO = 2;

export interface Racha {
  lecturas: number;
  ultimaFechaHora: string | null;
}

const FUERA: ReadonlySet<EstadoBusRuta> = new Set(["desviado", "sentido_contrario"]);

/** Actualiza las rachas de desvío con una foto nueva de la flota. */
export function actualizarRachas(
  previas: Record<string, Racha>,
  buses: { codigo: string; estado: EstadoBusRuta; fechaHora: string | null }[]
): Record<string, Racha> {
  const out: Record<string, Racha> = {};
  for (const b of buses) {
    if (!FUERA.has(b.estado)) continue;
    const p = previas[b.codigo];
    if (!p) out[b.codigo] = { lecturas: 1, ultimaFechaHora: b.fechaHora };
    else if (p.ultimaFechaHora === b.fechaHora) out[b.codigo] = p;
    else out[b.codigo] = { lecturas: p.lecturas + 1, ultimaFechaHora: b.fechaHora };
  }
  return out;
}

export const desvioConfirmado = (r: Racha | undefined) => (r?.lecturas ?? 0) >= LECTURAS_CONFIRMAR_DESVIO;
