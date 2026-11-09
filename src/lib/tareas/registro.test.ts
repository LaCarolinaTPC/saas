import { test } from "node:test";
import assert from "node:assert/strict";
import { TAREAS, TAREA_PENDIENTES } from "./registro";

test("registro: el TV solo dispara el seguimiento de WhatsApp y la limpieza de métricas", () => {
  // El seguimiento («¿sigues interesado?») no debe esperar a que alguien abra
  // Gestivo; el TV late todo el día. Su horario de envío lo decide la tarea.
  const delTv = TAREAS.filter((t) => !t.soloConUsuarios).map((t) => t.id);
  assert.deepEqual(delTv, ["comunicaciones.seguimiento", "permisos.limpiar_metricas"]);
});

test("registro: los pendientes de Marcaciones nunca los dispara el TV", () => {
  assert.equal(TAREAS.find((t) => t.id === TAREA_PENDIENTES)?.soloConUsuarios, true);
});
