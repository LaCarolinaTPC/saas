import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_SUBS,
  MODULE_SUBS,
  SUB_HOME,
  SUB_TO_MODULE,
  SUBMODULE_LABELS,
  SUBS_SENSIBLES,
  SUBS_SOLO_ADMIN,
} from "./permissions-shared";

// Las sub-funciones se indexan en mapas PLANOS (SUBS_SENSIBLES,
// SUBS_SOLO_ADMIN, SUB_HOME y SUBMODULE_LABELS). Si un nombre se repitiera
// entre módulos, todos esos mapas se confundirían: de ahí los prefijos incap_
// y fin_.
test("los nombres de sub-función son únicos entre módulos", () => {
  const todas = Object.values(MODULE_SUBS).flatMap((s) => [...(s as readonly string[])]);
  assert.equal(new Set(todas).size, todas.length);
  assert.equal(ALL_SUBS.length, todas.length);
});

test("cada sub-función tiene etiqueta, inicio y módulo", () => {
  for (const sub of ALL_SUBS) {
    assert.ok(SUBMODULE_LABELS[sub], `falta etiqueta de ${sub}`);
    assert.ok(SUB_HOME[sub], `falta ruta de inicio de ${sub}`);
    assert.ok(SUB_TO_MODULE[sub], `falta el módulo de ${sub}`);
  }
  // Y al contrario: nada en los conjuntos de reglas apunta a una sub que no exista.
  for (const sub of [...SUBS_SENSIBLES, ...SUBS_SOLO_ADMIN]) {
    assert.ok(ALL_SUBS.includes(sub), `${sub} no está en MODULE_SUBS`);
  }
});
