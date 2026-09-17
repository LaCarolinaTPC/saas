/**
 * Conceptos que cubren un rango de días (bandera `cubre_rango` del catálogo).
 *
 * Un registro normal es un conductor ausente UN día: la pantalla lo busca por
 * `fecha`. Unas vacaciones se diligencian una sola vez con su inicio y su
 * terminación, y el conductor debe presentarse como ausente todos los días del
 * periodo sin que nadie lo vuelva a agregar como novedad.
 *
 * Invariante que sostiene todo lo de aquí: en un concepto con `cubre_rango`,
 * `fecha` (el día operativo) es siempre `fecha_inicio`. Lo fuerza el formulario
 * al guardar y lo dejó así la migración para lo ya registrado, de modo que el
 * registro nunca quede escondido fuera de su propio rango.
 *
 * Parte pura, sin Supabase: se usa igual en el servidor y en el cliente.
 */

import { diasEntre, type Concepto } from "./constants";

/** Lo mínimo de un registro para ubicarlo en el calendario. */
export interface RegistroConPeriodo {
  fecha: string;
  tipo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

/** Claves del catálogo que cubren un rango. Hoy solo "vacaciones". */
export function clavesPeriodicas(conceptos: Concepto[]): Set<string> {
  return new Set(conceptos.filter((c) => c.cubre_rango).map((c) => c.key));
}

/**
 * Rango que ocupa el registro en el calendario, o `null` si su concepto no
 * cubre rango. Sin fecha de terminación cubre solo su día de inicio: nada se
 * expande hasta que RRHH escriba el fin.
 */
export function periodoDe(
  r: RegistroConPeriodo,
  periodicas: Set<string>
): { inicio: string; fin: string } | null {
  if (!periodicas.has(r.tipo)) return null;
  const inicio = r.fecha_inicio ?? r.fecha;
  return { inicio, fin: r.fecha_fin ?? inicio };
}

/**
 * Si el registro debe aparecer en la lista de ese día. Un concepto que no
 * cubre rango se sigue viendo solo en su día, exactamente como antes.
 */
export function cubreDia(
  r: RegistroConPeriodo,
  dia: string,
  periodicas: Set<string>
): boolean {
  const p = periodoDe(r, periodicas);
  if (!p) return r.fecha === dia;
  return p.inicio <= dia && dia <= p.fin;
}

/** El registro empieza ese día (no viene corriendo de días anteriores). */
export function empiezaEn(
  r: RegistroConPeriodo,
  dia: string,
  periodicas: Set<string>
): boolean {
  const p = periodoDe(r, periodicas);
  return p ? p.inicio === dia : r.fecha === dia;
}

/**
 * Posición del día dentro del periodo, para el distintivo "día 3 de 16".
 * `null` cuando el concepto no cubre rango, cuando el periodo dura un solo día
 * o cuando el día queda fuera.
 */
export function posicionEnPeriodo(
  r: RegistroConPeriodo,
  dia: string,
  periodicas: Set<string>
): { dia: number; total: number } | null {
  const p = periodoDe(r, periodicas);
  if (!p || dia < p.inicio || dia > p.fin) return null;
  const total = diasEntre(p.inicio, p.fin) + 1;
  if (total <= 1) return null;
  return { dia: diasEntre(p.inicio, dia) + 1, total };
}

/** Dos rangos se traslapan (el fin abierto vale como un solo día). */
export function seCruzan(
  a: { inicio: string; fin: string | null },
  b: { inicio: string; fin: string | null }
): boolean {
  return a.inicio <= (b.fin ?? b.inicio) && b.inicio <= (a.fin ?? a.inicio);
}

/** AA/MM/DD, el formato en que RRHH lee las fechas del módulo. */
function corta(fechaISO: string): string {
  return `${fechaISO.slice(8, 10)}/${fechaISO.slice(5, 7)}/${fechaISO.slice(2, 4)}`;
}

/**
 * "Vacaciones del 20/09/26 al 05/10/26", para el aviso del formulario y el
 * mensaje de error del servidor.
 */
export function describirPeriodo(
  r: RegistroConPeriodo,
  labels: Record<string, string>
): string {
  const inicio = r.fecha_inicio ?? r.fecha;
  const nombre = labels[r.tipo] ?? r.tipo;
  return r.fecha_fin
    ? `${nombre} del ${corta(inicio)} al ${corta(r.fecha_fin)}`
    : `${nombre} desde el ${corta(inicio)}`;
}
