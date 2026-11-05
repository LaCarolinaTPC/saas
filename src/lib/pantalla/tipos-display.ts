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
}

export const CLAVE_LOCAL = "gestivo.display.clave";
/**
 * Cada cuánto consulta el TV `/api/display`. Cada consulta es una invocación de
 * función en el hosting (y Vercel cobra o pausa por invocaciones), así que no
 * se consulta más seguido de lo que cambian los datos: los widgets se cachean
 * de 5 a 60 minutos (src/lib/pantalla/datos.ts). Una presentación publicada o
 * un TV revocado se notan en el siguiente sondeo.
 */
export const SONDEO_DISPLAY_MS = 5 * 60_000;
/** De noche (hora de Colombia) casi nadie mira el TV: se consulta mucho menos. */
export const SONDEO_DISPLAY_NOCHE_MS = 30 * 60_000;
export const NOCHE_DESDE_HORA = 23;
export const NOCHE_HASTA_HORA = 4;

/** Espera hasta el siguiente sondeo según la hora de Colombia (PURO salvo el reloj). */
export function esperaSondeoDisplay(ahora: Date = new Date()): number {
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(ahora));
  const noche = hora >= NOCHE_DESDE_HORA || hora < NOCHE_HASTA_HORA;
  return noche ? SONDEO_DISPLAY_NOCHE_MS : SONDEO_DISPLAY_MS;
}
