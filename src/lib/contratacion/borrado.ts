/**
 * Confirmación para borrar un proceso (27-nov-2026): hay que escribir la cédula
 * del candidato (o su nombre completo, si no tiene cédula). Puro: lo usan la
 * ficha (para habilitar el botón) y el servidor (que lo vuelve a exigir).
 */
const normal = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Qué hay que escribir: «la cédula 1129492533» o «el nombre …». */
export function pideParaBorrar(p: { nombre: string | null; cedula: string | null }): { que: "cédula" | "nombre"; valor: string } {
  const ced = String(p.cedula ?? "").replace(/\D/g, "");
  return ced.length >= 5 ? { que: "cédula", valor: ced } : { que: "nombre", valor: String(p.nombre ?? "").trim() };
}

export function confirmacionBorrado(p: { nombre: string | null; cedula: string | null }, escrito: string): boolean {
  const pide = pideParaBorrar(p);
  if (!pide.valor) return false;
  return pide.que === "cédula" ? String(escrito ?? "").replace(/\D/g, "") === pide.valor : normal(escrito) === normal(pide.valor);
}
