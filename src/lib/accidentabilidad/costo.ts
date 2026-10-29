/**
 * Costo de reparación de un accidente — reglas PURAS (se prueban con
 * `test:accidentabilidad`). Lo registra quien tenga
 * `accidentabilidad.costo_reparacion` (el director de mantenimiento).
 */

/** Tope: ningún arreglo de un bus pasa de esto (el histórico llega a 8 M). */
export const COSTO_MAXIMO = 9_999_999_999;

/**
 * Valida y normaliza lo que se escribió. Acepta pesos enteros con o sin
 * separadores de miles y signo de pesos («1.250.000», «$ 1250000»); rechaza
 * letras, negativos, decimales y vacío. Vacío NO es cero: el campo arranca en 0
 * y quien lo deje en blanco tiene que escribir el 0.
 */
export function validarCosto(texto: unknown): { ok: true; valor: number } | { ok: false; error: string } {
  if (typeof texto === "number") {
    if (!Number.isFinite(texto)) return { ok: false, error: "El costo de reparación debe ser un número." };
    return validarNumero(texto);
  }
  const s = String(texto ?? "").trim();
  if (!s) return { ok: false, error: "Escriba el costo de reparación (0 si no hubo)." };
  // Pesos colombianos: el punto y el espacio son separadores de miles.
  const limpio = s.replace(/^\$\s*/, "").replace(/[.\s]/g, "");
  if (limpio.includes(",")) return { ok: false, error: "El costo va en pesos enteros, sin centavos." };
  if (limpio.startsWith("-")) return { ok: false, error: "El costo de reparación no puede ser negativo." };
  if (!/^\d+$/.test(limpio)) return { ok: false, error: "El costo de reparación debe ser un número (solo dígitos)." };
  return validarNumero(Number(limpio));
}

function validarNumero(n: number): { ok: true; valor: number } | { ok: false; error: string } {
  if (n < 0) return { ok: false, error: "El costo de reparación no puede ser negativo." };
  if (!Number.isInteger(n)) return { ok: false, error: "El costo va en pesos enteros, sin centavos." };
  if (n > COSTO_MAXIMO) return { ok: false, error: "El costo de reparación es demasiado alto; revise el valor." };
  return { ok: true, valor: n };
}

/** «$ 1.250.000». */
export function pesosCosto(n: number | null | undefined): string {
  return n == null ? "—" : `$ ${Math.round(n).toLocaleString("es-CO")}`;
}
