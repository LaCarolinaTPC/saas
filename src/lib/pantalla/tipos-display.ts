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
export const SONDEO_DISPLAY_MS = 60_000;
