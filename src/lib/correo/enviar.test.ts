import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoEnDesarrollo } from "./enviar";

const correo = { para: ["recepcion@laboratorio.test"], copia: ["rrhh@empresa.test"], asunto: "Orden de exámenes" };

test("correo: fuera de desarrollo sale a sus destinatarios", () => {
  assert.deepEqual(destinoEnDesarrollo(correo, { entorno: undefined, desvio: "pruebas@empresa.test" }), { desviar: false });
  assert.deepEqual(destinoEnDesarrollo(correo, { entorno: "produccion" }), { desviar: false });
});

test("correo: en desarrollo sin bandeja de desvío no sale", () => {
  const r = destinoEnDesarrollo(correo, { entorno: "desarrollo", desvio: "  " });
  assert.ok(r.desviar && "bloqueado" in r);
});

test("correo: en desarrollo va a la bandeja de desvío con los destinatarios en el asunto", () => {
  const r = destinoEnDesarrollo(correo, { entorno: " Desarrollo ", desvio: "pruebas@empresa.test" });
  assert.ok(r.desviar && "para" in r);
  assert.deepEqual(r.para, ["pruebas@empresa.test"]);
  assert.equal(r.asunto, "[DESARROLLO → recepcion@laboratorio.test, rrhh@empresa.test] Orden de exámenes");
});
