import { test } from "node:test";
import assert from "node:assert/strict";
import { dominanteDelBus } from "./dominante";

const dias = (n: number) => new Set(Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`));

test("sin histórico no hay dominante", () => {
  assert.equal(dominanteDelBus(undefined, () => true), null);
  assert.equal(dominanteDelBus(new Map(), () => true), null);
});

test("gana quien más días sacó el bus", () => {
  const r = dominanteDelBus(new Map([["A", dias(6)], ["B", dias(2)]]), () => true);
  assert.deepEqual(r, { cedula: "A", confianza: 6 / 8 });
});

test("un retirado no puede ser el dominante: pasa al siguiente activo (caso 702)", () => {
  // 72231546 sacó el 702 seis días y se retiró; 72160829 lo sacó cinco.
  const porCed = new Map([["72231546", dias(6)], ["72160829", dias(5)]]);
  const r = dominanteDelBus(porCed, (c) => c !== "72231546");
  assert.equal(r?.cedula, "72160829");
  // La confianza cuenta también los días del retirado: no se infla.
  assert.equal(r?.confianza, 5 / 11);
});

test("si nadie del histórico está activo, no hay dominante", () => {
  const r = dominanteDelBus(new Map([["A", dias(6)], ["B", dias(2)]]), () => false);
  assert.equal(r, null);
});
