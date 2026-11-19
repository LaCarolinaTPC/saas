import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG_POR_DEFECTO, PROMPT_SELECCION_SUGERIDO, modeloSolicitado } from "./opciones";

test("el prompt sugerido es el mismo de docs/seleccion-prompt-propuesto.txt", () => {
  const delDocumento = readFileSync("docs/seleccion-prompt-propuesto.txt", "utf8").replace(/\r\n/g, "\n").trim();
  assert.equal(PROMPT_SELECCION_SUGERIDO.replace(/\r\n/g, "\n"), delDocumento);
});

test("la configuración por defecto es la recomendada por las pruebas", () => {
  // Modelo fijo (no el automático de OpenRouter, que cambia en cada respuesta).
  assert.equal(CONFIG_POR_DEFECTO.openrouterModo, "manual");
  assert.equal(modeloSolicitado(CONFIG_POR_DEFECTO), "anthropic/claude-haiku-5.5");
  assert.equal(CONFIG_POR_DEFECTO.prompt, PROMPT_SELECCION_SUGERIDO);
  assert.equal(CONFIG_POR_DEFECTO.intentosSinEntender, 3);
  assert.equal(CONFIG_POR_DEFECTO.transferirAlCompletar, false);
  assert.equal(CONFIG_POR_DEFECTO.preguntasRequisitos.split("\n").length, 5);
  // Si ya trabajó en la empresa se revisa con la cédula (19-nov-2026): no se pregunta.
  assert.ok(!/trabajado antes/i.test(CONFIG_POR_DEFECTO.preguntasRequisitos));
  // El nombre lo trae el RUNT y la edad sale de la fecha de nacimiento.
  assert.ok(!/^Nombre|^Edad$/m.test(CONFIG_POR_DEFECTO.preguntasRequisitos));
  // La cédula va con el primer apellido (para el RUNT) y la fecha de expedición (o la foto por ambos lados).
  assert.ok(
    CONFIG_POR_DEFECTO.preguntasRequisitos.startsWith("Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados)\nFecha de nacimiento")
  );
});

test("OpenRouter en modo manual sin modelo escrito usa el recomendado, no el automático", () => {
  assert.equal(modeloSolicitado({ ...CONFIG_POR_DEFECTO, modelo: null }), "anthropic/claude-haiku-5.5");
  assert.equal(modeloSolicitado({ ...CONFIG_POR_DEFECTO, openrouterModo: "auto" }), "openrouter/auto");
});

test("las instrucciones propuestas no dan el salario ni el rango de edad anterior", () => {
  assert.ok(PROMPT_SELECCION_SUGERIDO.includes("entre 20 y 57 años"));
  assert.ok(!/1\.750\.905|20 a 55/.test(PROMPT_SELECCION_SUGERIDO));
});
