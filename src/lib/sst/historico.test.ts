import { test } from "node:test";
import assert from "node:assert/strict";
import { agenteDe, fechaDe, filasDeHoja, grupoParteCuerpoDe, horaDe, mapearFilaAt, mecanismoDe, tipoLesionDe } from "./historico";

test("catálogos: los textos del Excel a las claves", () => {
  assert.equal(tipoLesionDe("GOLPE O CONTUSION"), "golpe_contusion");
  assert.equal(tipoLesionDe("TORCEDURA / ESGUINCE"), "torcedura_esguince");
  assert.equal(tipoLesionDe("LESION EN OJO POR CUERPO EXTRAÑO"), "ojo_cuerpo_extrano");
  assert.equal(tipoLesionDe("APLASTAMIENTO"), "aplastamiento");
  assert.equal(tipoLesionDe("RASGUÑO O PINCHAZO "), "rasguno_pinchazo");
  assert.equal(mecanismoDe("SOBRE ESFUERZO, ESFUERZO EXC, FALSO MOV."), "sobre_esfuerzo");
  assert.equal(mecanismoDe("PISADAS, CHOQUES O GOLPES"), "pisadas_choques_golpes");
  assert.equal(mecanismoDe("ATRAPAMIENTOS"), "atrapamiento");
  assert.equal(mecanismoDe("CAIDA DE OBJETOS"), "caida_objetos");
  assert.equal(agenteDe("AMBIENTE DE TRABAJO"), "ambiente_trabajo");
  assert.equal(agenteDe("MAQUINAS Y/O EQUIPOS"), "maquinas_equipos");
  assert.equal(agenteDe("HERRAMIENTAS, IMPLEMENTOS O UTENSILIOS"), "herramientas");
  assert.equal(tipoLesionDe("ALGO RARO"), null);
});

test("grupoParteCuerpoDe: como agrupó SST en su caracterización", () => {
  const g = (s: string) => grupoParteCuerpoDe(s);
  assert.equal(g("MANO IZQUIERDA"), "manos");
  assert.equal(g("PIE DERECHO"), "pies");
  assert.equal(g("TOBILLO IZQUIERDO"), "pies");
  assert.equal(g("BRAZO IZQUIERDO"), "miembros_superiores");
  assert.equal(g("HOMBRO DERECHO"), "miembros_superiores");
  assert.equal(g("PIERNA Y BRAZO IZQUIERDO"), "miembros_superiores");
  assert.equal(g("PIERNA DERECHA"), "miembros_inferiores");
  assert.equal(g("CADERA"), "miembros_inferiores");
  assert.equal(g("ESPALDA"), "torax");
  assert.equal(g("TORAX"), "torax");
  assert.equal(g("CABEZA"), "cabeza_cara");
  assert.equal(g("CARA"), "cabeza_cara");
  assert.equal(g("OJO DERECHO"), "ojo");
  assert.equal(g(""), "otro");
});

test("fechas y horas del Excel", () => {
  assert.equal(fechaDe(46027), "2026-01-05");
  assert.equal(fechaDe("1/24/26"), "2026-01-24");
  assert.equal(fechaDe("24/01/2026"), "2026-01-24");
  assert.equal(fechaDe(""), null);
  assert.equal(horaDe(0.375), "09:00");
  assert.equal(horaDe("8:15:00 PM"), "20:15");
  assert.equal(horaDe("12:30:00 AM"), "00:30");
  assert.equal(horaDe(""), null);
});

const FILA = [
  "4 ", "FEBRERO", 46066, null, "1048205409", "SALOMON LASCAR PESTANA", "CONDUCTOR - COBRADOR", "MTLC", "SOLEDAD", "GOLPE O CONTUSION",
  "EL DIA 13/02/2026 ...", "BRAZO IZQUIERDO", "PISADAS, CHOQUES O GOLPES", "MEDIOS DE TRANSPORTE", "SI", 0.84375, "3", "M", "VIERNES", "", "",
];

test("mapearFilaAt: una fila completa", () => {
  const r = mapearFilaAt({ hoja: "Consolidado 2026", fila: 7, celdas: FILA });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.caso, 4);
  assert.equal(r.anio, 2026);
  assert.equal(r.historicoRef, "Consolidado 2026:7");
  assert.equal(r.datos.fechaAt, "2026-02-13");
  assert.equal(r.datos.hora, "20:15");
  assert.equal(r.datos.nombre, "Salomon Lascar Pestana");
  assert.equal(r.datos.cargo, "Conductor - cobrador");
  assert.equal(r.datos.parteCuerpoGrupo, "miembros_superiores");
  assert.equal(r.datos.accidenteTransito, true);
  assert.equal(r.datos.diasIncapacidad, 3);
  assert.deepEqual(r.avisos, []);
});

test("mapearFilaAt: avisa si MES o DÍA no cuadran con la fecha", () => {
  const r = mapearFilaAt({ hoja: "Consolidado 2026", fila: 7, celdas: FILA.map((v, i) => (i === 18 ? "LUNES" : v)) });
  assert.equal(r.ok && r.avisos.some((a) => /DÍA dice LUNES/.test(a)), true);
});

test("filasDeHoja: los casos, sin las listas desplegables de abajo", () => {
  const crudas = [["CARACTERIZACION"], [], [" CASO No ", "MES"], FILA, FILA.map((v, i) => (i === 0 ? "5" : v)), [], ["", "LOGISTICA", "", "", "GOLPE O CONTUSION"]];
  assert.equal(filasDeHoja("Consolidado 2026", crudas).length, 2);
});
