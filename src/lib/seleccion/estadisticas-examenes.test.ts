import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularEstadisticasExamenes, categoriasDeCausa, leerRegistroExamenes, resultadoDeTexto, unirFuentes, type FilaExamen } from "./estadisticas-examenes";
import { efectoExamen } from "./examenes";

const ENC = ["CEDULAS", "NOMBRE", "LABORATORIO", "FECHA FASE 1", "RESULTADO FASE 1", "FECHA FASE 2", "RESULTADO FASE 2", "FASE GENERAL", "Fecha Fase Actual", "CAUSA"];

test("exámenes: el registro de Salud Ocupacional (27-nov-2026)", () => {
  const m: unknown[][] = [
    ENC,
    [10000001, "A", "RESCATE", new Date("2026-01-07T00:00:00Z"), "APTO", new Date("2026-01-08T00:00:00Z"), "APTO", "Apto para Contratación", null, null],
    [10000002, "B", "BIOBAC", new Date("2026-01-06T00:00:00Z"), "DESISTIMIENTO", null, "Pendiente", "DESISTIMIENTO", null, "SIN EXPLICACION"],
    [10000003, "C", "RESCATE", new Date("2026-02-07T00:00:00Z"), "NO APTO", new Date("2026-02-07T00:00:00Z"), "Pendiente", "NO APTO", null, "CALCULOS RENALES + COLUMNA"],
    [10000004, "D", "RESCATE", "22/02/2026", "APTO", "24/02/2026", "DESISTIMIENTO", "DESISTIMIENTO", null, "VIAJE"],
    [null, null, null, null, null, null, null, null, null, null],
    ["abc", "sin cédula", "RESCATE", null, "APTO", null, null, null, null, null],
  ];
  const r = leerRegistroExamenes(m);
  assert.equal(r.filas.length, 4);
  assert.equal(r.omitidas, 1);
  assert.equal(r.filas[1].resultadoFase2, null, "la fase 2 de quien desistió en la fase 1 no cuenta");
  assert.equal(r.filas[3].fechaFase1, "2026-02-22");
  const e = calcularEstadisticasExamenes(r.filas);
  assert.deepEqual(e.total.fase1, { apto: 2, no_apto: 1, desistio: 1, aplazado: 0, pendiente: 0 });
  assert.deepEqual(e.total.fase2, { apto: 1, no_apto: 0, desistio: 1, aplazado: 0, pendiente: 0 });
  assert.equal(e.total.aptosContratar, 1);
  assert.deepEqual(e.meses.map((x) => [x.mes, x.citados]), [["2026-01", 2], ["2026-02", 2]]);
  assert.deepEqual(e.causasNoApto, [{ causa: "Cálculos renales", n: 1 }, { causa: "Columna", n: 1 }]);
  assert.deepEqual(e.causasDesistio.fase1, [{ causa: "Sin explicación", n: 1 }]);
  assert.deepEqual(e.causasDesistio.fase2, [{ causa: "Viaje", n: 1 }]);
  assert.equal(e.laboratorios[0].laboratorio, "RESCATE");
  assert.equal(leerRegistroExamenes([["X"], [1]]).error !== undefined, true);
});

test("exámenes: causas, resultados y las dos fuentes", () => {
  assert.equal(resultadoDeTexto("DESISTIMIENTO"), "desistio");
  assert.equal(resultadoDeTexto("No apto"), "no_apto");
  assert.equal(resultadoDeTexto("Pendiente"), "pendiente");
  assert.deepEqual(categoriasDeCausa("SUSTANCIAS PSICOATIVAS"), ["Sustancias psicoactivas"]);
  assert.deepEqual(categoriasDeCausa("VIVE EN SANTA MARTA"), ["Vive lejos"]);
  assert.deepEqual(categoriasDeCausa("MEJOR LABORAL"), ["Mejor oferta laboral"]);
  const base: FilaExamen = { cedula: "1", nombre: null, laboratorio: null, fechaFase1: "2026-11-20", resultadoFase1: "apto", fechaFase2: null, resultadoFase2: "pendiente", causa: null, fuente: "historico" };
  const unidas = unirFuentes([base, { ...base, cedula: "2" }, { ...base, fechaFase1: "2026-03-01" }], [{ ...base, fechaFase1: "2026-11-25", fuente: "gestivo" }]);
  assert.equal(unidas.length, 3, "la misma cédula a 5 días cuenta una vez (vale Gestivo); la de marzo es otro proceso");
  assert.equal(unidas.filter((f) => f.fuente === "gestivo").length, 1);
});

test("exámenes: «desistió» cierra por desistimiento (27-nov-2026)", () => {
  assert.deepEqual(efectoExamen(1, "desistio", "en_examenes", []), { estado: null, citarFase2: false, proponeCierre: false, cerrarDesistimiento: true });
  assert.ok("error" in efectoExamen(2, "desistio", "en_examenes_fase2", []), "la fase 2 pide la fase 1 apta");
  assert.ok(!("error" in efectoExamen(2, "desistio", "en_examenes_fase2", [{ fase: 1, resultado: "apto" }])));
});
