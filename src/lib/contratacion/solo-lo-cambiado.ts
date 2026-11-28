/**
 * Guardar la ficha sin pisar lo que cambió mientras estaba abierta (24-nov-2026):
 * los campos que la persona no tocó (igual que al abrir) toman el valor actual
 * de la base. Sin `original`, la fila tal cual.
 */
export function soloLoCambiado<T extends object>(fila: T, original: T | null, enBase: Record<string, unknown>): T {
  if (!original) return fila;
  const r = { ...fila } as Record<string, unknown>;
  const o = original as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (k in enBase && JSON.stringify(r[k] ?? null) === JSON.stringify(o[k] ?? null)) r[k] = enBase[k];
  }
  return r as T;
}
