/** Contrato de `GET /api/display` (lo comparten el handler y el cliente del TV). */

import type { Presentacion } from "./modelo";
import type { DatosWidgets } from "./datos-reglas";

export interface RespuestaDisplay {
  ok: true;
  generadoAt: string;
  /** Fecha de Bogotá con la que se calcularon los datos. */
  hoy: string;
  dispositivo: { nombre: string };
  /** Sube cada vez que se publica; 0 si nunca se publicó. */
  version: number;
  /** null: el TV no tiene presentación asignada o no está publicada. */
  presentacion: Presentacion | null;
  /** "bucket/path" → URL firmada. Solo los medios que usa la presentación. */
  medios: Record<string, string>;
  datos: DatosWidgets;
  /** Minutos entre consultas de día, elegidos en Pantalla TV (15 o 30). */
  sondeoMin: number;
}

export const CLAVE_LOCAL = "gestivo.display.clave";
/**
 * Cada cuánto consulta el TV `/api/display`, de día. Cada consulta lee y escribe
 * en la base, así que el TV trabaja con su copia local (copia-local.ts) y solo
 * consulta cada 15 o 30 minutos. Una presentación publicada o un TV revocado se
 * notan en la siguiente consulta, o al pulsar «Actualizar ahora» en el TV.
 */
export const OPCIONES_SONDEO_MIN = [15, 30] as const;
export const SONDEO_DEFECTO_MIN = 15;
/** De noche (hora de Colombia) casi nadie mira el TV: siempre el intervalo largo. */
export const SONDEO_DISPLAY_NOCHE_MS = 30 * 60_000;
export const NOCHE_DESDE_HORA = 23;
export const NOCHE_HASTA_HORA = 4;
/** Tras un fallo no se espera el intervalo completo: un corte breve no debe dejar el TV atrasado. */
export const REINTENTO_FALLO_MS = 2 * 60_000;

/** Un valor guardado o recibido, como minutos válidos; lo demás equivale al defecto. */
export function normalizarSondeoMin(valor: unknown): number {
  const n = Number(valor);
  return (OPCIONES_SONDEO_MIN as readonly number[]).includes(n) ? n : SONDEO_DEFECTO_MIN;
}

/** Espera hasta la siguiente consulta según la hora de Colombia (PURO salvo el reloj). */
export function esperaSondeoDisplay(ahora: Date = new Date(), minutosDia: number = SONDEO_DEFECTO_MIN): number {
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(ahora));
  const noche = hora >= NOCHE_DESDE_HORA || hora < NOCHE_HASTA_HORA;
  return noche ? SONDEO_DISPLAY_NOCHE_MS : normalizarSondeoMin(minutosDia) * 60_000;
}
