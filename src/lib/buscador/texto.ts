/**
 * Texto del buscador global (PURO, sirve en cliente y servidor). `palabrasDe`
 * deja solo letras y números: por eso `patronDe` no necesita escapar nada, y un
 * término no puede alterar el filtro que va a PostgREST.
 */

const MAX_PALABRAS = 4;
const MAX_LARGO_PALABRA = 20;
const MIN_LARGO_TOTAL = 2;

/** Minúsculas y sin tildes. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Palabras a buscar; vacío si es muy corto. `ABC-123` son dos palabras. */
export function palabrasDe(texto: string): string[] {
  const palabras = normalizar(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_PALABRAS)
    .map((p) => p.slice(0, MAX_LARGO_PALABRA));
  return palabras.join("").length >= MIN_LARGO_TOTAL ? palabras : [];
}

// Ambos casos: según el locale de la base, `~*` puede no plegar «Á» con «á».
const CLASES: Record<string, string> = {
  a: "[aáAÁ]",
  e: "[eéEÉ]",
  i: "[iíIÍ]",
  o: "[oóOÓ]",
  u: "[uúüUÚÜ]",
  n: "[nñNÑ]",
};

/** Expresión regular que ignora tildes y mayúsculas, para `imatch`. */
export function patronDe(palabra: string): string {
  return [...normalizar(palabra)].map((c) => CLASES[c] ?? c).join("");
}

/**
 * Un código corto escrito solo se busca exacto: «12» no debe quedar enterrado
 * bajo todas las cédulas que contienen un 12.
 */
export function debeAnclarse(palabras: readonly string[]): boolean {
  return palabras.length === 1 && /^\d{1,4}$/.test(palabras[0]);
}

/** ¿El texto contiene todas las palabras? `texto` ya debe venir normalizado. */
export function coincide(textoNormalizado: string, palabras: readonly string[]): boolean {
  return palabras.every((p) => textoNormalizado.includes(p));
}
