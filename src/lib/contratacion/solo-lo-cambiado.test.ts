import { test } from "node:test";
import assert from "node:assert/strict";
import { soloLoCambiado } from "./solo-lo-cambiado";

test("guardar la ficha no pisa lo que cambió mientras estaba abierta (24-nov-2026)", () => {
  const original = { estado: "en_examenes", observacion: "", fecha_examenes_fase2: null as string | null, nombre: "JUAN" };
  const enBase = { estado: "en_examenes_fase2", observacion: "", fecha_examenes_fase2: "2026-11-25", nombre: "JUAN" };
  // La persona solo escribió una observación: el estado y la fecha que puso la acción se quedan.
  const r = soloLoCambiado({ ...original, observacion: "Llamado" }, original, enBase);
  assert.deepEqual(r, { estado: "en_examenes_fase2", observacion: "Llamado", fecha_examenes_fase2: "2026-11-25", nombre: "JUAN" });
  // Si la persona sí cambió el estado, gana lo suyo.
  assert.equal(soloLoCambiado({ ...original, estado: "cierre" }, original, enBase).estado, "cierre");
  // Sin original (crear, o llamadas viejas): la fila tal cual.
  assert.equal(soloLoCambiado(original, null, enBase).estado, "en_examenes");
  // Un campo que la base no tiene se queda como viene.
  assert.equal(soloLoCambiado({ ...original, extra: 1 }, { ...original, extra: 1 }, enBase).extra, 1);
});
