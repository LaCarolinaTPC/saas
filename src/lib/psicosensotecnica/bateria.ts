/**
 * Prueba psicosensotécnica — la batería (PURO).
 *
 * Pruebas de tamizaje: destrezas (reacción, atención, anticipación), conducta
 * al volante, personalidad de cinco rasgos y, en ./cuestionarios, el perfil del
 * cargo y la integridad. Los parámetros viven aquí y no en la configuración:
 * cambiarlos cambia lo que mide la prueba, así que cada cambio sube
 * `VERSION_BATERIA` y los intentos guardan con cuál se presentaron.
 */

import { ESCALA_ACUERDO, ITEMS_INTEGRIDAD, ITEMS_PERFIL } from "./cuestionarios";

export const VERSION_BATERIA = "1.3";

export const PRUEBAS = ["reaccion", "atencion", "anticipacion", "cuestionario", "personalidad", "perfil", "integridad"] as const;
export type ClavePrueba = (typeof PRUEBAS)[number];

export const NOMBRE_PRUEBA: Record<ClavePrueba, string> = {
  reaccion: "Tiempo de reacción",
  atencion: "Atención sostenida",
  anticipacion: "Anticipación de velocidad",
  cuestionario: "Cuestionario de conducción",
  personalidad: "Personalidad (IPIP, cinco rasgos)",
  perfil: "Perfil del cargo: personalidad, competencias y riesgos",
  integridad: "Integridad y valores",
};

export const esPrueba = (v: unknown): v is ClavePrueba => typeof v === "string" && (PRUEBAS as readonly string[]).includes(v);

// ── Tiempo de reacción ─────────────────────────────────────────────────────
export const REACCION = {
  /** Ensayos que cuentan en cada fase (la práctica no se envía). */
  ensayosSimple: 12,
  ensayosEleccion: 16,
  practica: 3,
  esperaMinMs: 1000,
  esperaMaxMs: 3000,
  /** Sin respuesta en este tiempo: omisión. */
  limiteMs: 2000,
  /** Menos que esto no es una reacción: se adelantó. */
  minimoValidoMs: 150,
} as const;

export interface EnsayoReaccion {
  fase: "simple" | "eleccion";
  /** Lado donde salió la señal (solo en elección). */
  lado?: "izq" | "der";
  /** Lado que tocó (solo en elección). */
  respuesta?: "izq" | "der" | null;
  /** Milisegundos desde la señal; null = no respondió. */
  tr: number | null;
  /** Tocó antes de que saliera la señal. */
  anticipada: boolean;
}

// ── Atención sostenida ─────────────────────────────────────────────────────
export const ATENCION = {
  estimulos: 120,
  practica: 10,
  /** Cada cuánto sale una figura y cuánto se ve. */
  intervaloMs: 1100,
  visibleMs: 700,
  /** Proporción de figuras que son el objetivo. */
  proporcionObjetivo: 0.25,
} as const;

export interface EnsayoAtencion {
  objetivo: boolean;
  respondio: boolean;
  tr: number | null;
}

// ── Anticipación de velocidad ──────────────────────────────────────────────
export const ANTICIPACION = {
  ensayos: 10,
  practica: 2,
  visibleMinMs: 1000,
  visibleMaxMs: 2200,
  ocultoMinMs: 800,
  ocultoMaxMs: 2000,
  /** Después de la llegada real, cuánto se espera la respuesta. */
  margenMs: 3000,
} as const;

export interface EnsayoAnticipacion {
  visibleMs: number;
  ocultoMs: number;
  /** Respuesta menos llegada real: negativo = se adelantó. null = no respondió. */
  errorMs: number | null;
}

// ── Cuestionario de conducción riesgosa ────────────────────────────────────
export const DIMENSIONES = ["infracciones", "errores", "lapsos", "agresividad"] as const;
export type Dimension = (typeof DIMENSIONES)[number];

export const NOMBRE_DIMENSION: Record<Dimension, string> = {
  infracciones: "Infracciones deliberadas",
  errores: "Errores al conducir",
  lapsos: "Distracciones y olvidos",
  agresividad: "Agresividad al volante",
};

export const ESCALA = ["Nunca", "Casi nunca", "A veces", "Con frecuencia", "Casi siempre"] as const;

export interface Item {
  id: string;
  dimension: Dimension;
  texto: string;
  /** La respuesta alta es la conducta segura: se invierte al calificar. */
  invertido?: boolean;
}

/** Redacción propia. «En el último año, ¿con qué frecuencia…?» */
export const ITEMS: Item[] = [
  { id: "i1", dimension: "infracciones", texto: "Supero el límite de velocidad cuando la vía está despejada." },
  { id: "e1", dimension: "errores", texto: "Calculo mal la distancia al adelantar a otro vehículo." },
  { id: "l1", dimension: "lapsos", texto: "Me paso de la parada o del desvío por ir pensando en otra cosa." },
  { id: "a1", dimension: "agresividad", texto: "Uso el pito para mostrar mi molestia con otro conductor." },
  { id: "i2", dimension: "infracciones", texto: "Paso un semáforo en amarillo aunque podía frenar con seguridad." },
  { id: "e2", dimension: "errores", texto: "Freno tarde porque no vi a tiempo que el vehículo de adelante se detenía." },
  { id: "l2", dimension: "lapsos", texto: "Olvido poner la direccional antes de girar o cambiar de carril." },
  { id: "a2", dimension: "agresividad", texto: "Me acerco mucho al vehículo de adelante para que se aparte." },
  { id: "i3", dimension: "infracciones", texto: "Respeto el pare aunque no vea venir a nadie.", invertido: true },
  { id: "e3", dimension: "errores", texto: "Al girar no noto a un peatón o a un ciclista hasta que está muy cerca." },
  { id: "l3", dimension: "lapsos", texto: "Reviso los espejos antes de arrancar de una parada.", invertido: true },
  { id: "a3", dimension: "agresividad", texto: "Discuto o le hago gestos a otro conductor que comete un error." },
  { id: "i4", dimension: "infracciones", texto: "Uso el celular con la mano mientras conduzco." },
  { id: "e4", dimension: "errores", texto: "Entro a una curva más rápido de lo que debía." },
  { id: "l4", dimension: "lapsos", texto: "Arranco sin fijarme en qué cambio está el vehículo." },
  { id: "a4", dimension: "agresividad", texto: "Cuando voy retrasado manejo de forma más brusca." },
];

// ── Personalidad: cinco rasgos (IPIP) ──────────────────────────────────────
// Los 50 marcadores de los cinco grandes del International Personality Item
// Pool (ipip.ori.org), de dominio público: la alternativa libre a pruebas con
// licencia como el 16PF. La traducción al español es propia y no tiene baremos
// colombianos: da el promedio de cada rasgo, no un percentil.
export const RASGOS = ["responsabilidad", "estabilidad", "amabilidad", "extraversion", "apertura"] as const;
export type Rasgo = (typeof RASGOS)[number];

export const NOMBRE_RASGO: Record<Rasgo, string> = {
  responsabilidad: "Responsabilidad",
  estabilidad: "Estabilidad emocional",
  amabilidad: "Amabilidad",
  extraversion: "Extraversión",
  apertura: "Apertura",
};

/** Los que se relacionan con accidentalidad y apego a normas: un valor bajo se resalta. */
export const RASGOS_CLAVE: readonly Rasgo[] = ["responsabilidad", "estabilidad", "amabilidad"];

export const ESCALA_PERSONALIDAD = ["Nada cierto en mí", "Poco cierto", "Ni cierto ni falso", "Bastante cierto", "Muy cierto en mí"] as const;

export interface ItemPersonalidad {
  id: string;
  rasgo: Rasgo;
  texto: string;
  invertido?: boolean;
}

const E = "extraversion", A = "amabilidad", C = "responsabilidad", S = "estabilidad", O = "apertura";
/** En el orden del IPIP: los rasgos van intercalados. `true` = ítem invertido. */
const IPIP: [Rasgo, string, boolean?][] = [
  [E, "Soy el alma de la fiesta."],
  [A, "Me preocupo poco por los demás.", true],
  [C, "Siempre estoy preparado."],
  [S, "Me estreso con facilidad.", true],
  [O, "Tengo un vocabulario amplio."],
  [E, "No hablo mucho.", true],
  [A, "Me intereso por la gente."],
  [C, "Dejo mis cosas tiradas por ahí.", true],
  [S, "Estoy tranquilo la mayor parte del tiempo."],
  [O, "Me cuesta entender las ideas abstractas.", true],
  [E, "Me siento cómodo rodeado de gente."],
  [A, "Insulto a la gente.", true],
  [C, "Presto atención a los detalles."],
  [S, "Me preocupo por las cosas.", true],
  [O, "Tengo una imaginación muy viva."],
  [E, "Prefiero quedarme en segundo plano.", true],
  [A, "Comprendo los sentimientos de los demás."],
  [C, "Hago las cosas de forma desordenada.", true],
  [S, "Rara vez me siento triste."],
  [O, "No me interesan las ideas abstractas.", true],
  [E, "Empiezo las conversaciones."],
  [A, "No me interesan los problemas de los demás.", true],
  [C, "Hago mis tareas de inmediato."],
  [S, "Me altero con facilidad.", true],
  [O, "Tengo ideas excelentes."],
  [E, "Tengo poco que decir.", true],
  [A, "Tengo buen corazón."],
  [C, "Con frecuencia olvido poner las cosas en su lugar.", true],
  [S, "Me disgusto con facilidad.", true],
  [O, "No tengo buena imaginación.", true],
  [E, "En las reuniones hablo con mucha gente distinta."],
  [A, "En realidad no me interesan los demás.", true],
  [C, "Me gusta el orden."],
  [S, "Cambio mucho de estado de ánimo.", true],
  [O, "Entiendo las cosas rápido."],
  [E, "No me gusta llamar la atención.", true],
  [A, "Saco tiempo para los demás."],
  [C, "Evado mis obligaciones.", true],
  [S, "Tengo cambios de humor frecuentes.", true],
  [O, "Uso palabras difíciles."],
  [E, "No me molesta ser el centro de atención."],
  [A, "Siento las emociones de los demás."],
  [C, "Sigo un horario."],
  [S, "Me irrito con facilidad.", true],
  [O, "Dedico tiempo a reflexionar sobre las cosas."],
  [E, "Soy callado con los desconocidos.", true],
  [A, "Hago que la gente se sienta a gusto."],
  [C, "Soy exigente con mi trabajo."],
  [S, "Con frecuencia me siento triste.", true],
  [O, "Estoy lleno de ideas."],
];

export const ITEMS_PERSONALIDAD: ItemPersonalidad[] = IPIP.map(([rasgo, texto, invertido], i) => ({ id: `p${i + 1}`, rasgo, texto, ...(invertido ? { invertido } : {}) }));

// ── Datos que envía el navegador ───────────────────────────────────────────
export interface DatosPrueba {
  personalidad: { respuestas: Record<string, number>; interrupciones: number };
  perfil: { respuestas: Record<string, number>; interrupciones: number };
  integridad: { respuestas: Record<string, number>; interrupciones: number };
  reaccion: { ensayos: EnsayoReaccion[]; interrupciones: number };
  atencion: { ensayos: EnsayoAtencion[]; interrupciones: number };
  anticipacion: { ensayos: EnsayoAnticipacion[]; interrupciones: number };
  cuestionario: { respuestas: Record<string, number>; interrupciones: number };
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numeroEn = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const trValido = (v: unknown, max: number) => v === null || numeroEn(v, 0, max);
const lado = (v: unknown) => v === "izq" || v === "der";

/**
 * Revisa lo que llegó del navegador y lo devuelve limpio (solo los campos
 * conocidos). El navegador no es de fiar: forma, cantidades y rangos.
 */
export function validarDatos<P extends ClavePrueba>(prueba: P, crudo: unknown): { ok: true; datos: DatosPrueba[P] } | { ok: false; error: string } {
  const mal = (error = "Los datos de la prueba no son válidos.") => ({ ok: false as const, error });
  if (!esObjeto(crudo)) return mal();
  const interrupciones = numeroEn(crudo.interrupciones, 0, 1000) ? Math.floor(crudo.interrupciones) : 0;
  const listo = (datos: unknown) => ({ ok: true as const, datos: datos as DatosPrueba[P] });

  if (prueba === "cuestionario" || prueba === "personalidad" || prueba === "perfil" || prueba === "integridad") {
    if (!esObjeto(crudo.respuestas)) return mal();
    const respuestas: Record<string, number> = {};
    const items: { id: string }[] =
      prueba === "cuestionario" ? ITEMS : prueba === "personalidad" ? ITEMS_PERSONALIDAD : prueba === "perfil" ? ITEMS_PERFIL : ITEMS_INTEGRIDAD;
    const opciones = prueba === "cuestionario" ? ESCALA.length : prueba === "personalidad" ? ESCALA_PERSONALIDAD.length : ESCALA_ACUERDO.length;
    for (const it of items) {
      const r = crudo.respuestas[it.id];
      if (!numeroEn(r, 1, opciones) || !Number.isInteger(r)) return mal("Faltan respuestas del cuestionario.");
      respuestas[it.id] = r;
    }
    return listo({ respuestas, interrupciones });
  }

  if (!Array.isArray(crudo.ensayos)) return mal();
  const ensayos = crudo.ensayos as unknown[];

  if (prueba === "reaccion") {
    const limpios: EnsayoReaccion[] = [];
    for (const e of ensayos) {
      if (!esObjeto(e) || (e.fase !== "simple" && e.fase !== "eleccion") || !trValido(e.tr, REACCION.limiteMs)) return mal();
      if (e.fase === "eleccion" && (!lado(e.lado) || !(e.respuesta == null || lado(e.respuesta)))) return mal();
      limpios.push({
        fase: e.fase,
        ...(e.fase === "eleccion" ? { lado: e.lado as "izq" | "der", respuesta: (e.respuesta ?? null) as "izq" | "der" | null } : {}),
        tr: e.tr as number | null,
        anticipada: e.anticipada === true,
      });
    }
    const n = (f: string) => limpios.filter((e) => e.fase === f).length;
    if (n("simple") !== REACCION.ensayosSimple || n("eleccion") !== REACCION.ensayosEleccion) return mal("La prueba de reacción está incompleta.");
    return listo({ ensayos: limpios, interrupciones });
  }

  if (prueba === "atencion") {
    if (ensayos.length !== ATENCION.estimulos) return mal("La prueba de atención está incompleta.");
    const limpios: EnsayoAtencion[] = [];
    for (const e of ensayos) {
      if (!esObjeto(e) || typeof e.objetivo !== "boolean" || typeof e.respondio !== "boolean" || !trValido(e.tr, ATENCION.intervaloMs)) return mal();
      limpios.push({ objetivo: e.objetivo, respondio: e.respondio, tr: e.respondio ? (e.tr as number | null) : null });
    }
    const objetivos = limpios.filter((e) => e.objetivo).length;
    // Una secuencia sin objetivos (o solo de objetivos) no mide nada.
    if (objetivos < ATENCION.estimulos * 0.1 || objetivos > ATENCION.estimulos * 0.5) return mal();
    return listo({ ensayos: limpios, interrupciones });
  }

  if (ensayos.length !== ANTICIPACION.ensayos) return mal("La prueba de anticipación está incompleta.");
  const limpios: EnsayoAnticipacion[] = [];
  for (const e of ensayos) {
    if (
      !esObjeto(e) ||
      !numeroEn(e.visibleMs, ANTICIPACION.visibleMinMs, ANTICIPACION.visibleMaxMs) ||
      !numeroEn(e.ocultoMs, ANTICIPACION.ocultoMinMs, ANTICIPACION.ocultoMaxMs) ||
      !(e.errorMs === null || numeroEn(e.errorMs, -ANTICIPACION.ocultoMaxMs, ANTICIPACION.margenMs))
    ) {
      return mal();
    }
    limpios.push({ visibleMs: e.visibleMs, ocultoMs: e.ocultoMs, errorMs: e.errorMs as number | null });
  }
  return listo({ ensayos: limpios, interrupciones });
}
