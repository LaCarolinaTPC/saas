import { test } from "node:test";
import assert from "node:assert/strict";
import { observacionDeCierre } from "./servidor";

test("al cerrar, la causa queda en la observación con la fecha (y el motivo si dice algo más)", () => {
  const cuando = new Date("2026-11-27T20:00:00Z");
  assert.equal(observacionDeCierre("SIMIT por encima del tope", null, cuando), "Cierre 27/11/2026: SIMIT por encima del tope");
  assert.equal(observacionDeCierre("Incomunicado", "Sin respuesta tras la reactivación.", cuando), "Cierre 27/11/2026: Incomunicado (Sin respuesta tras la reactivación.)");
  // Si el motivo repite la causa, no se duplica.
  assert.equal(observacionDeCierre("Antecedentes", "Antecedentes", cuando), "Cierre 27/11/2026: Antecedentes");
});
