import { test } from "node:test";
import assert from "node:assert/strict";
import { condicionDe, esCondicionMaestro, parseTiposConductor, tasaTieneBase } from "./matriz-reglas";

test("parseTiposConductor: solo válidos, sin repetir, en el orden del catálogo", () => {
  assert.deepEqual(parseTiposConductor("AFILIADO,EMPRESA"), ["EMPRESA", "AFILIADO"]);
  assert.deepEqual(parseTiposConductor(" afiliado , AFILIADO,OTRO"), ["AFILIADO"]);
  assert.deepEqual(parseTiposConductor("EMPRESA"), ["EMPRESA"]);
  assert.deepEqual(parseTiposConductor(""), []);
  assert.deepEqual(parseTiposConductor(undefined), []);
});

test("condicionDe: el maestro decide; sin fila en el maestro es 'sin'", () => {
  assert.equal(condicionDe("ACTIVO"), "activo");
  assert.equal(condicionDe("RETIRADO"), "inactivo");
  assert.equal(condicionDe(null), "inactivo");
  assert.equal(condicionDe(undefined), "sin");
});

test("esCondicionMaestro", () => {
  for (const v of ["activo", "inactivo", "sin"]) assert.equal(esCondicionMaestro(v), true);
  for (const v of ["", "ACTIVO", "todos", null, undefined]) assert.equal(esCondicionMaestro(v), false);
});

test("tasaTieneBase: solo con toda la población activa", () => {
  assert.equal(tasaTieneBase(null, []), true);
  assert.equal(tasaTieneBase("activo", []), true);
  assert.equal(tasaTieneBase("inactivo", []), false);
  assert.equal(tasaTieneBase("sin", []), false);
  assert.equal(tasaTieneBase(null, ["EMPRESA"]), false);
});
