/**
 * Comparación de nombres de persona entre fuentes (el registro civil, el RUNT,
 * los certificados). PURO: lo usan los proveedores y las reglas de antecedentes.
 */

/** Mayúsculas, sin tildes ni signos, en palabras. */
export function palabrasNombre(n: string): string[] {
  return n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-ZÑ ]+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1);
}

/**
 * ¿Los dos nombres son de la misma persona? Basta con dos palabras en común
 * (un nombre y un apellido) o, si uno tiene menos de dos palabras, con todas las suyas.
 */
export function nombresCoinciden(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  const pa = palabrasNombre(a);
  const pb = new Set(palabrasNombre(b));
  const comunes = pa.filter((p) => pb.has(p)).length;
  return comunes >= Math.min(2, pa.length, pb.size);
}
