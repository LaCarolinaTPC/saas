/**
 * Catálogo de formas de la pantalla informativa (PURO).
 *
 * Rectángulo, elipse y línea se pintan con un div (el rectángulo admite
 * esquinas redondeadas). El resto son trazados SVG en una caja de 100×100 que
 * se estira al tamaño del elemento (`preserveAspectRatio="none"`), así una
 * flecha se alarga o un triángulo se aplasta igual que en PowerPoint.
 */

export type GrupoForma = "basicas" | "poligonos" | "flechas" | "simbolos";

export interface DefForma {
  nombre: string;
  grupo: GrupoForma;
  /** Trazado SVG en 0-100. Sin trazado = se pinta con un div. */
  d?: string;
  /** Para figuras con hueco (anillo). */
  evenodd?: boolean;
  /** Proporción con la que se crea (ancho / alto). */
  proporcion?: number;
}

const f = (n: number) => Math.round(n * 100) / 100;

/** Polígono regular de `n` lados inscrito en la caja, con un vértice arriba. */
function poligono(n: number): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return `${f(50 + 50 * Math.cos(a))} ${f(50 + 50 * Math.sin(a))}`;
  });
  return `M${pts.join(" L")} Z`;
}

/** Estrella de `puntas` con radio interior `interior` (0-50). */
function estrella(puntas: number, interior: number): string {
  const pts = Array.from({ length: puntas * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : interior;
    const a = ((-90 + (i * 180) / puntas) * Math.PI) / 180;
    return `${f(50 + r * Math.cos(a))} ${f(50 + r * Math.sin(a))}`;
  });
  return `M${pts.join(" L")} Z`;
}

export const FORMAS = {
  rect: { nombre: "Rectángulo", grupo: "basicas", proporcion: 1.5 },
  elipse: { nombre: "Elipse", grupo: "basicas", proporcion: 1.5 },
  linea: { nombre: "Línea", grupo: "basicas" },
  semicirculo: { nombre: "Semicírculo", grupo: "basicas", d: "M0 100 A50 100 0 0 1 100 100 Z", proporcion: 2 },
  anillo: {
    nombre: "Anillo",
    grupo: "basicas",
    d: "M50 0 A50 50 0 1 0 50 100 A50 50 0 1 0 50 0 Z M50 22 A28 28 0 1 1 50 78 A28 28 0 1 1 50 22 Z",
    evenodd: true,
    proporcion: 1,
  },

  triangulo: { nombre: "Triángulo", grupo: "poligonos", d: "M50 0 L100 100 L0 100 Z", proporcion: 1.15 },
  triangulo_rect: { nombre: "Triángulo rectángulo", grupo: "poligonos", d: "M0 0 L100 100 L0 100 Z", proporcion: 1 },
  rombo: { nombre: "Rombo", grupo: "poligonos", d: "M50 0 L100 50 L50 100 L0 50 Z", proporcion: 1 },
  trapecio: { nombre: "Trapecio", grupo: "poligonos", d: "M20 0 L80 0 L100 100 L0 100 Z", proporcion: 1.5 },
  paralelogramo: { nombre: "Paralelogramo", grupo: "poligonos", d: "M25 0 L100 0 L75 100 L0 100 Z", proporcion: 1.6 },
  pentagono: { nombre: "Pentágono", grupo: "poligonos", d: poligono(5), proporcion: 1 },
  hexagono: { nombre: "Hexágono", grupo: "poligonos", d: poligono(6), proporcion: 1 },
  octogono: { nombre: "Octógono", grupo: "poligonos", d: poligono(8), proporcion: 1 },
  estrella: { nombre: "Estrella", grupo: "poligonos", d: estrella(5, 20), proporcion: 1 },
  estrella_6: { nombre: "Estrella de 6", grupo: "poligonos", d: estrella(6, 28), proporcion: 1 },
  sello: { nombre: "Sello", grupo: "poligonos", d: estrella(16, 42), proporcion: 1 },

  flecha_der: { nombre: "Flecha derecha", grupo: "flechas", d: "M0 30 L60 30 L60 5 L100 50 L60 95 L60 70 L0 70 Z", proporcion: 1.8 },
  flecha_izq: { nombre: "Flecha izquierda", grupo: "flechas", d: "M100 30 L40 30 L40 5 L0 50 L40 95 L40 70 L100 70 Z", proporcion: 1.8 },
  flecha_arriba: { nombre: "Flecha arriba", grupo: "flechas", d: "M30 100 L30 40 L5 40 L50 0 L95 40 L70 40 L70 100 Z", proporcion: 0.6 },
  flecha_abajo: { nombre: "Flecha abajo", grupo: "flechas", d: "M30 0 L30 60 L5 60 L50 100 L95 60 L70 60 L70 0 Z", proporcion: 0.6 },
  flecha_doble: {
    nombre: "Flecha doble",
    grupo: "flechas",
    d: "M0 50 L25 8 L25 32 L75 32 L75 8 L100 50 L75 92 L75 68 L25 68 L25 92 Z",
    proporcion: 2,
  },
  chevron: { nombre: "Cheurón", grupo: "flechas", d: "M0 0 L70 0 L100 50 L70 100 L0 100 L30 50 Z", proporcion: 1.2 },
  pentagono_flecha: { nombre: "Etiqueta", grupo: "flechas", d: "M0 0 L75 0 L100 50 L75 100 L0 100 Z", proporcion: 2 },

  corazon: {
    nombre: "Corazón",
    grupo: "simbolos",
    d: "M50 95 C20 70 0 52 0 30 C0 12 14 2 28 2 C38 2 46 8 50 17 C54 8 62 2 72 2 C86 2 100 12 100 30 C100 52 80 70 50 95 Z",
    proporcion: 1.1,
  },
  globo: {
    nombre: "Globo de diálogo",
    grupo: "simbolos",
    d: "M8 0 L92 0 Q100 0 100 8 L100 62 Q100 70 92 70 L42 70 L18 98 L24 70 L8 70 Q0 70 0 62 L0 8 Q0 0 8 0 Z",
    proporcion: 1.5,
  },
  nube: {
    nombre: "Nube",
    grupo: "simbolos",
    d: "M24 88 C10 88 0 78 0 64 C0 51 10 41 23 40 C24 22 37 10 54 10 C69 10 81 20 84 34 C94 37 100 46 100 57 C100 74 88 88 72 88 Z",
    proporcion: 1.5,
  },
  rayo: { nombre: "Rayo", grupo: "simbolos", d: "M60 0 L15 55 L45 55 L35 100 L85 40 L55 40 Z", proporcion: 0.7 },
  escudo: {
    nombre: "Escudo",
    grupo: "simbolos",
    d: "M50 0 L95 15 L95 50 C95 75 75 92 50 100 C25 92 5 75 5 50 L5 15 Z",
    proporcion: 0.85,
  },
  cinta: { nombre: "Cinta", grupo: "simbolos", d: "M0 20 L100 20 L85 50 L100 80 L0 80 L15 50 Z", proporcion: 2.5 },
  cruz: {
    nombre: "Cruz",
    grupo: "simbolos",
    d: "M35 0 L65 0 L65 35 L100 35 L100 65 L65 65 L65 100 L35 100 L35 65 L0 65 L0 35 L35 35 Z",
    proporcion: 1,
  },
  chulo: { nombre: "Visto bueno", grupo: "simbolos", d: "M0 55 L15 40 L38 62 L85 15 L100 30 L38 92 Z", proporcion: 1.2 },
  equis: {
    nombre: "Equis",
    grupo: "simbolos",
    d: "M15 0 L50 35 L85 0 L100 15 L65 50 L100 85 L85 100 L50 65 L15 100 L0 85 L35 50 L0 15 Z",
    proporcion: 1,
  },
  ubicacion: {
    nombre: "Ubicación",
    grupo: "simbolos",
    d: "M50 100 C50 100 10 58 10 38 C10 16 28 0 50 0 C72 0 90 16 90 38 C90 58 50 100 50 100 Z M50 22 A16 16 0 1 0 50 54 A16 16 0 1 0 50 22 Z",
    evenodd: true,
    proporcion: 0.8,
  },
} as const satisfies Record<string, DefForma>;

export type ClaveForma = keyof typeof FORMAS;
export const CLAVES_FORMA = Object.keys(FORMAS) as ClaveForma[];

export const GRUPOS_FORMA: { clave: GrupoForma; nombre: string }[] = [
  { clave: "basicas", nombre: "Básicas" },
  { clave: "poligonos", nombre: "Polígonos y estrellas" },
  { clave: "flechas", nombre: "Flechas" },
  { clave: "simbolos", nombre: "Símbolos" },
];

export function esForma(v: unknown): v is ClaveForma {
  return typeof v === "string" && v in FORMAS;
}

export function defForma(k: ClaveForma): DefForma {
  return FORMAS[k];
}
