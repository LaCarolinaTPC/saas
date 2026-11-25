import { test } from "node:test";
import assert from "node:assert/strict";
import { movimientoAlSoltar, siguientePaso } from "./mover-tablero";

test("tablero: qué pasa al soltar una tarjeta (24-nov-2026)", () => {
  assert.deepEqual(movimientoAlSoltar("citado", "citado"), { tipo: "nada" });
  assert.deepEqual(movimientoAlSoltar("en_examenes", "cierre"), { tipo: "cierre" });
  // Hacia atrás y reabrir: directo, como antes.
  assert.deepEqual(movimientoAlSoltar("en_examenes_fase2", "en_examenes"), { tipo: "directo" });
  assert.deepEqual(movimientoAlSoltar("cierre", "citado"), { tipo: "directo" });
  assert.deepEqual(movimientoAlSoltar("contratado", "reconocimiento_ruta"), { tipo: "directo" });
  // Hacia adelante: se abre la ficha con lo de esa etapa.
  assert.deepEqual(movimientoAlSoltar("en_examenes", "en_examenes_fase2"), { tipo: "ficha", destino: "en_examenes_fase2" });
  assert.deepEqual(movimientoAlSoltar("pendiente", "citado"), { tipo: "ficha", destino: "citado" });
  assert.deepEqual(movimientoAlSoltar("reconocimiento_ruta", "contratado"), { tipo: "ficha", destino: "contratado" });
});

test("tablero: el siguiente paso hacia la columna donde se soltó", () => {
  assert.equal(siguientePaso("en_examenes", "en_examenes_fase2"), "en_examenes_fase2");
  // Varios pasos: primero citar, luego la prueba aprobada lleva a exámenes (sin escuela).
  assert.equal(siguientePaso("pendiente", "en_examenes"), "citado");
  assert.equal(siguientePaso("citado", "en_examenes"), "en_examenes");
  assert.equal(siguientePaso("citado", "en_examenes_fase2"), "en_examenes");
  assert.equal(siguientePaso("en_examenes", "reconocimiento_ruta"), "en_examenes_fase2");
  // A escuela solo si es el destino.
  assert.equal(siguientePaso("prueba_manejo", "en_escuela"), "en_escuela");
  assert.equal(siguientePaso("en_escuela", "en_examenes_fase2"), "en_examenes");
  // De preselección a antecedentes solo si ese es el destino; si no, se cita.
  assert.equal(siguientePaso("pendiente", "antecedentes"), "antecedentes");
  assert.equal(siguientePaso("pendiente", "prueba_manejo"), "citado");
  // Contratar: desde cualquier etapa abierta (deciden las condiciones).
  assert.equal(siguientePaso("en_examenes", "contratado"), "contratado");
  // Ya llegó o está cerrado: nada.
  assert.equal(siguientePaso("en_examenes_fase2", "en_examenes_fase2"), null);
  assert.equal(siguientePaso("cierre", "citado"), null);
});
