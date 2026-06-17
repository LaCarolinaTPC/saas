/**
 * Helpers de saneo y mapeo de los datos crudos de GEMA hacia el esquema
 * de la app (Supabase/Postgres).
 */

/** Convierte a string limpio o null. */
export function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Convierte a número o null (acepta strings con coma/espacios). */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** tinyint/int 0|1 → boolean. */
export function toBool(v: unknown): boolean {
  return v === 1 || v === "1" || v === true;
}

/**
 * Cédula/identificación: bigint o string → string de solo dígitos.
 * Devuelve null si no hay dígitos o es "0".
 */
export function toCedula(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D/g, "").replace(/^0+/, "");
  return digits === "" || digits === "0" ? null : digits;
}

/**
 * Fecha → 'YYYY-MM-DD' saneada. Con `dateStrings:true` los valores llegan
 * como 'YYYY-MM-DD' o 'YYYY-MM-DD HH:MM:SS'. Descarta fechas absurdas
 * (origen tiene basura tipo 1899-11-30 y retiros en 2040).
 */
export function toDate(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  const day = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const year = Number(day.slice(0, 4));
  if (year < 1940 || year > 2035) return null;
  return day;
}

/** Timestamp completo o null (para fecha_recaudo). */
export function toTimestamp(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  const year = Number(s.slice(0, 4));
  if (year < 1940 || year > 2035) return null;
  return s;
}

/**
 * Estado del conductor: la vista expone `estado` (tinyint) y `retirado`.
 * El ejemplo oficial usa `WHERE estado = 1` como filtro de activos.
 */
export function estadoConductor(estado: unknown): "ACTIVO" | "RETIRADO" {
  return toBool(estado) ? "ACTIVO" : "RETIRADO";
}

/** Código de personal sin ceros a la izquierda (clave de cruce con cierres). */
export function normalizeCodigo(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  return s.replace(/^0+/, "") || s;
}
