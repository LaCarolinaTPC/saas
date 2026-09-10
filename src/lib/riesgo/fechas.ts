/**
 * Utilidades de fecha y aritmética del análisis de riesgo.
 *
 * Todas las fechas son cadenas ISO `AAAA-MM-DD` y se comparan como texto: el
 * orden lexicográfico coincide con el cronológico y así se evita construir
 * miles de `Date` al ventanear las series de cada conductor.
 */

const DIA = 86_400_000;

export const aFecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const aISO = (d: Date) => d.toISOString().slice(0, 10);
export const sumarDias = (iso: string, n: number) =>
  aISO(new Date(aFecha(iso).getTime() + n * DIA));
export const diasEntre = (a: string, b: string) =>
  Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / DIA);

/** Solo los dígitos: es la llave con la que se cruzan todas las fuentes. */
export const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export const media = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/** Hoy en Bogotá (UTC-5), que es el corte por defecto de una corrida. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/** Elementos de `xs` cuya fecha cae en `[desde, hasta)`. Nunca mira el futuro. */
export const enVentana = <T,>(
  xs: T[],
  fecha: (x: T) => string,
  desde: string,
  hasta: string
) => xs.filter((x) => fecha(x) >= desde && fecha(x) < hasta);
