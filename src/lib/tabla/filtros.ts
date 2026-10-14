/** Filtros de columna de las tablas de revisión (puros, probados aparte). */

export const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/**
 * Coincidencia de texto para los buscadores: tolerante a tildes y a may\u00fasculas.
 * Un filtro vac\u00edo pasa todo. Con varios campos, coincide si lo buscado est\u00e1 en
 * cualquiera de ellos; los nulos se ignoran.
 */
export function coincideTexto(
  filtro: string,
  ...campos: (string | null | undefined)[]
): boolean {
  const q = sinTildes(filtro.trim());
  if (!q) return true;
  return campos.some((c) => c != null && c !== "" && sinTildes(c).includes(q));
}

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
