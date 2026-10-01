/** Filtros de columna de las tablas de revisión (puros, probados aparte). */

export const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Evalúa un filtro numérico escrito por el usuario. Una expresión que no se entiende no filtra. */
export function pasaFiltroNumero(expr: string, v: number | null): boolean {
  const e = expr.trim().replace(/\s+/g, "");
  if (!e) return true;
  if (/^(vac[ií]o|-|null)$/i.test(e)) return v == null;
  if (v == null) return false;
  let m = /^(-?\d+(?:[.,]\d+)?)\.\.(-?\d+(?:[.,]\d+)?)$/.exec(e);
  if (m) return v >= numero(m[1]) && v <= numero(m[2]);
  m = /^±(\d+(?:[.,]\d+)?)$/.exec(e);
  if (m) return Math.abs(v) >= numero(m[1]);
  m = /^(>=|<=|!=|<>|>|<|=)?(-?\d+(?:[.,]\d+)?)$/.exec(e);
  if (!m) return true;
  const n = numero(m[2]);
  switch (m[1]) {
    case ">": return v > n;
    case ">=": return v >= n;
    case "<": return v < n;
    case "<=": return v <= n;
    case "!=": case "<>": return v !== n;
    default: return v === n;
  }
}
