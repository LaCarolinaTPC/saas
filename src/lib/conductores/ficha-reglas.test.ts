import { test } from "node:test";
import assert from "node:assert/strict";
import { antiguedad, edad, estadoVencimiento } from "./ficha-reglas";

test("edad: cumple o no según el día del año", () => {
  assert.equal(edad("1990-10-27", "2026-10-27"), 36);
  assert.equal(edad("1990-10-28", "2026-10-27"), 35);
  assert.equal(edad("1990-10-28T00:00:00", "2026-10-27"), 35);
  assert.equal(edad(null, "2026-10-27"), null);
  assert.equal(edad("2030-01-01", "2026-10-27"), null);
});

test("antigüedad: años y meses, meses o días", () => {
  assert.equal(antiguedad("2023-08-15", "2026-10-27"), "3 años y 2 meses");
  assert.equal(antiguedad("2025-10-27", "2026-10-27"), "1 año");
  assert.equal(antiguedad("2026-02-28", "2026-10-27"), "7 meses");
  assert.equal(antiguedad("2026-10-15", "2026-10-27"), "12 días");
  assert.equal(antiguedad("2026-11-01", "2026-10-27"), null);
});

test("estadoVencimiento: vencido, por vencer y vigente", () => {
  assert.deepEqual(estadoVencimiento("2026-10-20", "2026-10-27"), { clave: "vencido", dias: -7, texto: "Vencida hace 7 días" });
  assert.equal(estadoVencimiento("2026-10-27", "2026-10-27")?.texto, "Vence hoy");
  assert.equal(estadoVencimiento("2026-11-10", "2026-10-27")?.clave, "por_vencer");
  assert.equal(estadoVencimiento("2027-03-01", "2026-10-27")?.clave, "vigente");
  assert.equal(estadoVencimiento(null, "2026-10-27"), null);
});
