import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CUERPO_BOTONES, cuerpoBotones } from "./whatsapp";

test("botones de respuesta: mensaje interactivo con el texto y un botón por opción", () => {
  const c = cuerpoBotones("573001234567", "¿Vienes recomendado por alguien que trabaja en la empresa?", ["Sí", "No"]) as {
    to: string;
    type: string;
    interactive: { type: string; body: { text: string }; action: { buttons: { type: string; reply: { id: string; title: string } }[] } };
  };
  assert.equal(c.to, "573001234567");
  assert.equal(c.type, "interactive");
  assert.equal(c.interactive.type, "button");
  assert.equal(c.interactive.body.text, "¿Vienes recomendado por alguien que trabaja en la empresa?");
  assert.deepEqual(c.interactive.action.buttons, [
    { type: "reply", reply: { id: "opcion_1", title: "Sí" } },
    { type: "reply", reply: { id: "opcion_2", title: "No" } },
  ]);
});

test("botones de respuesta: respeta los topes de Meta (3 botones, 20 caracteres, cuerpo de 1024)", () => {
  const c = cuerpoBotones("57300", "a".repeat(2000), ["Uno", "Dos", "Tres", "Cuatro", "Un título demasiado largo para un botón"]) as {
    interactive: { body: { text: string }; action: { buttons: { reply: { title: string } }[] } };
  };
  assert.equal(c.interactive.body.text.length, MAX_CUERPO_BOTONES);
  assert.equal(c.interactive.action.buttons.length, 3);
  assert.ok(c.interactive.action.buttons.every((b) => b.reply.title.length <= 20));
});
