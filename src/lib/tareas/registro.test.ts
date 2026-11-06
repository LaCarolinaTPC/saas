import { test } from "node:test";
import assert from "node:assert/strict";
import { TAREAS, TAREA_PENDIENTES } from "./registro";

test("registro: el TV solo dispara la limpieza de métricas", () => {
  const delTv = TAREAS.filter((t) => !t.soloConUsuarios).map((t) => t.id);
  assert.deepEqual(delTv, ["permisos.limpiar_metricas"]);
});

test("registro: los pendientes de Marcaciones nunca los dispara el TV", () => {
  assert.equal(TAREAS.find((t) => t.id === TAREA_PENDIENTES)?.soloConUsuarios, true);
});
