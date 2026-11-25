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

test("correo: el de confirmar la dirección del aspirante sí sale en desarrollo; el del laboratorio no", () => {
  const aspirante = { para: ["aspirante@gmail.com"], asunto: "Confirma tu correo", salirEnDesarrollo: true };
  assert.deepEqual(destinoEnDesarrollo(aspirante, { entorno: "desarrollo" }), { desviar: false });
  assert.deepEqual(destinoEnDesarrollo(aspirante, { entorno: "desarrollo", desvio: "pruebas@empresa.test" }), { desviar: false });
  const r = destinoEnDesarrollo(correo, { entorno: "desarrollo" });
  assert.ok(r.desviar && "bloqueado" in r);
});

test("correo: en desarrollo sale a las direcciones de prueba permitidas y quita las demás", () => {
  const lab = { para: ["pruebas.lab@gmail.com"], copia: ["rrhh@empresa.test"], asunto: "Orden de exámenes" };
  const r = destinoEnDesarrollo(lab, { entorno: "desarrollo", permitidos: "pruebas.lab@gmail.com, @lacarolina.test" });
  assert.deepEqual(r, { desviar: true, para: ["pruebas.lab@gmail.com"], copia: [], asunto: "[DESARROLLO, sin rrhh@empresa.test] Orden de exámenes" });
  // Por dominio.
  const d = destinoEnDesarrollo({ para: ["Ana@LaCarolina.test"], asunto: "x" }, { entorno: "desarrollo", permitidos: "@lacarolina.test" });
  assert.deepEqual(d, { desviar: true, para: ["Ana@LaCarolina.test"], copia: [], asunto: "[DESARROLLO] x" });
  // El laboratorio real no está en la lista: no sale (o va a la bandeja de desvío).
  const real = destinoEnDesarrollo(correo, { entorno: "desarrollo", permitidos: "pruebas.lab@gmail.com" });
  assert.ok(real.desviar && "bloqueado" in real);
  const desviado = destinoEnDesarrollo(correo, { entorno: "desarrollo", permitidos: "pruebas.lab@gmail.com", desvio: "bandeja@empresa.test" });
  assert.ok(desviado.desviar && "para" in desviado && desviado.para[0] === "bandeja@empresa.test");
  // Fuera de desarrollo la lista no cambia nada.
  assert.deepEqual(destinoEnDesarrollo(lab, { entorno: "produccion", permitidos: "pruebas.lab@gmail.com" }), { desviar: false });
});
