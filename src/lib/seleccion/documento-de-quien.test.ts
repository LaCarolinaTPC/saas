import { test } from "node:test";
import assert from "node:assert/strict";
import { cedulasDelTexto, deQuienEsElTexto, noCoincideConAspirante } from "./documento-de-quien";

const ana = { nombre: "ANA MARIA PEREZ GOMEZ", cedula: "1.002.003.004" };

test("¿de quién es el archivo? (27-nov-2026)", () => {
  assert.deepEqual(cedulasDelTexto("Identificación: 1002003004 · C.C. No. 72.123.456"), ["1002003004", "72123456"]);
  assert.equal(deQuienEsElTexto("Certificado … Cédula de ciudadanía 1.002.003.004 …", ana).estado, "suyo");
  assert.equal(deQuienEsElTexto("Hoja de vida de Ana María Pérez, conductora", ana).estado, "suyo", "nombre y apellido bastan");
  const otro = deQuienEsElTexto("Nombre: Pedro Ruiz · Identificación: 72123456", ana);
  assert.equal(otro.estado, "otro");
  assert.match((otro as { motivo: string }).motivo, /72123456, no la del aspirante \(1002003004\)/);
  const typo = deQuienEsElTexto("Nombre: Ana Maria Perez · C.C. 1002003005", ana);
  assert.match((typo as { motivo: string }).motivo, /aunque el nombre sí coincide/);
  assert.equal(deQuienEsElTexto("Constancia de afiliación vigente.", ana).estado, "sin_datos");
  assert.equal(deQuienEsElTexto("C.C. 1002003004", ana, "Pedro Ruiz Diaz").estado, "otro", "el nombre del informe manda");
  assert.equal(deQuienEsElTexto("C.C. 1002003004", ana, "Ana Perez").estado, "suyo");
});

test("lo leído contra el aspirante (laboratorio, certificados)", () => {
  assert.equal(noCoincideConAspirante({ nombre: "Ana Perez", cedula: "1002003004" }, ana), null);
  assert.equal(noCoincideConAspirante({ nombre: null, cedula: null }, ana), null);
  assert.equal(noCoincideConAspirante({ nombre: "Ana Perez", cedula: "1002003005" }, ana), "La cédula leída es 1002003005, no 1002003004.");
  assert.match(noCoincideConAspirante({ nombre: "Pedro Ruiz", cedula: "1002003004" }, ana) ?? "", /^El nombre leído es «Pedro Ruiz»/);
});
