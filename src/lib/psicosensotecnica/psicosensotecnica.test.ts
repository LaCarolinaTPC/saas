import { test } from "node:test";
import assert from "node:assert/strict";
import { ANTICIPACION, ATENCION, ITEMS, ITEMS_PERSONALIDAD, RASGOS, REACCION, validarDatos, type EnsayoAtencion, type EnsayoReaccion } from "./bateria";
import { CONFIG_POR_DEFECTO, leerConfig, validarConfig } from "./config";
import {
  ajusteRango, calificar, calificarAnticipacion, calificarAtencion, calificarCuestionario, calificarIntegridad, calificarPerfil, calificarPersonalidad,
  calificarReaccion, componente, mediana, puntajesEscalas, resumenGlobal,
} from "./calificacion";
import { ESCALAS_CON_PERFIL, ESCALAS_INTEGRIDAD, ESCALAS_PERFIL, ITEMS_INTEGRIDAD, ITEMS_PERFIL, type ItemEscala } from "./cuestionarios";
import { enCursoVigente, puedePresentar, type SituacionCedula } from "./acceso";

const U = CONFIG_POR_DEFECTO.umbrales;

function reaccion(trSimple: number, trEleccion: number, erroresEleccion = 0): EnsayoReaccion[] {
  return [
    ...Array.from({ length: REACCION.ensayosSimple }, (): EnsayoReaccion => ({ fase: "simple", tr: trSimple, anticipada: false })),
    ...Array.from({ length: REACCION.ensayosEleccion }, (_, i): EnsayoReaccion => ({
      fase: "eleccion", lado: "izq", respuesta: i < erroresEleccion ? "der" : "izq", tr: trEleccion, anticipada: false,
    })),
  ];
}

function atencion(omitidos = 0, falsas = 0, trPrimera = 400, trSegunda = 400): EnsayoAtencion[] {
  let om = omitidos;
  let fa = falsas;
  return Array.from({ length: ATENCION.estimulos }, (_, i): EnsayoAtencion => {
    const objetivo = i % 4 === 0;
    if (objetivo) {
      const responde = om-- <= 0;
      return { objetivo, respondio: responde, tr: responde ? (i < ATENCION.estimulos / 2 ? trPrimera : trSegunda) : null };
    }
    const responde = fa-- > 0;
    return { objetivo, respondio: responde, tr: responde ? 300 : null };
  });
}

test("mediana y componente", () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), null);
  assert.equal(componente(250, 250, 550), 100);
  assert.equal(componente(550, 250, 550), 50);
  assert.equal(componente(850, 250, 550), 0);
  assert.equal(componente(2000, 250, 550), 0);
  assert.equal(componente(null, 250, 550), 0);
});

test("reacción: rápida y sin errores no alerta", () => {
  const r = calificarReaccion(reaccion(300, 450), U);
  assert.deepEqual(r.alertas, []);
  assert.equal(r.metricas.find((m) => m.clave === "simple")!.valor, 300);
  assert.ok(r.puntaje > 80, String(r.puntaje));
});

test("reacción: lenta y con errores de lado alerta", () => {
  const r = calificarReaccion(reaccion(700, 950, 6), U);
  assert.equal(r.alertas.length, 3);
  assert.equal(r.metricas.find((m) => m.clave === "errores")!.valor, 37.5);
  // Solo le queda el componente de fallos (no se adelantó ni dejó de responder).
  assert.ok(r.puntaje < 45, String(r.puntaje));
});

test("reacción: adelantadas y omisiones cuentan como fallos y no entran a la mediana", () => {
  const e = reaccion(300, 450);
  e[0] = { fase: "simple", tr: 40, anticipada: true };
  e[1] = { fase: "simple", tr: null, anticipada: false };
  e[2] = { fase: "simple", tr: 90, anticipada: false };
  const r = calificarReaccion(e, U);
  assert.equal(r.metricas.find((m) => m.clave === "simple")!.valor, 300);
  assert.equal(r.metricas.find((m) => m.clave === "fallos")!.valor, 10.7);
});

test("reacción: sin ninguna respuesta válida alerta en vez de pasar en blanco", () => {
  const e = reaccion(300, 450).map((x) => ({ ...x, tr: null }));
  const r = calificarReaccion(e, U);
  assert.ok(r.alertas.length >= 2);
  assert.equal(r.puntaje, 0);
});

test("atención: limpia no alerta; omisiones, impulsividad y fatiga sí", () => {
  assert.deepEqual(calificarAtencion(atencion(), U).alertas, []);
  assert.equal(calificarAtencion(atencion(10), U).alertas.length, 1);
  assert.equal(calificarAtencion(atencion(0, 30), U).alertas.length, 1);
  const fatiga = calificarAtencion(atencion(0, 0, 400, 560), U);
  assert.equal(fatiga.metricas.find((m) => m.clave === "caida")!.valor, 40);
  assert.equal(fatiga.alertas.length, 1);
});

test("anticipación: precisa, adelantada y sin respuestas", () => {
  const e = (errorMs: number | null) => Array.from({ length: ANTICIPACION.ensayos }, () => ({ visibleMs: 1500, ocultoMs: 1200, errorMs }));
  assert.deepEqual(calificarAnticipacion(e(120), U).alertas, []);
  const adelantada = calificarAnticipacion(e(-700), U);
  assert.match(adelantada.alertas[0], /se adelanta/);
  const vacia = calificarAnticipacion(e(null), U);
  assert.equal(vacia.puntaje, 0);
  assert.match(vacia.alertas[0], /No respondió/);
});

test("cuestionario: invierte los ítems y detecta la respuesta plana", () => {
  const seguro = Object.fromEntries(ITEMS.map((i) => [i.id, i.invertido ? 5 : 1]));
  const r = calificarCuestionario(seguro, U);
  assert.deepEqual(r.alertas, []);
  assert.equal(r.puntaje, 100);
  assert.ok(r.metricas.every((m) => m.valor === 1));

  const riesgoso = Object.fromEntries(ITEMS.map((i) => [i.id, i.invertido ? 1 : 5]));
  assert.equal(calificarCuestionario(riesgoso, U).alertas.length, 4);

  const plano = Object.fromEntries(ITEMS.map((i) => [i.id, 3]));
  assert.ok(calificarCuestionario(plano, U).alertas.some((a) => /misma opción/.test(a)));
});

test("personalidad: 50 ítems, 10 por rasgo; invierte, alerta solo los rasgos clave bajos", () => {
  assert.equal(ITEMS_PERSONALIDAD.length, 50);
  for (const r of RASGOS) assert.equal(ITEMS_PERSONALIDAD.filter((i) => i.rasgo === r).length, 10, r);

  const todo = (alto: boolean) => Object.fromEntries(ITEMS_PERSONALIDAD.map((i) => [i.id, alto !== !!i.invertido ? 5 : 1]));
  const alto = calificarPersonalidad(todo(true), U);
  assert.ok(alto.metricas.every((m) => m.valor === 5));
  assert.deepEqual(alto.alertas, []);
  assert.equal(alto.puntaje, 100);

  const bajo = calificarPersonalidad(todo(false), U);
  assert.ok(bajo.metricas.every((m) => m.valor === 1));
  // Extraversión y apertura bajas no se resaltan: no dicen nada de conducir.
  assert.equal(bajo.alertas.length, 3);
  assert.deepEqual(bajo.metricas.filter((m) => m.alerta).map((m) => m.clave).sort(), ["amabilidad", "estabilidad", "responsabilidad"]);

  const plano = calificarPersonalidad(Object.fromEntries(ITEMS_PERSONALIDAD.map((i) => [i.id, 3])), U);
  assert.ok(plano.alertas.some((a) => /misma opción/.test(a)));

  assert.ok(validarDatos("personalidad", { respuestas: todo(true) }).ok);
  assert.ok(!validarDatos("personalidad", { respuestas: Object.fromEntries(ITEMS.map((i) => [i.id, 2])) }).ok);
});

// ── Perfil del cargo e integridad ─────────────────────────────────────────
/** Respuestas que dan a cada escala el puntaje que se pida (1 a 5, ya invertido). */
function responder(items: readonly ItemEscala[], porEscala: Record<string, number>, base = 3): Record<string, number> {
  return Object.fromEntries(items.map((it) => {
    const v = porEscala[it.escala] ?? base;
    return [it.id, it.invertido ? 6 - v : v];
  }));
}
const aCinco = (p: number) => 1 + (p / 100) * 4;

test("cuestionarios: ids únicos, escalas conocidas y preguntas intercaladas", () => {
  for (const [items, escalas] of [[ITEMS_PERFIL, ESCALAS_PERFIL], [ITEMS_INTEGRIDAD, ESCALAS_INTEGRIDAD]] as const) {
    assert.equal(new Set(items.map((i) => i.id)).size, items.length);
    const ids = new Set(escalas.map((e) => e.id));
    assert.ok(items.every((i) => ids.has(i.escala)));
    for (const e of escalas) assert.ok(items.filter((i) => i.escala === e.id).length >= 4, e.id);
    assert.ok(items.slice(1).every((it, i) => it.escala !== items[i].escala), "dos seguidas de la misma escala");
  }
  // Todas las escalas del perfil tienen rango sugerido.
  for (const e of ESCALAS_CON_PERFIL) assert.ok(CONFIG_POR_DEFECTO.perfil[e.id], e.id);
});

test("cuestionarios (1.3): los ítems IPIP traen su original y no repiten la prueba de cinco rasgos", () => {
  const todos = [...ITEMS_PERFIL, ...ITEMS_INTEGRIDAD];
  const ipip = todos.filter((i) => i.ipip);
  assert.ok(ipip.length >= 60, String(ipip.length));
  // Id distinto de la versión 1.2: una respuesta vieja nunca se lee como la de un ítem nuevo.
  assert.ok(ipip.every((i) => /_i\d+$/.test(i.id)));
  const norm = (s: string) => s.toLowerCase().replace(/[^a-záéíóúñü ]/g, "").trim();
  const cincoRasgos = new Set(ITEMS_PERSONALIDAD.map((i) => norm(i.texto)));
  assert.deepEqual(todos.filter((i) => cincoRasgos.has(norm(i.texto))).map((i) => i.texto), []);
  // Ningún texto repetido entre perfil e integridad.
  const textos = todos.map((i) => norm(i.texto));
  assert.equal(new Set(textos).size, textos.length);
});

test("puntajesEscalas y ajusteRango", () => {
  const p = puntajesEscalas(ITEMS_PERFIL, responder(ITEMS_PERFIL, { ansiedad: 5, responsabilidad: 1 }));
  assert.equal(p.ansiedad, 100);
  assert.equal(p.responsabilidad, 0);
  assert.equal(p.serenidad, 50);
  assert.equal(ajusteRango(50, [40, 60]), 100);
  assert.equal(ajusteRango(70, [40, 60]), 75);
  assert.equal(ajusteRango(0, [60, 100]), 0);
});

test("perfil: un conductor dentro del perfil se ajusta; con riesgos altos y simulación, no", () => {
  const ideal = Object.fromEntries(ESCALAS_CON_PERFIL.map((e) => {
    const [a, b] = CONFIG_POR_DEFECTO.perfil[e.id];
    return [e.id, aCinco((a + b) / 2)];
  }));
  const bien = calificarPerfil(responder(ITEMS_PERFIL, { ...ideal, simulacion: 2 }), U, CONFIG_POR_DEFECTO.perfil);
  assert.equal(bien.informe!.banda, "recomendado");
  assert.deepEqual(bien.alertas, []);
  assert.ok(bien.informe!.ajuste > 95, String(bien.informe!.ajuste));

  const mal = calificarPerfil(responder(ITEMS_PERFIL, { ...ideal, agresividad: 5, impulsividad: 5, responsabilidad: 1, servicio: 1, simulacion: 5 }), U, CONFIG_POR_DEFECTO.perfil);
  assert.ok(mal.alertas.some((a) => /Agresividad por encima/.test(a)));
  assert.ok(mal.alertas.some((a) => /Responsabilidad por debajo/.test(a)));
  assert.ok(mal.alertas.some((a) => /Simulación alta/.test(a)));
  // Respuestas puntuales de riesgo y preguntas para la entrevista.
  assert.ok(mal.informe!.riesgos.some((r) => /desquita/.test(r)));
  assert.ok(mal.informe!.entrevista.length > 0 && mal.informe!.entrevista.length <= 8);
  assert.ok(mal.informe!.ajuste < bien.informe!.ajuste);
});

test("perfil: el rasgo predominante es el más alto", () => {
  const r = calificarPerfil(responder(ITEMS_PERFIL, { dominancia: 2, influencia: 2, serenidad: 5, cumplimiento: 3 }), U, CONFIG_POR_DEFECTO.perfil);
  assert.equal(r.informe!.rasgoPredominante!.id, "serenidad");
});

test("integridad: valores altos pasan; uno bajo, la sinceridad baja y las respuestas de riesgo se señalan", () => {
  const altos = Object.fromEntries(ESCALAS_INTEGRIDAD.filter((e) => e.grupo === "valor").map((e) => [e.id, 5]));
  const bien = calificarIntegridad(responder(ITEMS_INTEGRIDAD, { ...altos, simulacion: 2 }), U);
  assert.equal(bien.informe!.ajuste, 100);
  assert.equal(bien.informe!.banda, "recomendado");
  assert.deepEqual(bien.alertas, []);
  assert.equal(bien.metricas.find((m) => m.clave === "sinceridad")!.valor, 75);

  const mal = calificarIntegridad(responder(ITEMS_INTEGRIDAD, { ...altos, no_corrupcion: 1, simulacion: 5 }), U);
  assert.ok(mal.alertas.some((a) => /No corrupción por debajo/.test(a)));
  assert.ok(mal.alertas.some((a) => /Sinceridad baja/.test(a)));
  assert.ok(mal.informe!.riesgos.some((r) => /pasajeros sin pagar/.test(r)));
  assert.ok(mal.informe!.entrevista.some((q) => /mitad del pasaje/.test(q)));
  // Los factores agrupan sus valores.
  assert.equal(mal.metricas.find((m) => m.clave === "factor_honra")!.valor, 67);
});

test("validarDatos de perfil e integridad", () => {
  assert.ok(validarDatos("perfil", { respuestas: responder(ITEMS_PERFIL, {}) }).ok);
  assert.ok(validarDatos("integridad", { respuestas: responder(ITEMS_INTEGRIDAD, {}) }).ok);
  assert.ok(!validarDatos("integridad", { respuestas: responder(ITEMS_PERFIL, {}) }).ok);
  const r = calificar("integridad", { respuestas: responder(ITEMS_INTEGRIDAD, {}), interrupciones: 1 }, CONFIG_POR_DEFECTO);
  assert.ok(r.informe && r.alertas.some((a) => /1 vez/.test(a)));
});

test("calificar añade las salidas de pantalla y el resumen pide revisar", () => {
  const r = calificar("reaccion", { ensayos: reaccion(300, 450), interrupciones: 2 }, CONFIG_POR_DEFECTO);
  assert.match(r.alertas[0], /2 veces/);
  assert.equal(resumenGlobal([r, { puntaje: 90, alertas: [] }]).sugerencia, "revisar");
  assert.equal(resumenGlobal([{ puntaje: 80, alertas: [] }, { puntaje: 90, alertas: [] }]).sugerencia, "sin_alertas");
  assert.equal(resumenGlobal([{ puntaje: 80, alertas: [] }, { puntaje: 90, alertas: [] }]).puntaje, 85);
});

test("validarDatos: acepta lo completo y rechaza lo incompleto o fuera de rango", () => {
  assert.ok(validarDatos("reaccion", { ensayos: reaccion(300, 450), interrupciones: 0 }).ok);
  assert.ok(!validarDatos("reaccion", { ensayos: reaccion(300, 450).slice(1) }).ok);
  assert.ok(!validarDatos("reaccion", { ensayos: reaccion(99999, 450) }).ok);
  assert.ok(validarDatos("atencion", { ensayos: atencion() }).ok);
  assert.ok(!validarDatos("atencion", { ensayos: atencion().map((e) => ({ ...e, objetivo: false })) }).ok);
  assert.ok(!validarDatos("anticipacion", { ensayos: [] }).ok);
  assert.ok(!validarDatos("cuestionario", { respuestas: { i1: 3 } }).ok);
  assert.ok(!validarDatos("cuestionario", { respuestas: Object.fromEntries(ITEMS.map((i) => [i.id, 9])) }).ok);
  assert.ok(!validarDatos("cuestionario", null).ok);
  // Solo pasan los campos conocidos.
  const v = validarDatos("cuestionario", { respuestas: { ...Object.fromEntries(ITEMS.map((i) => [i.id, 2])), extra: 1 }, otro: "x" });
  assert.ok(v.ok && !("extra" in v.datos.respuestas) && !("otro" in v.datos));
});

test("config: lo que falta se completa y lo inválido se rechaza", () => {
  assert.deepEqual(leerConfig(null), CONFIG_POR_DEFECTO);
  assert.deepEqual(leerConfig({}), CONFIG_POR_DEFECTO);
  const c = leerConfig({ acceso: "libre", intentosMaximos: 99, umbrales: { reaccionSimpleMs: 600, atencionCaidaPct: -5 }, pruebas: { reaccion: false } });
  assert.equal(c.acceso, "libre");
  assert.equal(c.intentosMaximos, 1);
  assert.equal(c.umbrales.reaccionSimpleMs, 600);
  assert.equal(c.umbrales.atencionCaidaPct, 25);
  assert.equal(c.pruebas.reaccion, false);
  // Todas apagadas no es una configuración usable.
  assert.equal(leerConfig({ pruebas: { reaccion: false, atencion: false, anticipacion: false, cuestionario: false, personalidad: false, perfil: false, integridad: false } }).pruebas.reaccion, true);
  // El perfil del cargo se completa con el sugerido y rechaza un rango al revés.
  assert.deepEqual(leerConfig({}).perfil, CONFIG_POR_DEFECTO.perfil);
  assert.deepEqual(leerConfig({ perfil: { ansiedad: [0, 50], rumor: [60, 10] } }).perfil.ansiedad, [0, 50]);
  assert.deepEqual(leerConfig({ perfil: { rumor: [60, 10] } }).perfil.rumor, CONFIG_POR_DEFECTO.perfil.rumor);
  assert.ok(!validarConfig({ ...CONFIG_POR_DEFECTO, perfil: { ...CONFIG_POR_DEFECTO.perfil, ansiedad: [50, 10] } }).ok);
  // Una configuración guardada antes de que existiera una prueba la recibe encendida.
  assert.equal(leerConfig({ pruebas: { reaccion: true } }).pruebas.personalidad, true);

  assert.ok(validarConfig(CONFIG_POR_DEFECTO).ok);
  assert.ok(!validarConfig({ ...CONFIG_POR_DEFECTO, intentosMaximos: 0 }).ok);
  assert.ok(!validarConfig({ ...CONFIG_POR_DEFECTO, acceso: "todos" }).ok);
  assert.ok(!validarConfig({ ...CONFIG_POR_DEFECTO, pruebas: {} }).ok);
  assert.ok(!validarConfig({ ...CONFIG_POR_DEFECTO, umbrales: { ...U, cuestionarioPromedio: 7 } }).ok);
});

test("acceso: solo candidatos, libre, intentos, asignación y equipo", () => {
  const base: SituacionCedula = { equipoValido: true, tieneAsignacion: false, enCurso: false, esCandidato: false, terminadas: 0 };
  const solo = CONFIG_POR_DEFECTO;
  const libre = { ...CONFIG_POR_DEFECTO, acceso: "libre" as const };
  const motivo = (r: ReturnType<typeof puedePresentar>) => (r.ok ? null : r.motivo);

  assert.equal(motivo(puedePresentar(solo, base)), "no_candidato");
  assert.equal(motivo(puedePresentar(solo, { ...base, esCandidato: true })), null);
  assert.equal(motivo(puedePresentar(libre, base)), null);
  assert.equal(motivo(puedePresentar(libre, { ...base, terminadas: 1 })), "sin_intentos");
  assert.equal(motivo(puedePresentar({ ...libre, intentosMaximos: 2 }, { ...base, terminadas: 1 })), null);
  // La asignación es una autorización expresa: vale sin proceso y sin intentos.
  assert.equal(motivo(puedePresentar(solo, { ...base, tieneAsignacion: true, terminadas: 3 })), null);
  assert.equal(motivo(puedePresentar(solo, { ...base, enCurso: true, terminadas: 1 })), null);
  // El equipo y el apagado mandan sobre todo lo demás.
  const conEquipo = { ...libre, exigirEquipoVinculado: true };
  assert.equal(motivo(puedePresentar(conEquipo, { ...base, equipoValido: false, tieneAsignacion: true })), "equipo");
  assert.equal(motivo(puedePresentar(conEquipo, base)), null);
  assert.equal(motivo(puedePresentar({ ...libre, activo: false }, { ...base, tieneAsignacion: true })), "inactiva");
});

test("enCursoVigente: 24 horas", () => {
  const ahora = new Date("2026-11-20T12:00:00Z");
  assert.ok(enCursoVigente("2026-11-20T08:00:00Z", ahora));
  assert.ok(!enCursoVigente("2026-11-19T11:00:00Z", ahora));
  assert.ok(!enCursoVigente(null, ahora));
});
