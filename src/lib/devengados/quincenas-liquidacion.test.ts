import { test } from "node:test";
import assert from "node:assert/strict";
import { diaAnterior, elegirQuincena, quincenasConsultables, rangoQuincena } from "./quincenas-liquidacion";

const porClave = (hoy: string, cierre: string | null) => {
  const [actual, anterior] = quincenasConsultables(hoy, cierre);
  return { actual, anterior };
};

test("primera quincena: la actual llega hasta el último cierre y la anterior es la segunda del mes pasado", () => {
  const { actual, anterior } = porClave("2026-11-10", "2026-11-09");
  assert.deepEqual([actual.ini, actual.fin, actual.disponible], ["2026-11-01", "2026-11-09", true]);
  assert.deepEqual([anterior.ini, anterior.fin, anterior.disponible], ["2026-10-16", "2026-10-31", true]);
  assert.equal(actual.etiqueta, "Quincena actual · 1 al 15 de noviembre de 2026");
  assert.equal(actual.nota, "con cierres hasta el 9 de noviembre");
  assert.equal(anterior.nota, "completa");
});

test("segunda quincena: la anterior es la primera del mismo mes", () => {
  const { actual, anterior } = porClave("2026-11-20", "2026-11-19");
  assert.deepEqual([actual.ini, actual.fin], ["2026-11-16", "2026-11-19"]);
  assert.deepEqual([anterior.ini, anterior.fin], ["2026-11-01", "2026-11-15"]);
});

test("cambio de año y febrero", () => {
  assert.deepEqual(
    [porClave("2027-01-05", "2027-01-04").anterior.ini, porClave("2027-01-05", "2027-01-04").anterior.fin],
    ["2026-12-16", "2026-12-31"]
  );
  assert.equal(porClave("2027-03-03", "2027-03-02").anterior.fin, "2027-02-28");
  assert.equal(porClave("2028-03-03", "2028-03-02").anterior.fin, "2028-02-29");
});

test("el día 16 sin cierres nuevos: la actual no está disponible y la anterior llega al último cierre", () => {
  const { actual, anterior } = porClave("2026-11-16", "2026-11-14");
  assert.equal(actual.disponible, false);
  assert.equal(actual.nota, "todavía sin cierres");
  assert.deepEqual([anterior.fin, anterior.disponible], ["2026-11-14", true]);
  assert.equal(anterior.nota, "con cierres hasta el 14 de noviembre");
  assert.equal(elegirQuincena([actual, anterior], "actual")?.clave, "anterior");
});

test("un cierre posterior a la fecha operativa (modo prueba) no pasa de la fecha operativa", () => {
  const { actual } = porClave("2026-11-10", "2026-11-12");
  assert.equal(actual.fin, "2026-11-10");
});

test("sin ningún cierre no hay nada que consultar", () => {
  const opciones = quincenasConsultables("2026-11-10", null);
  assert.ok(opciones.every((o) => !o.disponible));
  assert.equal(elegirQuincena(opciones, "actual"), null);
});

test("elegirQuincena respeta la pedida y por defecto toma la actual", () => {
  const opciones = quincenasConsultables("2026-11-10", "2026-11-09");
  assert.equal(elegirQuincena(opciones, "anterior")?.clave, "anterior");
  assert.equal(elegirQuincena(opciones, null)?.clave, "actual");
  assert.equal(elegirQuincena(opciones, "2026-01-01")?.clave, "actual");
});

test("utilidades de fecha", () => {
  assert.equal(diaAnterior("2026-03-01"), "2026-02-28");
  assert.equal(diaAnterior("2027-01-01"), "2026-12-31");
  assert.equal(rangoQuincena("2026-11-16", "2026-11-30"), "16 al 30 de noviembre de 2026");
});
