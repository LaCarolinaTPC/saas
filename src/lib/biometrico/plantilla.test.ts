import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entraEnPlantilla,
  esPersona,
  estaActivo,
  estaReubicado,
  type FilaConductor,
} from "./plantilla";

function conductor(extra: Partial<FilaConductor> = {}): FilaConductor {
  return {
    cedula: "72008791",
    estado: "ACTIVO",
    reubicado: null,
    fecha_ingreso: "2020-01-15",
    // Confirmada por GEMA: es el caso normal. Las fichas sin `codigo` se
    // prueban aparte, en conductores/confirmacion.test.ts.
    codigo: "4273",
    created_at: "2020-01-15T10:00:00+00:00",
    ...extra,
  };
}

const HOY = "2026-10-19";

// ── Estado ─────────────────────────────────────────────────────────────────

test("solo ACTIVO entra; RETIRADO no", () => {
  // En la base solo hay esos dos valores: 200 ACTIVO y 1.089 RETIRADO.
  assert.equal(estaActivo("ACTIVO"), true);
  assert.equal(estaActivo("RETIRADO"), false);
});

test("el estado tolera minúsculas, espacios y la bandera numérica", () => {
  assert.equal(estaActivo(" activo "), true);
  assert.equal(estaActivo("1"), true);
  assert.equal(estaActivo("0"), false);
  assert.equal(estaActivo(null), false);
  assert.equal(estaActivo(""), false);
});

test("un ACTIVO con fecha_retiro puesta sigue entrando: el estado manda", () => {
  // Hay 12 así en la base, dato contradictorio del origen.
  assert.equal(entraEnPlantilla(conductor({ estado: "ACTIVO" }), HOY), true);
});

// ── Reubicado ──────────────────────────────────────────────────────────────

test("reubicado «SI» no entra: sigue en la empresa pero no maneja", () => {
  // 20 filas en la base, 16 de ellas activas. Ninguna rodó el 2026-10-19.
  assert.equal(estaReubicado("SI"), true);
  assert.equal(entraEnPlantilla(conductor({ reubicado: "SI" }), HOY), false);
});

test("«reubicado en 0» es el nulo: en la base no existe el valor «0»", () => {
  assert.equal(estaReubicado(null), false);
  assert.equal(estaReubicado(""), false);
  assert.equal(estaReubicado("   "), false);
  assert.equal(estaReubicado("0"), false);
});

test("las negaciones explícitas también cuentan como no reubicado", () => {
  for (const v of ["NO", "no", "false", "N"]) {
    assert.equal(estaReubicado(v), false, v);
  }
});

test("cualquier otra marca cuenta como reubicado", () => {
  assert.equal(estaReubicado("si"), true);
  assert.equal(estaReubicado("SÍ"), true);
  assert.equal(estaReubicado("TALLER"), true);
});

// ── Fecha de ingreso ───────────────────────────────────────────────────────

test("quien todavía no había entrado no puede faltar", () => {
  assert.equal(entraEnPlantilla(conductor({ fecha_ingreso: "2026-10-20" }), HOY), false);
  assert.equal(entraEnPlantilla(conductor({ fecha_ingreso: "2026-10-19" }), HOY), true);
});

test("sin fecha de ingreso entra: no es motivo para excluir", () => {
  assert.equal(entraEnPlantilla(conductor({ fecha_ingreso: null }), HOY), true);
});

// ── Cédulas de relleno ─────────────────────────────────────────────────────

test("las cédulas de relleno no son personas", () => {
  // Las dos están ACTIVO y sin reubicar en la base, así que sin este filtro
  // salían como candidatas a ausencia todos los días.
  assert.equal(esPersona("99999999"), false);
  assert.equal(esPersona("999999991"), false);
  assert.equal(entraEnPlantilla(conductor({ cedula: "99999999" }), HOY), false);
  assert.equal(entraEnPlantilla(conductor({ cedula: "999999991" }), HOY), false);
});

test("una cédula de verdad que empieza por 9 sí es persona", () => {
  // No es un filtro por prefijo: son dos valores concretos.
  assert.equal(esPersona("91076062"), true);
  assert.equal(esPersona("91252285"), true);
});

test("esPersona recorta espacios", () => {
  assert.equal(esPersona(" 99999999 "), false);
  assert.equal(esPersona("   "), false);
  assert.equal(esPersona(null), false);
});

// ── Los tres juntos ────────────────────────────────────────────────────────

test("sin cédula no entra: la lista se lleva por cédula", () => {
  assert.equal(entraEnPlantilla(conductor({ cedula: null }), HOY), false);
});

test("el caso normal: activo, sin reubicar y ya ingresado", () => {
  assert.equal(entraEnPlantilla(conductor(), HOY), true);
});
