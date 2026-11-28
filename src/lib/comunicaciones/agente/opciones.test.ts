import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG_POR_DEFECTO, PROMPT_SELECCION_SUGERIDO, configDocumentos, modeloSolicitado } from "./opciones";
import { configDesdeFormulario, type AgenteFormulario } from "./formulario";

test("el prompt sugerido es el mismo de docs/seleccion-prompt-propuesto.txt", () => {
  const delDocumento = readFileSync("docs/seleccion-prompt-propuesto.txt", "utf8").replace(/\r\n/g, "\n").trim();
  assert.equal(PROMPT_SELECCION_SUGERIDO.replace(/\r\n/g, "\n"), delDocumento);
});

test("la configuración por defecto es la recomendada por las pruebas", () => {
  // Modelo fijo (no el automático de OpenRouter, que cambia en cada respuesta).
  assert.equal(CONFIG_POR_DEFECTO.openrouterModo, "manual");
  // Desde el 21-nov-2026: Haiku 5.5 para el chat y los documentos, GPT-4o mini Transcribe por OpenRouter para la voz.
  assert.equal(modeloSolicitado(CONFIG_POR_DEFECTO), "claude-haiku-5-5");
  assert.equal(modeloSolicitado(configDocumentos(CONFIG_POR_DEFECTO)), "claude-haiku-5-5");
  assert.equal(CONFIG_POR_DEFECTO.vozProveedor, "openrouter");
  assert.equal(CONFIG_POR_DEFECTO.vozModelo, "gpt4o_mini");
  assert.equal(CONFIG_POR_DEFECTO.prompt, PROMPT_SELECCION_SUGERIDO);
  assert.equal(CONFIG_POR_DEFECTO.intentosSinEntender, 3);
  assert.equal(CONFIG_POR_DEFECTO.transferirAlCompletar, false);
  // Desde el 21-nov-2026 se pregunta también si viene recomendado (después de la cédula).
  assert.equal(CONFIG_POR_DEFECTO.preguntasRequisitos.split("\n").length, 6);
  // Si ya trabajó en la empresa se revisa con la cédula (19-nov-2026): no se pregunta.
  assert.ok(!/trabajado antes/i.test(CONFIG_POR_DEFECTO.preguntasRequisitos));
  // El nombre lo trae el RUNT y la edad sale de la fecha de nacimiento.
  assert.ok(!/^Nombre|^Edad$/m.test(CONFIG_POR_DEFECTO.preguntasRequisitos));
  // Orden de GH del 19-nov-2026: ciudad, edad, cédula (con el primer apellido para el RUNT
  // y la fecha de expedición, o la foto), experiencia y disponibilidad. La licencia sale del RUNT.
  // Desde el 21-nov-2026, después de la cédula: si viene recomendado por alguien de la empresa.
  const [ciudad, edad, cedula, recomendado, experiencia, disponibilidad] = CONFIG_POR_DEFECTO.preguntasRequisitos.split("\n");
  assert.match(recomendado, /^Si viene recomendado por alguien que trabaja en la empresa/);
  assert.match(ciudad, /^Ciudad donde vive .*cuándo estaría en la ciudad/);
  assert.match(edad, /^Fecha de nacimiento/);
  assert.match(cedula, /^Número de cédula, primer apellido y fecha de expedición \(o la foto de la cédula por ambos lados\)/);
  assert.match(experiencia, /manejando/);
  assert.match(disponibilidad, /^Desde cuándo podría empezar/);
  assert.ok(!/Categoría de la licencia/i.test(CONFIG_POR_DEFECTO.preguntasRequisitos));
});

test("OpenRouter en modo manual sin modelo escrito usa el recomendado, no el automático", () => {
  const openrouter = { ...CONFIG_POR_DEFECTO, proveedor: "openrouter" as const };
  assert.equal(modeloSolicitado({ ...openrouter, modelo: null }), "anthropic/claude-haiku-5.5");
  assert.equal(modeloSolicitado({ ...openrouter, openrouterModo: "auto" }), "openrouter/auto");
});

test("los documentos se leen con su propia IA, siempre con modelo fijo", () => {
  // Chat por OpenRouter automático y documentos con Sonnet directo en Anthropic.
  const c = { ...CONFIG_POR_DEFECTO, proveedor: "openrouter" as const, openrouterModo: "auto" as const, documentosProveedor: "anthropic" as const, documentosModelo: "claude-sonnet-5-5" };
  const d = configDocumentos(c);
  assert.equal(d.proveedor, "anthropic");
  assert.equal(modeloSolicitado(d), "claude-sonnet-5-5");
  // El chat no cambia.
  assert.equal(modeloSolicitado(c), "openrouter/auto");
  // Documentos por OpenRouter sin modelo escrito: Haiku fijo, no el automático.
  assert.equal(modeloSolicitado(configDocumentos({ ...c, documentosProveedor: "openrouter", documentosModelo: null })), "anthropic/claude-haiku-5.5");
  // Lo demás (prompt, listas) se conserva.
  assert.equal(d.prompt, c.prompt);
});

test("formulario: documentos y voz, y los chats de prueba guardados antes sin esos campos", () => {
  // Un chat de prueba guardado en el navegador antes del 21-nov: sin los campos de documentos y voz.
  const viejo = JSON.parse(JSON.stringify({ ...CONFIG_POR_DEFECTO, modelo: CONFIG_POR_DEFECTO.modelo ?? "", openrouterModelosPermitidos: "" })) as AgenteFormulario;
  delete viejo.documentosProveedor;
  delete viejo.documentosModelo;
  delete viejo.vozProveedor;
  delete viejo.vozModelo;
  const sinCampos = configDesdeFormulario(viejo);
  assert.equal(sinCampos.documentosProveedor, "anthropic");
  assert.equal(sinCampos.documentosModelo, "claude-haiku-5-5");
  assert.equal(sinCampos.vozModelo, "gpt4o_mini");
  const conCampos = configDesdeFormulario({ ...viejo, documentosProveedor: "openrouter", documentosModelo: "  google/gemini-3-flash ", vozProveedor: "openai", vozModelo: "whisper" });
  assert.equal(conCampos.documentosModelo, "google/gemini-3-flash");
  assert.equal(conCampos.vozProveedor, "openai");
  assert.equal(conCampos.vozModelo, "whisper");
});

test("las instrucciones propuestas no dan el salario ni el rango de edad anterior", () => {
  assert.ok(PROMPT_SELECCION_SUGERIDO.includes("entre 20 y 57 años"));
  assert.ok(!/1\.750\.905|20 a 55/.test(PROMPT_SELECCION_SUGERIDO));
});
