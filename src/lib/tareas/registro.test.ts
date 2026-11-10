import { test } from "node:test";
import assert from "node:assert/strict";
import { TAREAS, TAREA_PENDIENTES } from "./registro";

test("registro: el TV solo dispara la limpieza de métricas", () => {
  // El seguimiento de WhatsApp no va aquí: lo corre el cron de Coolify
  // (/api/cron/seguimiento-whatsapp), para que no envíe desde cualquier
  // equipo con Gestivo abierto (también los de desarrollo).
  const delTv = TAREAS.filter((t) => !t.soloConUsuarios).map((t) => t.id);
  assert.deepEqual(delTv, ["permisos.limpiar_metricas"]);
});

test("registro: los pendientes de Marcaciones nunca los dispara el TV", () => {
  assert.equal(TAREAS.find((t) => t.id === TAREA_PENDIENTES)?.soloConUsuarios, true);
});
