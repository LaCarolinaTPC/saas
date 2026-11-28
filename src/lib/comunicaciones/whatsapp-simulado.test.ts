import { test } from "node:test";
import assert from "node:assert/strict";
import { PREFIJO_WAMID_SIMULADO, enviarTexto, whatsappSimulado } from "./whatsapp";

test("whatsapp: solo se simula en desarrollo", () => {
  assert.equal(whatsappSimulado("desarrollo"), true);
  assert.equal(whatsappSimulado(" Desarrollo "), true);
  assert.equal(whatsappSimulado(undefined), false);
  assert.equal(whatsappSimulado("produccion"), false);
});

test("whatsapp: en desarrollo el envío no llama a Meta y vuelve con id simulado", async () => {
  const antes = process.env.GESTIVO_ENTORNO;
  const fetchOriginal = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (async () => {
    llamadas++;
    throw new Error("no debía llamar a Meta");
  }) as typeof fetch;
  process.env.GESTIVO_ENTORNO = "desarrollo";
  try {
    const r = await enviarTexto("573000000000", "hola");
    assert.equal(r.ok, true);
    assert.ok(r.wamid?.startsWith(PREFIJO_WAMID_SIMULADO));
    assert.equal(llamadas, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (antes === undefined) delete process.env.GESTIVO_ENTORNO;
    else process.env.GESTIVO_ENTORNO = antes;
  }
});
