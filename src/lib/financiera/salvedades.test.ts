import { test } from "node:test";
import assert from "node:assert/strict";
import { notasSalvedades, SALVEDADES, salvedadesEnRango } from "./salvedades";

test("salvedadesEnRango(): el 972 solo lleva la salvedad en los meses que se numeraba 903", () => {
  assert.equal(salvedadesEnRango([{ periodo: "2025-06", codigoVehiculo: "972" }]).length, 1);
  assert.equal(salvedadesEnRango([{ periodo: "2025-01", codigoVehiculo: "972" }]).length, 1, "primer mes, inclusive");
  assert.equal(salvedadesEnRango([{ periodo: "2026-03", codigoVehiculo: "972" }]).length, 1, "último mes, inclusive");
  assert.equal(salvedadesEnRango([{ periodo: "2026-05", codigoVehiculo: "972" }]).length, 0, "desde mayo ya carga como 972");
  assert.equal(salvedadesEnRango([{ periodo: "2025-06", codigoVehiculo: "500" }]).length, 0, "otro vehículo");
  assert.equal(salvedadesEnRango([]).length, 0);
});

test("salvedadesEnRango(): una salvedad sale una sola vez aunque el rango tenga varios meses del bus", () => {
  const filas = ["2025-01", "2025-02", "2025-03"].map((periodo) => ({ periodo, codigoVehiculo: "972" }));
  assert.equal(salvedadesEnRango(filas).length, 1);
});

test("notasSalvedades(): la nota del informe nombra los dos códigos y la placa", () => {
  const [nota] = notasSalvedades(SALVEDADES);
  assert.match(nota, /972/);
  assert.match(nota, /903/);
  assert.match(nota, /UYX584/);
});
