/**
 * Prueba psicosensotécnica — calificación (PURO).
 *
 * De los ensayos crudos a métricas, alertas y un puntaje de 0 a 100. El
 * servidor siempre recalcula con esto: del navegador solo se aceptan tiempos.
 *
 * El puntaje es orientativo, no un baremo: 100 es el mejor valor de referencia
 * de cada métrica, 50 queda justo en el umbral de alerta y 0 al doble de esa
 * distancia. Sirve para ordenar y comparar, no para decidir.
 */

import {
  DIMENSIONES, ESCALA, ESCALA_PERSONALIDAD, ITEMS, ITEMS_PERSONALIDAD, NOMBRE_DIMENSION, NOMBRE_RASGO, RASGOS, RASGOS_CLAVE, REACCION,
  type ClavePrueba, type DatosPrueba, type Dimension, type EnsayoAnticipacion, type EnsayoAtencion, type EnsayoReaccion,
} from "./bateria";
import type { PerfilCargo, Umbrales } from "./config";
import {
  ESCALA_ACUERDO, ESCALAS_CON_PERFIL, ESCALAS_INTEGRIDAD, ESCALAS_PERFIL, FACTORES_INTEGRIDAD, ITEMS_INTEGRIDAD, ITEMS_PERFIL, NOMBRE_GRUPO,
  type Escala, type ItemEscala,
} from "./cuestionarios";

export interface Metrica {
  clave: string;
  nombre: string;
  valor: number | null;
  unidad: string;
  /** Umbral con el que se comparó, si tiene. */
  umbral?: number;
  /** Perfil del cargo: rango esperado [mínimo, máximo]. */
  rango?: [number, number];
  /** Perfil del cargo: qué tanto se ajusta al rango, de 0 a 100. */
  ajuste?: number;
  /** Para agrupar en el informe («Personalidad», «Rectitud»…). */
  grupo?: string;
  alerta: boolean;
}

/** Como lo presentan las pruebas comerciales de selección: tres bandas por el ajuste global. */
export type Banda = "recomendado" | "con_sugerencias" | "no_recomendado";
export const NOMBRE_BANDA: Record<Banda, string> = {
  recomendado: "Se ajusta",
  con_sugerencias: "Se ajusta con observaciones",
  no_recomendado: "No se ajusta",
};
export const bandaDe = (ajuste: number): Banda => (ajuste > 75 ? "recomendado" : ajuste > 50 ? "con_sugerencias" : "no_recomendado");

/** Lo que entregan el perfil del cargo y la integridad además de las métricas. */
export interface InformePrueba {
  /** Perfil: ajuste al cargo; integridad: puntaje global. De 0 a 100. */
  ajuste: number;
  banda: Banda;
  rasgoPredominante?: { id: string; nombre: string; descripcion: string };
  /** Respuestas puntuales que conviene revisar. */
  riesgos: string[];
  /** Preguntas sugeridas para profundizar en la entrevista. */
  entrevista: string[];
}

export interface ResultadoPrueba {
  metricas: Metrica[];
  /** Frases en lenguaje llano para la psicóloga. */
  alertas: string[];
  puntaje: number;
  informe?: InformePrueba;
}

const redondear = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

export function desviacion(valores: number[]): number | null {
  const m = media(valores);
  if (m == null || valores.length < 2) return null;
  return Math.sqrt(valores.reduce((a, v) => a + (v - m) ** 2, 0) / (valores.length - 1));
}

const pct = (parte: number, total: number) => (total ? (parte / total) * 100 : 0);

/** 100 en `mejor`, 50 en `umbral`, 0 al doble de esa distancia. Sin valor: 0. */
export function componente(valor: number | null, mejor: number, umbral: number): number {
  if (valor == null) return 0;
  const peor = mejor + 2 * (umbral - mejor);
  return Math.max(0, Math.min(100, ((peor - valor) / (peor - mejor)) * 100));
}

function armar(metricas: Metrica[], alertas: string[], componentes: number[]): ResultadoPrueba {
  return { metricas, alertas, puntaje: redondear(media(componentes) ?? 0, 1) };
}

// ── Tiempo de reacción ─────────────────────────────────────────────────────
export function calificarReaccion(ensayos: EnsayoReaccion[], u: Umbrales): ResultadoPrueba {
  const valido = (e: EnsayoReaccion) => !e.anticipada && e.tr != null && e.tr >= REACCION.minimoValidoMs;
  const simples = ensayos.filter((e) => e.fase === "simple");
  const eleccion = ensayos.filter((e) => e.fase === "eleccion");
  const trSimple = simples.filter(valido).map((e) => e.tr as number);
  const aciertos = eleccion.filter((e) => valido(e) && e.respuesta === e.lado);
  const respondidas = eleccion.filter((e) => valido(e) && e.respuesta != null);

  const medSimple = mediana(trSimple);
  const medEleccion = mediana(aciertos.map((e) => e.tr as number));
  const variabilidad = desviacion(trSimple);
  // Sin respuestas no hay errores que contar: es un dato que falta, no un cero.
  const errores = respondidas.length ? pct(respondidas.length - aciertos.length, respondidas.length) : null;
  const fallos = pct(ensayos.filter((e) => !valido(e)).length, ensayos.length);

  const m = (clave: string, nombre: string, valor: number | null, unidad: string, umbral?: number): Metrica => ({
    clave, nombre, valor: valor == null ? null : redondear(valor, unidad === "%" ? 1 : 0), unidad, umbral,
    alerta: umbral != null && (valor == null || valor > umbral),
  });
  const metricas = [
    m("simple", "Reacción simple (mediana)", medSimple, "ms", u.reaccionSimpleMs),
    m("variabilidad", "Reacción simple (variabilidad)", variabilidad, "ms"),
    m("eleccion", "Reacción de elección (mediana)", medEleccion, "ms", u.reaccionEleccionMs),
    m("errores", "Lado equivocado", errores, "%", u.reaccionErroresPct),
    m("fallos", "Adelantadas o sin respuesta", fallos, "%", u.reaccionFallosPct),
  ];
  const alertas: string[] = [];
  if (metricas[0].alerta) alertas.push(medSimple == null ? "No hubo respuestas válidas en la reacción simple." : "Reacciona lento a una señal simple.");
  if (metricas[2].alerta) alertas.push(medEleccion == null ? "No acertó ninguna respuesta en la reacción de elección." : "Reacciona lento cuando tiene que elegir.");
  if (errores != null && metricas[3].alerta) alertas.push("Se equivoca de lado con frecuencia al elegir.");
  if (metricas[4].alerta) alertas.push("Muchas respuestas adelantadas o sin responder.");

  return armar(metricas, alertas, [
    componente(medSimple, 250, u.reaccionSimpleMs),
    componente(medEleccion, 400, u.reaccionEleccionMs),
    componente(errores, 0, u.reaccionErroresPct),
    componente(fallos, 0, u.reaccionFallosPct),
  ]);
}

// ── Atención sostenida ─────────────────────────────────────────────────────
export function calificarAtencion(ensayos: EnsayoAtencion[], u: Umbrales): ResultadoPrueba {
  const objetivos = ensayos.filter((e) => e.objetivo);
  const distractores = ensayos.filter((e) => !e.objetivo);
  const omisiones = pct(objetivos.filter((e) => !e.respondio).length, objetivos.length);
  const comisiones = pct(distractores.filter((e) => e.respondio).length, distractores.length);
  const tiempos = (lista: EnsayoAtencion[]) => lista.filter((e) => e.objetivo && e.respondio && e.tr != null).map((e) => e.tr as number);
  const mitad = Math.floor(ensayos.length / 2);
  const primera = mediana(tiempos(ensayos.slice(0, mitad)));
  const segunda = mediana(tiempos(ensayos.slice(mitad)));
  const tr = mediana(tiempos(ensayos));
  // Sin aciertos en alguna mitad no hay con qué comparar.
  const caida = primera != null && segunda != null && primera > 0 ? ((segunda - primera) / primera) * 100 : null;

  const metricas: Metrica[] = [
    { clave: "omisiones", nombre: "Objetivos que dejó pasar", valor: redondear(omisiones, 1), unidad: "%", umbral: u.atencionOmisionesPct, alerta: omisiones > u.atencionOmisionesPct },
    { clave: "comisiones", nombre: "Respuestas equivocadas", valor: redondear(comisiones, 1), unidad: "%", umbral: u.atencionComisionesPct, alerta: comisiones > u.atencionComisionesPct },
    { clave: "tr", nombre: "Tiempo de respuesta (mediana)", valor: tr == null ? null : redondear(tr), unidad: "ms", alerta: false },
    { clave: "caida", nombre: "Más lento en la segunda mitad", valor: caida == null ? null : redondear(caida, 1), unidad: "%", umbral: u.atencionCaidaPct, alerta: caida != null && caida > u.atencionCaidaPct },
  ];
  const alertas: string[] = [];
  if (metricas[0].alerta) alertas.push("Deja pasar muchas señales a las que debía responder.");
  if (metricas[1].alerta) alertas.push("Responde a señales que no eran (impulsividad).");
  if (metricas[3].alerta) alertas.push("Su rendimiento cae con el paso de los minutos.");

  return armar(metricas, alertas, [
    componente(omisiones, 0, u.atencionOmisionesPct),
    componente(comisiones, 0, u.atencionComisionesPct),
    componente(Math.max(0, caida ?? 0), 0, u.atencionCaidaPct),
  ]);
}

// ── Anticipación de velocidad ──────────────────────────────────────────────
export function calificarAnticipacion(ensayos: EnsayoAnticipacion[], u: Umbrales): ResultadoPrueba {
  const errores = ensayos.filter((e) => e.errorMs != null).map((e) => e.errorMs as number);
  const sinRespuesta = pct(ensayos.length - errores.length, ensayos.length);
  const absoluto = media(errores.map(Math.abs));
  const sesgo = media(errores);
  // Más de la mitad sin responder: lo poco que hay no dice nada.
  const insuficiente = sinRespuesta > 50;

  const metricas: Metrica[] = [
    { clave: "error", nombre: "Error medio al estimar la llegada", valor: absoluto == null ? null : redondear(absoluto), unidad: "ms", umbral: u.anticipacionErrorMs, alerta: insuficiente || absoluto == null || absoluto > u.anticipacionErrorMs },
    { clave: "sesgo", nombre: "Tendencia (negativo = se adelanta)", valor: sesgo == null ? null : redondear(sesgo), unidad: "ms", alerta: false },
    { clave: "sin_respuesta", nombre: "Sin respuesta", valor: redondear(sinRespuesta, 1), unidad: "%", alerta: insuficiente },
  ];
  const alertas: string[] = [];
  if (insuficiente) alertas.push("No respondió en la mayoría de los ensayos de anticipación.");
  else if (metricas[0].alerta) {
    alertas.push(
      sesgo != null && Math.abs(sesgo) > u.anticipacionErrorMs / 2
        ? sesgo < 0 ? "Calcula que el vehículo llega antes de lo real (se adelanta)." : "Calcula que el vehículo llega después de lo real (reacciona tarde)."
        : "Estima con poca precisión cuándo llega un vehículo."
    );
  }
  return armar(metricas, alertas, [insuficiente ? 0 : componente(absoluto, 100, u.anticipacionErrorMs)]);
}

// ── Cuestionario ───────────────────────────────────────────────────────────
export function calificarCuestionario(respuestas: Record<string, number>, u: Umbrales): ResultadoPrueba {
  const porDimension = (d: Dimension) =>
    media(ITEMS.filter((i) => i.dimension === d).map((i) => (i.invertido ? ESCALA.length + 1 - respuestas[i.id] : respuestas[i.id])));
  const metricas: Metrica[] = DIMENSIONES.map((d) => {
    const v = porDimension(d);
    return { clave: d, nombre: NOMBRE_DIMENSION[d], valor: v == null ? null : redondear(v, 2), unidad: "de 1 a 5", umbral: u.cuestionarioPromedio, alerta: v != null && v >= u.cuestionarioPromedio };
  });
  // Todo igual en 16 preguntas, con dos invertidas, es contestar sin leer.
  const iguales = new Set(Object.values(respuestas)).size === 1;
  const alertas = metricas.filter((m) => m.alerta).map((m) => `Reporta con frecuencia: ${m.nombre.toLowerCase()}.`);
  if (iguales) alertas.push("Marcó la misma opción en todas las preguntas: posible respuesta sin leer.");
  return armar(metricas, alertas, metricas.map((m) => componente(m.valor, 1, u.cuestionarioPromedio)));
}

// ── Personalidad (IPIP) ────────────────────────────────────────────────────
export function calificarPersonalidad(respuestas: Record<string, number>, u: Umbrales): ResultadoPrueba {
  const tope = ESCALA_PERSONALIDAD.length + 1;
  const metricas: Metrica[] = RASGOS.map((r) => {
    const v = media(ITEMS_PERSONALIDAD.filter((i) => i.rasgo === r).map((i) => (i.invertido ? tope - respuestas[i.id] : respuestas[i.id])));
    const clave = RASGOS_CLAVE.includes(r);
    return {
      clave: r, nombre: NOMBRE_RASGO[r], valor: v == null ? null : redondear(v, 2), unidad: "de 1 a 5",
      ...(clave ? { umbral: u.personalidadBajo } : {}),
      alerta: clave && v != null && v < u.personalidadBajo,
    };
  });
  const FRASE: Record<string, string> = {
    responsabilidad: "Se describe como poco ordenado y poco cumplidor (responsabilidad baja).",
    estabilidad: "Se describe como fácil de alterar o de irritar (estabilidad emocional baja).",
    amabilidad: "Se describe como poco considerado con los demás (amabilidad baja).",
  };
  const alertas = metricas.filter((m) => m.alerta).map((m) => FRASE[m.clave]);
  // Con casi la mitad de los ítems invertidos, contestar todo igual es no leer.
  if (new Set(Object.values(respuestas)).size === 1) alertas.push("Marcó la misma opción en todas las preguntas de personalidad: posible respuesta sin leer.");
  // Solo puntúan los rasgos clave: extraversión y apertura no son mejores ni peores para conducir.
  return armar(metricas, alertas, metricas.filter((m) => m.umbral != null).map((m) => componente(m.valor, ESCALA_PERSONALIDAD.length, u.personalidadBajo)));
}

// ── Perfil del cargo e integridad (./cuestionarios) ────────────────────────
const TOPE_ACUERDO = ESCALA_ACUERDO.length + 1;
const MAX_PREGUNTAS_ENTREVISTA = 8;

/** Puntaje de 0 a 100 de cada escala: promedio de sus respuestas (con los ítems invertidos al revés). */
export function puntajesEscalas(items: readonly ItemEscala[], respuestas: Record<string, number>): Record<string, number | null> {
  const por = new Map<string, number[]>();
  for (const it of items) {
    const r = respuestas[it.id];
    if (typeof r !== "number") continue;
    por.set(it.escala, [...(por.get(it.escala) ?? []), it.invertido ? TOPE_ACUERDO - r : r]);
  }
  return Object.fromEntries([...por].map(([e, vs]) => [e, redondear(((media(vs) ?? 1) - 1) / (TOPE_ACUERDO - 2) * 100)]));
}

/** 100 dentro del rango; fuera, baja 2,5 puntos por cada punto de distancia. */
export function ajusteRango(valor: number, [min, max]: [number, number]): number {
  const distancia = valor < min ? min - valor : valor > max ? valor - max : 0;
  return redondear(Math.max(0, 100 - 2.5 * distancia), 1);
}

/**
 * Respuestas puntuales que van en la dirección de riesgo (las que tienen frase
 * de riesgo en ./cuestionarios): de acuerdo con algo riesgoso, o en desacuerdo
 * con algo deseable.
 */
function respuestasDeRiesgo(items: readonly ItemEscala[], escalas: readonly Escala[], respuestas: Record<string, number>): ItemEscala[] {
  const grupo = new Map(escalas.map((e) => [e.id, e.grupo]));
  return items.filter((it) => {
    const r = respuestas[it.id];
    if (!it.riesgo || typeof r !== "number") return false;
    const puntuado = it.invertido ? TOPE_ACUERDO - r : r;
    const g = grupo.get(it.escala);
    const favorable = g === "riesgo" || g === "control" ? TOPE_ACUERDO - puntuado : puntuado;
    return favorable <= 2;
  });
}

const respondioPlano = (respuestas: Record<string, number>) => new Set(Object.values(respuestas)).size === 1;
const unicas = (lista: string[]) => [...new Set(lista)].slice(0, MAX_PREGUNTAS_ENTREVISTA);
const rangoTexto = ([a, b]: [number, number]) => `${a}–${b}`;

/**
 * Perfil del cargo: cuatro rasgos de personalidad, competencias y riesgos,
 * comparados con lo que espera el cargo (configurable), más una escala de
 * simulación. Da el ajuste al cargo, el rasgo predominante, las respuestas a
 * revisar y preguntas para la entrevista.
 */
export function calificarPerfil(respuestas: Record<string, number>, u: Umbrales, perfil: PerfilCargo): ResultadoPrueba {
  const p = puntajesEscalas(ITEMS_PERFIL, respuestas);
  const metricas: Metrica[] = ESCALAS_CON_PERFIL.map((e) => {
    const valor = p[e.id] ?? null;
    const rango = perfil[e.id] ?? [0, 100];
    const ajuste = valor == null ? 0 : ajusteRango(valor, rango);
    return { clave: e.id, nombre: e.nombre, grupo: NOMBRE_GRUPO[e.grupo], valor, unidad: "/100", rango, ajuste, alerta: ajuste < 100 };
  });
  const sim = p.simulacion ?? null;
  const altaSimulacion = sim != null && sim > u.simulacionMax;
  metricas.push({ clave: "simulacion", nombre: "Simulación", grupo: NOMBRE_GRUPO.control, valor: sim, unidad: "/100", umbral: u.simulacionMax, alerta: altaSimulacion });

  const ajuste = redondear(media(metricas.filter((m) => m.ajuste != null).map((m) => m.ajuste!)) ?? 0, 1);
  const rasgos = ESCALAS_PERFIL.filter((e) => e.grupo === "rasgo");
  const predominante = rasgos.reduce((a, b) => ((p[b.id] ?? -1) > (p[a.id] ?? -1) ? b : a));

  const fuera = ESCALAS_CON_PERFIL.filter((e) => metricas.find((m) => m.clave === e.id)!.alerta);
  const alertas: string[] = [];
  for (const e of fuera) {
    const m = metricas.find((x) => x.clave === e.id)!;
    if (m.valor == null) continue;
    if (e.grupo === "riesgo" && m.valor > m.rango![1]) alertas.push(`${e.nombre} por encima de lo esperado para el cargo (${m.valor}; esperado ${rangoTexto(m.rango!)}).`);
    if (e.grupo === "competencia" && m.valor < m.rango![0]) alertas.push(`${e.nombre} por debajo de lo esperado para el cargo (${m.valor}; esperado ${rangoTexto(m.rango!)}).`);
  }
  if (altaSimulacion) alertas.push("Simulación alta: pudo responder para dar una buena imagen. Interprete el perfil con precaución.");
  if (respondioPlano(respuestas)) alertas.push("Marcó la misma opción en todas las preguntas del perfil: posible respuesta sin leer.");

  const enRiesgo = respuestasDeRiesgo(ITEMS_PERFIL, ESCALAS_PERFIL, respuestas);
  const entrevista = unicas([
    ...enRiesgo.flatMap((it) => (it.entrevista ? [it.entrevista] : [])),
    // Primero riesgos y competencias, después los rasgos.
    ...[...fuera].sort((a, b) => (a.grupo === "rasgo" ? 1 : 0) - (b.grupo === "rasgo" ? 1 : 0)).map((e) => e.entrevista),
    ...(altaSimulacion ? [ESCALAS_PERFIL.find((e) => e.id === "simulacion")!.entrevista] : []),
  ]);
  return {
    metricas,
    alertas,
    puntaje: ajuste,
    informe: {
      ajuste,
      banda: bandaDe(ajuste),
      rasgoPredominante: { id: predominante.id, nombre: predominante.nombre, descripcion: predominante.alto ?? predominante.descripcion },
      riesgos: enRiesgo.map((it) => it.riesgo!),
      entrevista,
    },
  };
}

/**
 * Integridad: ocho valores en tres factores (rectitud, honra y
 * confidencialidad), con un mínimo por valor y una escala de simulación que
 * se presenta al revés, como sinceridad.
 */
export function calificarIntegridad(respuestas: Record<string, number>, u: Umbrales): ResultadoPrueba {
  const p = puntajesEscalas(ITEMS_INTEGRIDAD, respuestas);
  const valores = ESCALAS_INTEGRIDAD.filter((e) => e.grupo === "valor");
  const factores = FACTORES_INTEGRIDAD.map((f) => {
    const vs = valores.filter((e) => e.factor === f.id).map((e) => p[e.id]).filter((v): v is number => v != null);
    return { ...f, valor: vs.length ? redondear(media(vs)!, 0) : null };
  });
  const sim = p.simulacion ?? null;
  const sinceridad = sim == null ? null : 100 - sim;
  const minimoSinceridad = 100 - u.simulacionMax;
  const bajaSinceridad = sinceridad != null && sinceridad < minimoSinceridad;

  const metricas: Metrica[] = [
    ...factores.map((f) => ({ clave: `factor_${f.id}`, nombre: f.nombre, grupo: "Resumen", valor: f.valor, unidad: "/100", alerta: f.valor == null || f.valor < u.integridadMinimo })),
    { clave: "sinceridad", nombre: "Sinceridad", grupo: "Resumen", valor: sinceridad, unidad: "/100", umbral: minimoSinceridad, alerta: bajaSinceridad },
    ...valores.map((e) => {
      const valor = p[e.id] ?? null;
      const factor = FACTORES_INTEGRIDAD.find((f) => f.id === e.factor)!.nombre;
      return { clave: e.id, nombre: e.nombre, grupo: factor, valor, unidad: "/100", umbral: u.integridadMinimo, alerta: valor == null || valor < u.integridadMinimo };
    }),
  ];
  const bajos = valores.filter((e) => (p[e.id] ?? 0) < u.integridadMinimo);
  const global = redondear(media(factores.map((f) => f.valor ?? 0)) ?? 0, 0);

  const alertas = bajos.map((e) => `${e.nombre} por debajo del mínimo (${p[e.id] ?? "sin respuesta"}; mínimo ${u.integridadMinimo}).`);
  if (bajaSinceridad) alertas.push("Sinceridad baja: pudo responder para dar una buena imagen. Interprete los valores con precaución.");
  if (respondioPlano(respuestas)) alertas.push("Marcó la misma opción en todas las preguntas de integridad: posible respuesta sin leer.");

  const enRiesgo = respuestasDeRiesgo(ITEMS_INTEGRIDAD, ESCALAS_INTEGRIDAD, respuestas);
  const entrevista = unicas([
    ...enRiesgo.flatMap((it) => (it.entrevista ? [it.entrevista] : [])),
    ...bajos.map((e) => e.entrevista),
    ...(bajaSinceridad ? [ESCALAS_INTEGRIDAD.find((e) => e.id === "simulacion")!.entrevista] : []),
  ]);
  return { metricas, alertas, puntaje: global, informe: { ajuste: global, banda: bandaDe(global), riesgos: enRiesgo.map((it) => it.riesgo!), entrevista } };
}

/** Lo que cada calificación necesita de la configuración. */
export interface CriteriosCalificacion {
  umbrales: Umbrales;
  perfil: PerfilCargo;
}

export function calificar<P extends ClavePrueba>(prueba: P, datos: DatosPrueba[P], c: CriteriosCalificacion): ResultadoPrueba {
  const u = c.umbrales;
  const d = datos as DatosPrueba[ClavePrueba];
  const r =
    prueba === "perfil" ? calificarPerfil((d as DatosPrueba["perfil"]).respuestas, u, c.perfil)
    : prueba === "integridad" ? calificarIntegridad((d as DatosPrueba["integridad"]).respuestas, u)
    : prueba === "reaccion" ? calificarReaccion((d as DatosPrueba["reaccion"]).ensayos, u)
    : prueba === "atencion" ? calificarAtencion((d as DatosPrueba["atencion"]).ensayos, u)
    : prueba === "anticipacion" ? calificarAnticipacion((d as DatosPrueba["anticipacion"]).ensayos, u)
    : prueba === "personalidad" ? calificarPersonalidad((d as DatosPrueba["personalidad"]).respuestas, u)
    : calificarCuestionario((d as DatosPrueba["cuestionario"]).respuestas, u);
  if (d.interrupciones > 0) {
    r.alertas.push(`Salió de la pantalla ${d.interrupciones} ${d.interrupciones === 1 ? "vez" : "veces"} durante la prueba.`);
  }
  return r;
}

export type Sugerencia = "sin_alertas" | "revisar";

/** Resumen del intento: promedio de las pruebas y si hay algo que mirar. */
export function resumenGlobal(resultados: { puntaje: number; alertas: string[] }[]): { puntaje: number; sugerencia: Sugerencia; alertas: string[] } {
  const alertas = resultados.flatMap((r) => r.alertas);
  return {
    puntaje: redondear(media(resultados.map((r) => r.puntaje)) ?? 0, 1),
    sugerencia: alertas.length ? "revisar" : "sin_alertas",
    alertas,
  };
}
