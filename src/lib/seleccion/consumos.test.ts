import { test } from "node:test";
import assert from "node:assert/strict";
import { costoUsd, estadoTope, inicioMesBogota, precioModelo } from "./consumos";

test("consumos: precio por modelo, con familia y desconocido al precio más alto", () => {
  assert.deepEqual(precioModelo("claude-haiku-5-5"), [0.1, 0.5]);
  assert.deepEqual(precioModelo("anthropic/claude-haiku-5-5"), [0.1, 0.5]);
  assert.deepEqual(precioModelo("claude-sonnet-5-5-20261101"), [2, 10]);
  // OpenRouter, con punto en la versión.
  assert.deepEqual(precioModelo("anthropic/claude-sonnet-5.5"), [2, 10]);
  assert.deepEqual(precioModelo("anthropic/claude-haiku-5.5"), [0.1, 0.5]);
  assert.deepEqual(precioModelo("openrouter/auto"), [4, 20]);
  assert.deepEqual(precioModelo(null), [4, 20]);
  // 10.000 de entrada y 1.000 de salida con Haiku: 0,001 + 0,0005.
  assert.equal(costoUsd("claude-haiku-5-5", 10_000, 1_000), 0.0015);
  assert.equal(costoUsd("claude-haiku-5-5", null, undefined), 0);
});

test("consumos: el tope avisa al 80 % y se alcanza al 100 %; sin tope nunca", () => {
  assert.deepEqual(estadoTope(100, 500_000, 3_270), { gastoCop: 327_000, topeCop: 500_000, porcentaje: 65.4, nivel: "normal" });
  assert.equal(estadoTope(125, 500_000, 3_270).nivel, "aviso");
  assert.equal(estadoTope(153, 500_000, 3_270).nivel, "alcanzado");
  assert.equal(estadoTope(10_000, 0, 3_270).nivel, "normal");
});

test("consumos: el mes empieza a la medianoche de Bogotá", () => {
  assert.equal(inicioMesBogota(new Date("2026-11-20T15:00:00Z")), "2026-11-01T05:00:00.000Z");
  // 1 de diciembre a las 02:00 UTC todavía es 30 de noviembre en Bogotá.
  assert.equal(inicioMesBogota(new Date("2026-12-01T02:00:00Z")), "2026-11-01T05:00:00.000Z");
});

test("costo de Claude: la caché se cobra a su precio (lectura × 0,1, escritura × 1,25)", async () => {
  const { costoClaude } = await import("@/lib/comunicaciones/agente/proveedores");
  // Haiku 5.5: 0,10 / 0,50 por millón.
  assert.equal(costoClaude("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 0 }), 0.1);
  assert.equal(costoClaude("claude-haiku-5-5", { input_tokens: 0, output_tokens: 1_000_000 }), 0.5);
  assert.equal(costoClaude("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }), 0.01);
  assert.equal(costoClaude("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 }), 0.125);
});
