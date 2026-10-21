/**
 * Partir filas en lotes que quepan en una llamada a Supabase. PURO.
 *
 * Por bytes y no solo por filas: una fila de `co.cuerpo` serializada ocupa
 * ~800 bytes, una de `in.cabeza` (156 columnas) varias veces eso. Con un tope
 * fijo de filas, las tablas anchas mandarían cuerpos de decenas de megas.
 */

type Fila = Record<string, unknown>;

export const BYTES_POR_LOTE = 3 * 1024 * 1024;
export const FILAS_POR_LOTE = 2000;

export function partirPorBytes<T extends Fila>(
  filas: readonly T[],
  maxBytes = BYTES_POR_LOTE,
  maxFilas = FILAS_POR_LOTE
): T[][] {
  const salida: T[][] = [];
  let actual: T[] = [];
  let bytes = 0;
  for (const f of filas) {
    const b = JSON.stringify(f).length + 1;
    if (actual.length && (bytes + b > maxBytes || actual.length >= maxFilas)) {
      salida.push(actual);
      actual = [];
      bytes = 0;
    }
    actual.push(f);
    bytes += b;
  }
  if (actual.length) salida.push(actual);
  return salida;
}

/**
 * Lo mismo para documentos: nunca parte un documento en dos llamadas, porque
 * cada llamada BORRA los documentos que nombra antes de insertar. Un documento
 * sin filas (MGX le quitó todos los ítems) va igual, para que se borre.
 */
export function partirDocumentos<T extends Fila>(
  porDocumento: ReadonlyMap<string, readonly T[]>,
  maxBytes = BYTES_POR_LOTE,
  maxFilas = FILAS_POR_LOTE
): { llaves: string[]; filas: T[] }[] {
  const salida: { llaves: string[]; filas: T[] }[] = [];
  let actual = { llaves: [] as string[], filas: [] as T[] };
  let bytes = 0;
  for (const [llave, filas] of porDocumento) {
    const b = filas.reduce((s, f) => s + JSON.stringify(f).length + 1, 0) + llave.length;
    if (
      actual.llaves.length &&
      (bytes + b > maxBytes || actual.filas.length + filas.length > maxFilas)
    ) {
      salida.push(actual);
      actual = { llaves: [], filas: [] };
      bytes = 0;
    }
    actual.llaves.push(llave);
    actual.filas.push(...filas);
    bytes += b;
  }
  if (actual.llaves.length) salida.push(actual);
  return salida;
}
