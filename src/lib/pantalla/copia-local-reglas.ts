/**
 * Reglas de la copia local del televisor (PURO): cuándo sirve lo guardado, cuánto
 * falta para la siguiente consulta y qué medios bajar o borrar. El acceso a
 * IndexedDB está en copia-local.ts.
 */

/** Largo del prefijo de la clave: el mismo `key_prefix` visible en Gestivo, no es secreto. */
const LARGO_PREFIJO = 10;
/** Una copia más vieja se avisa en pantalla: el TV es público y una cifra vieja confunde. */
export const COPIA_VIEJA_MS = 24 * 3600_000;
/**
 * Provisional hasta probarlo en un TV real: un video más grande sigue por red
 * para no llenar la memoria del televisor.
 */
export const MAX_MEDIO_LOCAL_BYTES = 300 * 1024 * 1024;
/** Parte de la cuota del navegador que se puede usar. */
const FRACCION_CUOTA = 0.8;

export function prefijoDeClave(clave: string): string {
  return clave.slice(0, LARGO_PREFIJO);
}

/** Fecha de Colombia (AAAA-MM-DD), con la que el servidor calcula los datos. */
export function hoyColombia(ahora: Date): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora);
  const de = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return `${de("year")}-${de("month")}-${de("day")}`;
}

/**
 * ¿Se puede usar la copia sin consultar? Misma clave, mismo día de Colombia y
 * más nueva que el intervalo. Una edad negativa (el reloj del TV se movió) no
 * es confiable: cuenta como vencida.
 */
export function copiaVigente(
  copia: { clavePrefijo: string; recibidoAt: number; hoy: string },
  actual: { clavePrefijo: string; ahora: number; esperaMs: number }
): boolean {
  if (copia.clavePrefijo !== actual.clavePrefijo) return false;
  if (copia.hoy !== hoyColombia(new Date(actual.ahora))) return false;
  const edad = actual.ahora - copia.recibidoAt;
  return edad >= 0 && edad < actual.esperaMs;
}

/** Cuánto falta para la siguiente consulta. */
export function esperaRestante(recibidoAt: number, ahora: number, esperaMs: number): number {
  return Math.max(0, Math.min(esperaMs, esperaMs - (ahora - recibidoAt)));
}

export function copiaMuyVieja(recibidoAt: number, ahora: number): boolean {
  return ahora - recibidoAt > COPIA_VIEJA_MS;
}

/**
 * ¿Cabe este medio en el TV? `espacio` es null si el navegador no informa su
 * cuota: se intenta y un error de cuota lo deja por red.
 */
export function cabeEnLocal(tamano: number, espacio: { usado: number; cuota: number } | null): boolean {
  if (tamano > MAX_MEDIO_LOCAL_BYTES) return false;
  if (!espacio) return true;
  return espacio.usado + tamano <= espacio.cuota * FRACCION_CUOTA;
}

/** Qué falta por bajar y qué ya no usa la presentación. */
export function planMedios(referenciados: readonly string[], guardados: readonly string[]): { descargar: string[]; borrar: string[] } {
  const usados = new Set(referenciados);
  const hay = new Set(guardados);
  return {
    descargar: [...usados].filter((k) => !hay.has(k)),
    borrar: [...hay].filter((k) => !usados.has(k)),
  };
}
