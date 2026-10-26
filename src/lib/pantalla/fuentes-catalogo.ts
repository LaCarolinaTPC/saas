/**
 * Catálogo de fuentes de la pantalla informativa — parte PURA.
 *
 * Va separado de `fuentes.ts` porque ese archivo llama a `next/font/google`,
 * que solo funciona dentro del build de Next: el modelo (`modelo.ts`) y sus
 * pruebas con `node --test` necesitan saber qué fuentes existen sin cargarlas.
 *
 * La variable CSS de cada fuente la declara `fuentes.ts`; Inter ya la pone el
 * layout raíz (`--font-inter`).
 */

export const FUENTES = {
  inter: { nombre: "Inter", variable: "--font-inter", fallback: "sans-serif" },
  roboto: { nombre: "Roboto", variable: "--font-pantalla-roboto", fallback: "sans-serif" },
  montserrat: { nombre: "Montserrat", variable: "--font-pantalla-montserrat", fallback: "sans-serif" },
  oswald: { nombre: "Oswald", variable: "--font-pantalla-oswald", fallback: "sans-serif" },
  poppins: { nombre: "Poppins", variable: "--font-pantalla-poppins", fallback: "sans-serif" },
  playfair: { nombre: "Playfair Display", variable: "--font-pantalla-playfair", fallback: "serif" },
  bebas: { nombre: "Bebas Neue", variable: "--font-pantalla-bebas", fallback: "sans-serif" },
  lato: { nombre: "Lato", variable: "--font-pantalla-lato", fallback: "sans-serif" },
} as const;

export type FuenteClave = keyof typeof FUENTES;

export const CLAVES_FUENTE = Object.keys(FUENTES) as FuenteClave[];

export function esFuente(v: unknown): v is FuenteClave {
  return typeof v === "string" && v in FUENTES;
}

/** Valor de `font-family` para una fuente del catálogo. */
export function fontFamilyDe(f: FuenteClave): string {
  const def = FUENTES[f] ?? FUENTES.inter;
  return `var(${def.variable}), ${def.fallback}`;
}
