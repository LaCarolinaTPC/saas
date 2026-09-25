import { test } from "node:test";
import assert from "node:assert/strict";
import { columnaDescuentosOtros } from "./sync";

test("«descuentos otros» se reconoce con cualquier forma del nombre", () => {
  for (const k of ["descuentosOtros", "DescuentosOtros", "descuentos_otros", "DESCUENTOS OTROS", "otrosDescuentos"]) {
    assert.equal(columnaDescuentosOtros({ bruto: 1, [k]: 5 }), k);
  }
  // valorDescuentos es combustible + póliza: nunca debe confundirse.
  assert.equal(columnaDescuentosOtros({ valorDescuentos: 1, descuento: 2 }), null);
  assert.equal(columnaDescuentosOtros(undefined), null);
});
