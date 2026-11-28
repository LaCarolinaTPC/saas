import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmacionBorrado, pideParaBorrar } from "./borrado";

test("borrar un proceso: hay que escribir su cédula (con o sin puntos)", () => {
  const p = { nombre: "PEDRO LUIS TORRES", cedula: "1129492533" };
  assert.deepEqual(pideParaBorrar(p), { que: "cédula", valor: "1129492533" });
  assert.equal(confirmacionBorrado(p, "1.129.492.533"), true);
  assert.equal(confirmacionBorrado(p, "112949253"), false);
  assert.equal(confirmacionBorrado(p, ""), false);
  assert.equal(confirmacionBorrado(p, "PEDRO LUIS TORRES"), false);
});

test("borrar un proceso sin cédula: el nombre completo, sin importar tildes ni mayúsculas", () => {
  const p = { nombre: "Aspirante Ramírez", cedula: null };
  assert.equal(pideParaBorrar(p).que, "nombre");
  assert.equal(confirmacionBorrado(p, "  aspirante   ramirez "), true);
  assert.equal(confirmacionBorrado(p, "Aspirante"), false);
  assert.equal(confirmacionBorrado({ nombre: "", cedula: "" }, ""), false);
});
