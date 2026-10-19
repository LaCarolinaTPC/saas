import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARCA_TRANSFERIR, MAX_CARACTERES_WHATSAPP, construirHistorial, construirSistema, interpretarRespuesta,
  parsearFrases, pideHumano, type MensajeHistorial,
} from "./motor";
import { parsearModelosPermitidos } from "./proveedores";

const m = (direccion: "entrante" | "saliente", contenido: string, mediaTipo: string | null = null): MensajeHistorial => ({
  direccion, contenido, mediaTipo,
});

test("historial: une ráfagas del mismo lado y alterna user/assistant", () => {
  const turnos = construirHistorial([
    m("entrante", "Hola"),
    m("entrante", "¿Hay vacantes?"),
    m("saliente", "Sí, de conductor."),
    m("entrante", "Gracias"),
  ]);
  assert.deepEqual(turnos, [
    { role: "user", content: "Hola\n¿Hay vacantes?" },
    { role: "assistant", content: "Sí, de conductor." },
    { role: "user", content: "Gracias" },
  ]);
});

test("historial: descarta salientes antes del primer entrante (el modelo exige empezar por user)", () => {
  const turnos = construirHistorial([m("saliente", "Plantilla de bienvenida"), m("entrante", "Hola")]);
  assert.deepEqual(turnos, [{ role: "user", content: "Hola" }]);
});

test("historial: los medios se describen porque el modelo no los ve", () => {
  const turnos = construirHistorial([m("entrante", "", "audio"), m("entrante", "mi hoja de vida", "document")]);
  assert.equal(turnos[0].content, "[Envió un audio]\n[Envió un documento] mi hoja de vida");
});

test("historial: mensajes vacíos sin medio no cuentan", () => {
  assert.deepEqual(construirHistorial([m("entrante", "   ")]), []);
});

test("frases de transferencia: por frase completa, sin tildes ni mayúsculas", () => {
  const frases = parsearFrases("hablar con una persona\n\n  Asesor   Humano \n");
  assert.deepEqual(frases, ["hablar con una persona", "asesor humano"]);
  assert.ok(pideHumano("Quiero HABLAR con una PERSONA por favor", frases));
  assert.ok(pideHumano("me pasas con un asesor humano?", frases));
  // "recursos humanos" no es pedir un humano.
  assert.ok(!pideHumano("¿Dónde queda recursos humanos?", frases));
});

test("respuesta: separa la marca de transferencia del texto", () => {
  assert.deepEqual(interpretarRespuesta(`Te comunico con el equipo. ${MARCA_TRANSFERIR}`), {
    texto: "Te comunico con el equipo.",
    transferir: true,
  });
  assert.deepEqual(interpretarRespuesta("  Hola, ¿en qué te ayudo?  "), { texto: "Hola, ¿en qué te ayudo?", transferir: false });
  assert.deepEqual(interpretarRespuesta(MARCA_TRANSFERIR), { texto: "", transferir: true });
});

test("respuesta: se recorta al tope de WhatsApp", () => {
  assert.equal(interpretarRespuesta("a".repeat(5000)).texto.length, MAX_CARACTERES_WHATSAPP);
});

test("sistema: incluye el prompt, la marca, la fecha en Colombia y el contacto", () => {
  const s = construirSistema("Somos La Empresa. Horario: 8 a 5.", "Ana", new Date("2026-10-19T15:00:00Z"));
  assert.ok(s.includes("Somos La Empresa. Horario: 8 a 5."));
  assert.ok(s.includes(MARCA_TRANSFERIR));
  assert.ok(s.includes("10:00"), s);
  assert.ok(s.includes("Ana"));
  assert.ok(!s.includes("\n\n\n"));
});

test("sistema: sin prompt ni contacto sigue siendo válido", () => {
  const s = construirSistema("   ", null, new Date());
  assert.ok(s.includes("(Sin instrucciones adicionales.)"));
  assert.ok(!s.includes("aparece en WhatsApp"));
});

test("modelos permitidos de OpenRouter: separados por coma o línea", () => {
  assert.deepEqual(parsearModelosPermitidos(" anthropic/*, google/*\nopenai/gpt-5-mini ,"), [
    "anthropic/*",
    "google/*",
    "openai/gpt-5-mini",
  ]);
  assert.deepEqual(parsearModelosPermitidos(null), []);
});
