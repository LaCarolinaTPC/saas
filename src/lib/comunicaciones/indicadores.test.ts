import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularIndicadores, claseAtencion, diaBogota, esOtroTema, esperaPersona, formatoDuracion, inicioDiaBogota, largoRango,
  leerFiltroAtendio, leerFiltroTipo, rangoAnterior, rangoUltimosDias, resolverPeriodo, resumirError, tiempos, variacion,
  type ConversacionFila, type EjecucionFila, type MensajeFila,
} from "./indicadores";

const RANGO = { desde: "2026-11-01", hasta: "2026-11-07" };
// 10:00 a. m. del 3 de noviembre en Bogotá (UTC-5).
const BASE = new Date("2026-11-03T15:00:00Z").getTime();
const min = (n: number) => new Date(BASE + n * 60_000).toISOString();

const conv = (id: string, extra: Partial<ConversacionFila> = {}): ConversacionFila => ({ id, created_at: min(0), ...extra });
const entra = (c: string, m: number): MensajeFila => ({ conversacion_id: c, direccion: "entrante", timestamp: min(m) });
const ia = (c: string, m: number): MensajeFila => ({
  conversacion_id: c, direccion: "saliente", generado_por_ia: true, enviado_por: "Agente IA", timestamp: min(m),
});
const persona = (c: string, m: number, extra: Partial<MensajeFila> = {}): MensajeFila => ({
  conversacion_id: c, direccion: "saliente", generado_por_ia: false, enviado_por: "Laura", timestamp: min(m), ...extra,
});
const automatico = (c: string, m: number): MensajeFila => ({
  conversacion_id: c, direccion: "saliente", generado_por_ia: false, enviado_por: "Seguimiento automático", timestamp: min(m),
});

test("días: se cuentan en hora de Bogotá, no en UTC", () => {
  // 11:30 p. m. del 2 de noviembre en Bogotá ya es 3 de noviembre en UTC.
  assert.equal(diaBogota("2026-11-03T04:30:00Z"), "2026-11-02");
  assert.equal(diaBogota("2026-11-03T05:00:00Z"), "2026-11-03");
  assert.equal(inicioDiaBogota("2026-11-03"), "2026-11-03T05:00:00.000Z");
  // A las 9 p. m. del 14 en Bogotá (2 a. m. del 15 en UTC), hoy sigue siendo el 14.
  assert.deepEqual(rangoUltimosDias(7, new Date("2026-11-15T02:00:00Z")), { desde: "2026-11-08", hasta: "2026-11-14" });
});

test("volumen: conversaciones por día de Bogotá, con los días vacíos en 0", () => {
  const r = calcularIndicadores({
    rango: RANGO,
    conversaciones: [
      conv("a", { created_at: "2026-11-02T04:30:00Z" }), // 1 nov en Bogotá
      conv("b", { created_at: "2026-11-02T05:30:00Z" }), // 2 nov
      conv("fuera", { created_at: "2026-11-08T06:00:00Z" }), // 8 nov: fuera del rango
    ],
    mensajes: [],
  });
  assert.equal(r.volumen.conversacionesNuevas, 2);
  assert.equal(r.volumen.porDia.length, 7);
  assert.deepEqual(r.volumen.porDia.slice(0, 3).map((d) => d.conversaciones), [1, 1, 0]);
  assert.equal(r.volumen.porDia[0].etiqueta, "1 nov");
});

test("quién atiende: solo asistente, asistente y persona, solo persona y sin respuesta", () => {
  const r = calcularIndicadores({
    rango: RANGO,
    conversaciones: [conv("ia"), conv("mixta"), conv("persona"), conv("nadie"), conv("saliente_sola")],
    mensajes: [
      entra("ia", 0), ia("ia", 1),
      entra("mixta", 0), ia("mixta", 1), persona("mixta", 30),
      entra("persona", 0), persona("persona", 10),
      // Un aviso automático no cuenta como atención.
      entra("nadie", 0), automatico("nadie", 60),
      // Empezó la empresa con una plantilla y nadie contestó: no entra en la base.
      persona("saliente_sola", 0, { plantilla: "bienvenida" }),
    ],
  });
  assert.deepEqual(
    { ...r.atencion },
    { base: 4, soloAsistente: 1, asistenteYPersona: 1, soloPersona: 1, sinRespuesta: 1, pctSoloAsistente: 25 }
  );
  assert.deepEqual(r.volumen.enviadosPor, { asistente: 2, gestionHumana: 2, plantilla: 1, automatico: 1 });
  assert.equal(r.volumen.recibidos, 4);
  assert.equal(r.volumen.enviados, 6);
});

test("quién atiende: un mensaje que WhatsApp rechazó no cuenta como respuesta", () => {
  const r = calcularIndicadores({
    rango: RANGO,
    conversaciones: [conv("x")],
    mensajes: [entra("x", 0), persona("x", 5, { estado: "failed" })],
  });
  assert.equal(r.atencion.sinRespuesta, 1);
  assert.equal(r.primeraRespuesta.general.n, 0);
});

test("primera respuesta: desde el primer mensaje del aspirante; asistente y persona por separado", () => {
  const r = calcularIndicadores({
    rango: RANGO,
    conversaciones: [conv("a"), conv("b"), conv("c"), conv("d")],
    mensajes: [
      // La plantilla previa al primer entrante no es respuesta.
      persona("a", -5, { plantilla: "saludo" }), entra("a", 0), entra("a", 1), ia("a", 2),
      entra("b", 0), ia("b", 4),
      entra("c", 0), automatico("c", 5), persona("c", 60),
      // Plantilla enviada por el sistema sí cuenta como respuesta.
      entra("d", 0), { ...automatico("d", 10), plantilla: "cita" },
    ],
  });
  assert.equal(r.primeraRespuesta.general.n, 4);
  assert.equal(r.primeraRespuesta.asistente.mediana, 3 * 60_000);
  // La plantilla del sistema entra en el total, no en la de una persona.
  assert.equal(r.primeraRespuesta.persona.n, 1);
  assert.equal(r.primeraRespuesta.persona.mediana, 60 * 60_000);
  assert.equal(r.primeraRespuesta.general.mediana, 7 * 60_000);
});

test("tiempos: mediana y p90; sin casos, null", () => {
  assert.deepEqual(tiempos([]), { n: 0, mediana: null, p90: null });
  assert.deepEqual(tiempos([5, 1, 3]), { n: 3, mediana: 3, p90: 5 });
  const diez = tiempos([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(diez.mediana, 5.5);
  assert.equal(diez.p90, 9);
});

test("pases: motivo, respondidos por una persona, sin respuesta y tiempo hasta la persona", () => {
  const ejec = (c: string, m: number, resultado: string, error: string | null = null): EjecucionFila => ({
    conversacion_id: c, created_at: min(m), resultado, error,
  });
  const r = calcularIndicadores({
    rango: RANGO,
    conversaciones: [
      conv("pidio", { agente_motivo_pausa: "humano", agente_pausado: true, agente_pausado_at: min(40) }),
      conv("decidio", { agente_motivo_pausa: "agente", agente_pausado: true, agente_pausado_at: min(10), requiere_humano: true }),
      conv("manual", { agente_motivo_pausa: "manual", agente_pausado: true, agente_pausado_at: min(5) }),
      conv("fallo", { agente_motivo_pausa: "agente", agente_pausado: true, agente_pausado_at: min(3), requiere_humano: true }),
      conv("normal"),
    ],
    mensajes: [
      entra("pidio", 0), ia("pidio", 2), persona("pidio", 40),
      entra("decidio", 0), ia("decidio", 10),
      entra("manual", 0), persona("manual", 25),
      entra("fallo", 0),
      entra("normal", 0), ia("normal", 1),
    ],
    ejecuciones: [
      ejec("pidio", 2, "transferido", "La persona pidió hablar con alguien."),
      ejec("decidio", 10, "transferido"),
      ejec("fallo", 3, "error", "Insufficient credits"),
      ejec("normal", 1, "respondido"),
    ],
  });
  assert.equal(r.pases.total, 4);
  assert.deepEqual(r.pases.porMotivo, { solicitud: 1, agente: 1, falla: 1, manual: 1 });
  assert.equal(r.pases.respondidos, 2);
  assert.equal(r.pases.sinRespuesta, 2);
  assert.equal(r.pases.tiempoHastaPersona.mediana, 29 * 60_000); // (38 + 20) / 2
  assert.equal(r.esperandoAhora, 2);
  assert.equal(r.asistente.error, 1);
  assert.deepEqual(r.asistente.errores, [{ clave: "Sin crédito en el proveedor de IA", etiqueta: "Sin crédito en el proveedor de IA", n: 1 }]);
});

test("esperando a una persona: la despedida del asistente no cuenta como respuesta", () => {
  const marcada = conv("x", { requiere_humano: true, agente_pausado: true, agente_motivo_pausa: "agente" });
  assert.equal(esperaPersona(marcada, [entra("x", 0), ia("x", 1)]), true);
  assert.equal(esperaPersona(marcada, [entra("x", 0), ia("x", 1), persona("x", 5)]), false);
  assert.equal(esperaPersona(marcada, [entra("x", 0), persona("x", 5), entra("x", 9)]), true);
  assert.equal(esperaPersona(conv("y"), [entra("y", 0)]), false);
});

test("embudo de selección: datos, autorización, hoja de vida (del chat o del proceso) y proceso", () => {
  const r = calcularIndicadores({
    rango: RANGO,
    conversaciones: [
      conv("a", { prefiltro: { nombre: "Ana", autorizacion: "si", hoja_vida: true }, proceso_id: "p1" }),
      conv("b", { prefiltro: { cedula: "123", autorizacion: "no", hoja_vida: false }, proceso_id: "p2" }),
      conv("c", { prefiltro: { nombre: null } }),
      conv("d"),
    ],
    mensajes: [],
    procesos: [
      { id: "p1", created_at: min(0), preseleccion: { global: "pasa" } },
      { id: "p3", created_at: min(0), preseleccion: { global: "no_cumple", incumplido: "edad" } },
      { id: "p4", created_at: min(0), preseleccion: { global: "no_cumple" }, requisito_incumplido: "SIMIT por encima del tope" },
      { id: "p5", created_at: min(0), preseleccion: null },
    ],
    vinculados: [{ id: "p2", created_at: min(0), hoja_vida_recibida_at: min(30), autorizacion_datos: null }],
  });
  assert.deepEqual(
    r.seleccion.embudo.map((e) => [e.clave, e.n]),
    [["nuevas", 4], ["datos", 2], ["autorizacion", 1], ["hoja_vida", 2], ["proceso", 2]]
  );
  assert.equal(r.seleccion.procesos, 4);
  assert.deepEqual(r.seleccion.semaforo, { pasa: 1, no_cumple: 2, incompleto: 0, sin_evaluar: 1 });
  assert.deepEqual(r.seleccion.causas.map((c) => c.etiqueta).sort(), ["Edad fuera del rango", "SIMIT por encima del tope"]);
});

test("reactivación: avisados y quienes volvieron a escribir después del último aviso", () => {
  const r = calcularIndicadores({
    rango: RANGO,
    conversaciones: [
      conv("volvio", { reactivacion_paso: 1, reactivacion_ultimo_at: min(100) }),
      conv("callado", { reactivacion_paso: 2, reactivacion_ultimo_at: min(100) }),
      conv("sin_aviso", { reactivacion_paso: 0 }),
    ],
    mensajes: [entra("volvio", 0), entra("volvio", 120), entra("callado", 0)],
  });
  assert.deepEqual(r.reactivacion, { disponible: true, avisados: 2, volvieron: 1 });
});

test("sin datos: los indicadores van en null, no en 0", () => {
  const r = calcularIndicadores({ rango: RANGO, conversaciones: [], mensajes: [], faltantes: ["wa_conversaciones.prefiltro"] });
  assert.equal(r.atencion.pctSoloAsistente, null);
  assert.equal(r.primeraRespuesta.general.mediana, null);
  assert.equal(r.seleccion.disponible, false);
  assert.equal(formatoDuracion(null), "—");
});

test("formato y errores: duración legible y errores agrupados por un texto corto", () => {
  assert.equal(formatoDuracion(13_400), "13 s");
  assert.equal(formatoDuracion(12 * 60_000), "12 min");
  assert.equal(formatoDuracion(125 * 60_000), "2 h 5 min");
  assert.equal(formatoDuracion(27 * 3_600_000), "1 d 3 h");
  assert.equal(resumirError("OpenRouter 402: Insufficient credits. Add more using https://openrouter.ai"), "Sin crédito en el proveedor de IA");
  assert.equal(resumirError("WhatsApp rechazó el envío."), "WhatsApp rechazó el envío");
  assert.equal(resumirError(null), "Sin detalle");
});

// ── Filtros, rango y comparación ─────────────────────────────────────────────

test("rango de fechas: desde y hasta mandan sobre dias; se valida y se avisa", () => {
  const ahora = new Date("2026-11-14T15:00:00Z");
  assert.deepEqual(resolverPeriodo({ dias: "7", desde: "2026-10-16", hasta: "2026-11-14" }, ahora), {
    rango: { desde: "2026-10-16", hasta: "2026-11-14" },
    dias: null,
  });
  assert.deepEqual(resolverPeriodo({ dias: "90" }, ahora), { rango: rangoUltimosDias(90, ahora), dias: 90 });
  // Sin nada (o con fechas en blanco, como las manda el formulario): 30 días, sin aviso.
  assert.deepEqual(resolverPeriodo({ desde: "", hasta: "" }, ahora), { rango: rangoUltimosDias(30, ahora), dias: 30 });

  const malos = [
    { desde: "2026-11-10" },
    { desde: "2026-13-01", hasta: "2026-11-14" },
    { desde: "2026-02-30", hasta: "2026-03-05" },
    { desde: "16/10/2026", hasta: "2026-11-14" },
    { desde: "2026-11-14", hasta: "2026-11-01" },
    { desde: "2026-01-01", hasta: "2026-11-14" }, // más de 180 días
  ];
  for (const m of malos) {
    const p = resolverPeriodo({ dias: "7", ...m }, ahora);
    assert.equal(p.dias, 7, JSON.stringify(m));
    assert.deepEqual(p.rango, rangoUltimosDias(7, ahora));
    assert.match(p.aviso ?? "", /últimos 7 días/);
  }
  // 180 días justos sí se aceptan.
  assert.equal(resolverPeriodo({ desde: "2026-05-19", hasta: "2026-11-14" }, ahora).dias, null);
  assert.equal(largoRango({ desde: "2026-05-19", hasta: "2026-11-14" }), 180);
});

test("rango de fechas: hasta va incluido y los días son de Bogotá", () => {
  const r = calcularIndicadores({
    rango: { desde: "2026-10-16", hasta: "2026-10-20" },
    conversaciones: [
      conv("antes", { created_at: "2026-10-16T04:59:00Z" }), // 15 oct, 11:59 p. m. en Bogotá
      conv("primera", { created_at: "2026-10-16T05:00:00Z" }), // 16 oct, medianoche
      conv("ultima", { created_at: "2026-10-21T04:59:00Z" }), // 20 oct, 11:59 p. m.: entra
      conv("despues", { created_at: "2026-10-21T05:00:00Z" }), // 21 oct
    ],
    mensajes: [],
    ejecuciones: [
      { conversacion_id: "primera", created_at: "2026-10-21T04:00:00Z", resultado: "respondido" },
      { conversacion_id: "primera", created_at: "2026-10-21T06:00:00Z", resultado: "respondido" },
    ],
  });
  assert.equal(r.volumen.conversacionesNuevas, 2);
  assert.equal(r.rango.dias, 5);
  assert.deepEqual(r.volumen.porDia.map((d) => d.conversaciones), [1, 0, 0, 0, 1]);
  // Las ejecuciones también se cuentan por el periodo.
  assert.equal(r.asistente.ejecuciones, 1);
});

/** Una conversación de cada tipo de atención, más una pasada sin respuesta y una de otro tema. */
function escenarioFiltros() {
  const ejec = (c: string, m: number, resultado: string): EjecucionFila => ({ conversacion_id: c, created_at: min(m), resultado });
  return {
    rango: RANGO,
    conversaciones: [
      conv("ia", { proceso_id: "p-ia" }),
      conv("mixta"),
      conv("persona"),
      conv("nadie"),
      conv("pasada", { agente_pausado: true, agente_motivo_pausa: "agente", agente_pausado_at: min(2), requiere_humano: true }),
      conv("vendedor", { prefiltro: { busca_trabajo: false } }),
      conv("aspirante", { prefiltro: { busca_trabajo: true, nombre: "Ana" } }),
    ],
    mensajes: [
      entra("ia", 0), ia("ia", 1),
      entra("mixta", 0), ia("mixta", 1), persona("mixta", 30),
      entra("persona", 0), persona("persona", 10),
      entra("nadie", 0),
      entra("pasada", 0), ia("pasada", 2),
      entra("vendedor", 0), ia("vendedor", 1),
      entra("aspirante", 0), ia("aspirante", 1),
    ],
    ejecuciones: [ejec("ia", 1, "respondido"), ejec("pasada", 2, "transferido"), ejec("vendedor", 1, "respondido")],
    procesos: [{ id: "p-ia", created_at: min(5), preseleccion: { global: "pasa" } }, { id: "p-otro", created_at: min(5) }],
  };
}

test("filtro de quién atendió: todas las secciones se calculan solo con esas conversaciones", () => {
  const base = escenarioFiltros();
  const todas = calcularIndicadores(base);
  assert.equal(todas.volumen.conversacionesNuevas, 7);
  assert.equal(todas.atencion.soloAsistente, 4);

  const soloIa = calcularIndicadores({ ...base, filtros: { atendio: "solo_asistente" } });
  assert.equal(soloIa.volumen.conversacionesNuevas, 4); // ia, pasada, vendedor, aspirante
  assert.equal(soloIa.atencion.base, 4);
  assert.equal(soloIa.atencion.pctSoloAsistente, 100);
  assert.equal(soloIa.asistente.ejecuciones, 3);
  // Solo los procesos de esas conversaciones.
  assert.equal(soloIa.seleccion.procesos, 1);

  const soloPersona = calcularIndicadores({ ...base, filtros: { atendio: "solo_persona" } });
  assert.equal(soloPersona.volumen.conversacionesNuevas, 1);
  assert.equal(soloPersona.asistente.ejecuciones, 0);
  assert.equal(soloPersona.seleccion.procesos, 0);

  assert.equal(calcularIndicadores({ ...base, filtros: { atendio: "asistente_persona" } }).volumen.conversacionesNuevas, 1);
  assert.equal(calcularIndicadores({ ...base, filtros: { atendio: "sin_respuesta" } }).atencion.sinRespuesta, 1);

  // Pasada a una persona y sin respuesta de una persona (la despedida del asistente no cuenta).
  const pasadas = calcularIndicadores({ ...base, filtros: { atendio: "pase_sin_respuesta" } });
  assert.equal(pasadas.volumen.conversacionesNuevas, 1);
  assert.equal(pasadas.pases.total, 1);
  assert.equal(pasadas.pases.sinRespuesta, 1);
  assert.equal(pasadas.esperandoAhora, 1);

  // Las mismas definiciones que «Quién atiende».
  assert.equal(claseAtencion([entra("x", 0), ia("x", 1), persona("x", 2)]), "asistente_persona");
  assert.equal(claseAtencion([entra("x", 0), persona("x", 2, { estado: "failed" })]), "sin_respuesta");
  assert.equal(claseAtencion([persona("x", 2)]), null);
});

test("filtro de tipo: «otros temas» si el asistente leyó que no busca trabajo; el resto, aspirantes", () => {
  const base = escenarioFiltros();
  const otros = calcularIndicadores({ ...base, filtros: { tipo: "otros" } });
  assert.equal(otros.volumen.conversacionesNuevas, 1);
  assert.equal(otros.asistente.ejecuciones, 1);
  const aspirantes = calcularIndicadores({ ...base, filtros: { tipo: "aspirantes" } });
  assert.equal(aspirantes.volumen.conversacionesNuevas, 6);
  // Se combinan: aspirantes atendidos solo por el asistente.
  const ambos = calcularIndicadores({ ...base, filtros: { tipo: "aspirantes", atendio: "solo_asistente" } });
  assert.equal(ambos.volumen.conversacionesNuevas, 3);
  assert.equal(esOtroTema(conv("x", { prefiltro: null })), false);
  assert.equal(leerFiltroTipo("cualquiera"), "todas");
  assert.equal(leerFiltroAtendio("solo_persona"), "solo_persona");
});

test("periodo anterior: mismo largo, termina el día antes", () => {
  assert.deepEqual(rangoAnterior({ desde: "2026-10-16", hasta: "2026-11-14" }), { desde: "2026-09-16", hasta: "2026-10-15" });
  assert.deepEqual(rangoAnterior({ desde: "2026-11-08", hasta: "2026-11-14" }), { desde: "2026-11-01", hasta: "2026-11-07" });
  assert.deepEqual(rangoAnterior({ desde: "2026-03-01", hasta: "2026-03-01" }), { desde: "2026-02-28", hasta: "2026-02-28" });
  // Con los mismos datos leídos una vez, cada periodo cuenta lo suyo.
  const datos = {
    conversaciones: [conv("vieja", { created_at: "2026-10-30T15:00:00Z" }), conv("nueva", { created_at: "2026-11-03T15:00:00Z" })],
    mensajes: [],
  };
  const actual = { desde: "2026-11-01", hasta: "2026-11-07" };
  assert.equal(calcularIndicadores({ ...datos, rango: actual }).volumen.conversacionesNuevas, 1);
  assert.equal(calcularIndicadores({ ...datos, rango: rangoAnterior(actual) }).volumen.conversacionesNuevas, 1);
});

test("variación: % para cantidades y tiempos, puntos para porcentajes, y si mejora o empeora", () => {
  assert.deepEqual(variacion(1633, 1420), { texto: "+15 %", flecha: "▲", tono: "neutro" });
  assert.deepEqual(variacion(80, 100, { sentido: "menos_es_mejor" }), { texto: "−20 %", flecha: "▼", tono: "mejor" });
  assert.deepEqual(variacion(120, 100, { sentido: "menos_es_mejor" }), { texto: "+20 %", flecha: "▲", tono: "peor" });
  assert.deepEqual(variacion(46.4, 42.1, { tipo: "puntos", sentido: "mas_es_mejor" }), { texto: "+4 pts", flecha: "▲", tono: "mejor" });
  assert.deepEqual(variacion(38, 42, { tipo: "puntos", sentido: "mas_es_mejor" }), { texto: "−4 pts", flecha: "▼", tono: "peor" });
  assert.deepEqual(variacion(10, 10, { sentido: "mas_es_mejor" }), { texto: "sin cambio", flecha: "", tono: "neutro" });
  // Antes era 0: no hay % posible, se muestra la diferencia.
  assert.deepEqual(variacion(12, 0, { sentido: "menos_es_mejor" }), { texto: "+12", flecha: "▲", tono: "peor" });
  assert.deepEqual(variacion(2400, 1000), { texto: "+140 %", flecha: "▲", tono: "neutro" });
  assert.equal(variacion(null, 10), null);
  assert.equal(variacion(10, null), null);
});
