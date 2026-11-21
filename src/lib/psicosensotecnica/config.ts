/**
 * Prueba psicosensotécnica — configuración (PURO).
 *
 * Se guarda en `psico_config.valor` (una fila). `leerConfig` tolera lo que
 * falte o venga mal y lo completa con los valores por defecto, para que una
 * fila vacía o de una versión anterior no tumbe la página pública.
 *
 * Los umbrales son PROVISIONALES: no hay baremos validados para esta batería.
 * Solo deciden qué se le resalta a la psicóloga; el concepto lo da ella.
 */

import { PRUEBAS, type ClavePrueba } from "./bateria";
import { ESCALAS_CON_PERFIL } from "./cuestionarios";

export type Acceso = "solo_candidatos" | "libre";

export interface Umbrales {
  /** Mediana del tiempo de reacción simple, ms. Por encima: alerta. */
  reaccionSimpleMs: number;
  /** Mediana del tiempo de reacción de elección, ms. */
  reaccionEleccionMs: number;
  /** Lado equivocado en la reacción de elección, %. */
  reaccionErroresPct: number;
  /** Respuestas adelantadas o sin respuesta en reacción, %. */
  reaccionFallosPct: number;
  /** Objetivos que dejó pasar en atención, %. */
  atencionOmisionesPct: number;
  /** Respuestas a figuras que no eran el objetivo, %. */
  atencionComisionesPct: number;
  /** Cuánto más lento respondió en la segunda mitad, %. */
  atencionCaidaPct: number;
  /** Error medio al estimar la llegada, ms. */
  anticipacionErrorMs: number;
  /** Promedio de una dimensión del cuestionario (1 a 5). */
  cuestionarioPromedio: number;
  /** Promedio (1 a 5) de responsabilidad, estabilidad emocional o amabilidad. Por debajo: alerta. */
  personalidadBajo: number;
  /** Integridad: puntaje mínimo (0 a 100) de cada valor. Por debajo: alerta. */
  integridadMinimo: number;
  /** Perfil e integridad: simulación (0 a 100) por encima de la cual los resultados se toman con precaución. */
  simulacionMax: number;
}

/**
 * Lo que espera el cargo en cada escala del perfil (0 a 100), como rango
 * [mínimo, máximo]. Dentro del rango la escala se ajusta al 100 %.
 */
export type PerfilCargo = Record<string, [number, number]>;

/**
 * Perfil de conductor de prueba (20-nov-2026): lo propuso Gestivo y lo debe
 * revisar la psicóloga. No son los rangos de ninguna prueba comercial: esas
 * escalas no son comparables con estas.
 */
export const PERFIL_CONDUCTOR: PerfilCargo = {
  dominancia: [20, 55],
  influencia: [30, 65],
  serenidad: [55, 90],
  cumplimiento: [55, 90],
  trabajo_equipo: [60, 100],
  asertividad: [55, 100],
  responsabilidad: [70, 100],
  orientacion_resultados: [50, 95],
  servicio: [60, 100],
  adaptabilidad: [50, 95],
  ansiedad: [0, 40],
  animo_bajo: [0, 35],
  agresividad: [0, 30],
  impulsividad: [0, 35],
  rumor: [0, 35],
};

export interface ConfigPsico {
  /** Apagado: la página pública no recibe a nadie. */
  activo: boolean;
  acceso: Acceso;
  exigirEquipoVinculado: boolean;
  /** Pruebas terminadas que se aceptan por cédula sin una asignación nueva. */
  intentosMaximos: number;
  pruebas: Record<ClavePrueba, boolean>;
  umbrales: Umbrales;
  perfil: PerfilCargo;
}

export const CONFIG_POR_DEFECTO: ConfigPsico = {
  activo: true,
  acceso: "solo_candidatos",
  exigirEquipoVinculado: false,
  intentosMaximos: 1,
  pruebas: { reaccion: true, atencion: true, anticipacion: true, cuestionario: true, personalidad: true, perfil: true, integridad: true },
  umbrales: {
    reaccionSimpleMs: 550,
    reaccionEleccionMs: 800,
    reaccionErroresPct: 15,
    reaccionFallosPct: 15,
    atencionOmisionesPct: 15,
    atencionComisionesPct: 20,
    atencionCaidaPct: 25,
    anticipacionErrorMs: 450,
    cuestionarioPromedio: 3,
    personalidadBajo: 2.5,
    integridadMinimo: 60,
    simulacionMax: 60,
  },
  perfil: PERFIL_CONDUCTOR,
};

export const CAMPOS_UMBRAL: { clave: keyof Umbrales; nombre: string; unidad: string; min: number; max: number }[] = [
  { clave: "reaccionSimpleMs", nombre: "Reacción simple: mediana", unidad: "ms", min: 200, max: 2000 },
  { clave: "reaccionEleccionMs", nombre: "Reacción de elección: mediana", unidad: "ms", min: 300, max: 2000 },
  { clave: "reaccionErroresPct", nombre: "Reacción de elección: lado equivocado", unidad: "%", min: 1, max: 100 },
  { clave: "reaccionFallosPct", nombre: "Reacción: adelantadas o sin respuesta", unidad: "%", min: 1, max: 100 },
  { clave: "atencionOmisionesPct", nombre: "Atención: objetivos que dejó pasar", unidad: "%", min: 1, max: 100 },
  { clave: "atencionComisionesPct", nombre: "Atención: respuestas equivocadas", unidad: "%", min: 1, max: 100 },
  { clave: "atencionCaidaPct", nombre: "Atención: más lento al final", unidad: "%", min: 1, max: 200 },
  { clave: "anticipacionErrorMs", nombre: "Anticipación: error medio", unidad: "ms", min: 50, max: 3000 },
  { clave: "cuestionarioPromedio", nombre: "Cuestionario: promedio de una dimensión", unidad: "de 1 a 5", min: 1, max: 5 },
  { clave: "personalidadBajo", nombre: "Personalidad: rasgo clave por debajo de", unidad: "de 1 a 5", min: 1, max: 5 },
  { clave: "integridadMinimo", nombre: "Integridad: puntaje mínimo de cada valor", unidad: "de 0 a 100", min: 0, max: 100 },
  { clave: "simulacionMax", nombre: "Perfil e integridad: simulación por encima de", unidad: "de 0 a 100", min: 0, max: 100 },
];

/** Un rango válido del perfil, o null. */
function rangoValido(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [a, b] = v.map(Number);
  return Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b <= 100 && a <= b ? [a, b] : null;
}

export const INTENTOS_MIN = 1;
export const INTENTOS_MAX = 5;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lo guardado, completado con los valores por defecto. Nunca lanza. */
export function leerConfig(valor: unknown): ConfigPsico {
  const d = CONFIG_POR_DEFECTO;
  if (!esObjeto(valor)) return structuredClone(d);
  const pruebasCrudas = esObjeto(valor.pruebas) ? valor.pruebas : {};
  const umbralesCrudos = esObjeto(valor.umbrales) ? valor.umbrales : {};
  const pruebas = Object.fromEntries(PRUEBAS.map((p) => [p, typeof pruebasCrudas[p] === "boolean" ? pruebasCrudas[p] : d.pruebas[p]])) as Record<ClavePrueba, boolean>;
  const umbrales = { ...d.umbrales };
  for (const c of CAMPOS_UMBRAL) {
    const v = umbralesCrudos[c.clave];
    if (typeof v === "number" && Number.isFinite(v) && v >= c.min && v <= c.max) umbrales[c.clave] = v;
  }
  const intentos = valor.intentosMaximos;
  const perfilCrudo = esObjeto(valor.perfil) ? valor.perfil : {};
  const perfil = Object.fromEntries(ESCALAS_CON_PERFIL.map((e) => [e.id, rangoValido(perfilCrudo[e.id]) ?? d.perfil[e.id]])) as PerfilCargo;
  return {
    activo: typeof valor.activo === "boolean" ? valor.activo : d.activo,
    acceso: valor.acceso === "libre" || valor.acceso === "solo_candidatos" ? valor.acceso : d.acceso,
    exigirEquipoVinculado: typeof valor.exigirEquipoVinculado === "boolean" ? valor.exigirEquipoVinculado : d.exigirEquipoVinculado,
    intentosMaximos:
      typeof intentos === "number" && Number.isInteger(intentos) && intentos >= INTENTOS_MIN && intentos <= INTENTOS_MAX ? intentos : d.intentosMaximos,
    // Sin ninguna prueba encendida no hay nada que presentar: se ignora.
    pruebas: PRUEBAS.some((p) => pruebas[p]) ? pruebas : { ...d.pruebas },
    umbrales,
    perfil,
  };
}

/** Lo que llega del formulario de configuración: estricto, con el motivo. */
export function validarConfig(entrada: unknown): { ok: true; config: ConfigPsico } | { ok: false; error: string } {
  const mal = (error: string) => ({ ok: false as const, error });
  if (!esObjeto(entrada)) return mal("Configuración no válida.");
  if (typeof entrada.activo !== "boolean" || typeof entrada.exigirEquipoVinculado !== "boolean") return mal("Configuración no válida.");
  if (entrada.acceso !== "libre" && entrada.acceso !== "solo_candidatos") return mal("Elija quién puede presentar la prueba.");
  const n = entrada.intentosMaximos;
  if (typeof n !== "number" || !Number.isInteger(n) || n < INTENTOS_MIN || n > INTENTOS_MAX) {
    return mal(`Los intentos deben estar entre ${INTENTOS_MIN} y ${INTENTOS_MAX}.`);
  }
  if (!esObjeto(entrada.pruebas) || !esObjeto(entrada.umbrales)) return mal("Configuración no válida.");
  const pruebas = {} as Record<ClavePrueba, boolean>;
  for (const p of PRUEBAS) pruebas[p] = entrada.pruebas[p] === true;
  if (!PRUEBAS.some((p) => pruebas[p])) return mal("Deje al menos una prueba activa.");
  const umbrales = {} as Umbrales;
  for (const c of CAMPOS_UMBRAL) {
    const v = entrada.umbrales[c.clave];
    if (typeof v !== "number" || !Number.isFinite(v) || v < c.min || v > c.max) {
      return mal(`«${c.nombre}» debe estar entre ${c.min} y ${c.max} ${c.unidad}.`);
    }
    umbrales[c.clave] = v;
  }
  if (!esObjeto(entrada.perfil)) return mal("Configuración no válida.");
  const perfil: PerfilCargo = {};
  for (const e of ESCALAS_CON_PERFIL) {
    const r = rangoValido(entrada.perfil[e.id]);
    if (!r) return mal(`Perfil del cargo, «${e.nombre}»: el mínimo y el máximo van de 0 a 100 y el mínimo no puede ser mayor.`);
    perfil[e.id] = r;
  }
  return { ok: true, config: { activo: entrada.activo, acceso: entrada.acceso, exigirEquipoVinculado: entrada.exigirEquipoVinculado, intentosMaximos: n, pruebas, umbrales, perfil } };
}

export const pruebasActivas = (c: ConfigPsico): ClavePrueba[] => PRUEBAS.filter((p) => c.pruebas[p]);
