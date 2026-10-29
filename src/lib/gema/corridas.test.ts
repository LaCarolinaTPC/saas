import { test } from "node:test";
import assert from "node:assert/strict";
import { cronAtrasado, estadoDeResultados, type CorridaGema } from "./corridas";
import { datasetDeFuncion } from "./sync";

const corrida = (iniciada_at: string): CorridaGema => ({
  id: 1, iniciada_at, terminada_at: null, origen: "cron", usuario_email: null, rango_desde: null, rango_hasta: null,
  estado: "ok", duracion_ms: null, resultados: null, error: null,
});

test("estadoDeResultados: error manda sobre aviso, aviso sobre ok", () => {
  assert.equal(estadoDeResultados([{ dataset: "a", rows: 1 }]), "ok");
  assert.equal(estadoDeResultados([{ dataset: "a", rows: 1, aviso: "parcial" }]), "parcial");
  assert.equal(estadoDeResultados([{ dataset: "a", rows: 1, aviso: "x" }, { dataset: "b", rows: 0, error: "falló" }]), "error");
});

test("cronAtrasado: más de 26 h sin corrida automática", () => {
  const ahora = new Date("2026-10-29T15:00:00Z");
  assert.equal(cronAtrasado(corrida("2026-10-29T08:00:00Z"), ahora, "2026-10-01T00:00:00Z"), false);
  assert.equal(cronAtrasado(corrida("2026-10-28T08:00:00Z"), ahora, "2026-10-01T00:00:00Z"), true);
  // Sin ninguna del cron: solo alarma si la bitácora ya lleva más de 26 h.
  assert.equal(cronAtrasado(null, ahora, "2026-10-29T10:00:00Z"), false);
  assert.equal(cronAtrasado(null, ahora, "2026-10-27T10:00:00Z"), true);
  assert.equal(cronAtrasado(null, ahora, null), false);
});

test("datasetDeFuncion: la clave de gema_sync_state", () => {
  assert.equal(datasetDeFuncion("syncViajesRecaudados"), "viajes_recaudados");
  assert.equal(datasetDeFuncion("syncTimbradasDescontadas"), "timbradas_descontadas");
  assert.equal(datasetDeFuncion("syncCierres"), "cierres");
});
