/**
 * Causas de rechazo de candidatos (compartido cliente/servidor).
 *
 * El catálogo vive en la tabla causas_rechazo: las 9 causas base más las que
 * los usuarios crean con "Otra". Una causa nueva queda disponible para los
 * rechazos siguientes; nombre_normalizado evita duplicados que solo difieren
 * en mayúsculas, tildes o espacios. La migración 20261015141948 normaliza
 * igual en SQL.
 */

export const CAUSA_MAX = 80;
export const NOTA_MAX = 2000;

/** Valor del selector que pide escribir una causa nueva. */
export const CAUSA_OTRA = "__otra__";

export interface CausaRechazo {
  id: string;
  nombre: string;
  base: boolean;
}

export function normalizarCausa(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Causa del catálogo que coincide con el texto (ignora mayúsculas, tildes y espacios). */
export function buscarCausa<T extends { nombre: string }>(catalogo: T[], texto: string): T | null {
  const n = normalizarCausa(texto);
  if (!n) return null;
  return catalogo.find((c) => normalizarCausa(c.nombre) === n) ?? null;
}

/** Error de validación del rechazo, o null si es válido. */
export function validarRechazo(causa: string | null | undefined, nota?: string | null): string | null {
  const c = (causa ?? "").trim();
  if (!c) return "Elija la causa del rechazo o escriba una nueva en \"Otra\".";
  if (c === CAUSA_OTRA) return "Escriba la causa nueva.";
  if (c.length > CAUSA_MAX) return `La causa no puede pasar de ${CAUSA_MAX} caracteres.`;
  if (nota && nota.length > NOTA_MAX) return `La nota no puede pasar de ${NOTA_MAX} caracteres.`;
  return null;
}

/** Texto final de la causa a partir del selector y del campo "Otra". */
export function causaElegida(seleccion: string, otra: string): string {
  return seleccion === CAUSA_OTRA ? otra.trim().replace(/\s+/g, " ") : seleccion;
}
