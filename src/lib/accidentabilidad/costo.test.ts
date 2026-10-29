import { test } from "node:test";
import assert from "node:assert/strict";
import { pesosCosto, validarCosto } from "./costo";

const valor = (x: unknown) => {
  const r = validarCosto(x);
  return r.ok ? r.valor : r.error;
};

test("validarCosto: acepta pesos enteros con o sin separadores", () => {
  assert.equal(valor("0"), 0);
  assert.equal(valor("1250000"), 1250000);
  assert.equal(valor("1.250.000"), 1250000);
  assert.equal(valor("$ 1.250.000"), 1250000);
  assert.equal(valor(" 350 000 "), 350000);
  assert.equal(valor(480000), 480000);
});

test("validarCosto: rechaza lo que no es un número válido", () => {
  assert.match(String(valor("")), /Escriba el costo/);
  assert.match(String(valor("mil pesos")), /debe ser un número/);
  assert.match(String(valor("12a")), /debe ser un número/);
  assert.match(String(valor("-5000")), /negativo/);
  assert.match(String(valor(-1)), /negativo/);
  assert.match(String(valor("1250,50")), /sin centavos/);
  assert.match(String(valor(10.5)), /sin centavos/);
  assert.match(String(valor(Number.NaN)), /debe ser un número/);
  assert.match(String(valor("99999999999")), /demasiado alto/);
});

test("pesosCosto", () => {
  assert.equal(pesosCosto(1250000), "$ 1.250.000");
  assert.equal(pesosCosto(0), "$ 0");
  assert.equal(pesosCosto(null), "—");
});
