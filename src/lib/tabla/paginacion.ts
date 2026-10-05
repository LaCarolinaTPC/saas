/** Paginación de tablas en el cliente (pura, probada aparte). */

export const TAMANOS_PAGINA = [25, 50, 100, 200] as const;
export const POR_PAGINA_DEFECTO = 25;

export interface Pagina<T> {
  filas: T[];
  /** Página vigente, ya recortada al rango válido (1…totalPaginas). */
  pagina: number;
  totalPaginas: number;
  total: number;
  /** Posición (1-based) de la primera y la última fila mostradas; 0 si no hay filas. */
  desde: number;
  hasta: number;
}

export function paginar<T>(items: readonly T[], pagina: number, porPagina: number): Pagina<T> {
  const tam = Math.max(1, Math.floor(porPagina) || POR_PAGINA_DEFECTO);
  const total = items.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tam));
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
  const inicio = (actual - 1) * tam;
  const filas = items.slice(inicio, inicio + tam);
  return {
    filas,
    pagina: actual,
    totalPaginas,
    total,
    desde: total === 0 ? 0 : inicio + 1,
    hasta: inicio + filas.length,
  };
}

/** Números de página a mostrar, con null donde va "…": 1 … 4 5 6 … 20. */
export function paginasVisibles(actual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, actual - 1, actual, actual + 1].filter((n) => n >= 1 && n <= total));
  const orden = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const n of orden) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push(n - prev === 2 ? prev + 1 : null);
    out.push(n);
  }
  return out;
}
