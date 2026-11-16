import { test } from "node:test";
import assert from "node:assert/strict";
import { errorProveedorLegible, fallaDeRed } from "./errores";

test("sin saldo en cada proveedor dice dónde recargar", () => {
  const or = errorProveedorLegible({ proveedor: "openrouter", status: 402, mensaje: "Insufficient credits. Add more using https://openrouter.ai/settings/credits" });
  assert.equal(or, "OpenRouter no tiene saldo. Hay que recargar créditos en openrouter.ai → Credits (HTTP 402).");
  assert.match(errorProveedorLegible({ proveedor: "anthropic", status: 400, mensaje: "400 Your credit balance is too low to access the Anthropic API." }), /^Anthropic no tiene saldo.*console\.anthropic\.com/);
  assert.match(errorProveedorLegible({ proveedor: "openai", status: 429, codigo: "insufficient_quota", mensaje: "You exceeded your current quota" }), /^OpenAI no tiene saldo/);
});

test("límite de la key de OpenRouter no se confunde con falta de saldo", () => {
  assert.match(errorProveedorLegible({ proveedor: "openrouter", status: 403, mensaje: "Key limit exceeded" }), /límite de gasto/);
});

test("códigos comunes", () => {
  assert.match(errorProveedorLegible({ proveedor: "openrouter", status: 401, mensaje: "No auth credentials found" }), /no es válida.*Proveedores de IA/);
  assert.match(errorProveedorLegible({ proveedor: "openrouter", status: 404, mensaje: "No endpoints found", modelo: "x/y" }), /no encontró el modelo «x\/y»/);
  assert.match(errorProveedorLegible({ proveedor: "openrouter", status: 429 }), /demasiadas solicitudes/);
  assert.match(errorProveedorLegible({ proveedor: "anthropic", status: 529, mensaje: "Overloaded" }), /no está disponible/);
  assert.match(errorProveedorLegible({ proveedor: "openai", status: 400, mensaje: "This model's maximum context length is 8192 tokens" }), /demasiado larga.*Memoria/);
  assert.match(errorProveedorLegible({ proveedor: "openrouter", status: 403, mensaje: "Input was flagged by moderation" }), /filtro de contenido/);
  assert.equal(errorProveedorLegible({ proveedor: "openrouter", status: 418, mensaje: "teapot" }), "OpenRouter respondió con un error (HTTP 418): teapot");
});

test("red y tiempo", () => {
  const t = new Error("The operation was aborted due to timeout"); t.name = "TimeoutError";
  assert.deepEqual(fallaDeRed(t), { tiempoAgotado: true });
  assert.deepEqual(fallaDeRed(new TypeError("fetch failed")), { sinConexion: true });
  assert.equal(fallaDeRed(new Error("otra cosa")), null);
  assert.match(errorProveedorLegible({ proveedor: "openrouter", tiempoAgotado: true }), /tardó demasiado/);
});
