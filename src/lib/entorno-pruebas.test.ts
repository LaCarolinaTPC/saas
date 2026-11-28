import { test } from "node:test";
import assert from "node:assert/strict";
import { enDesarrollo, esCorreoDePrueba, esWhatsappDePrueba, normalizarTelefonoPrueba } from "./entorno-pruebas";

test("entorno de pruebas: correos y números de prueba", () => {
  assert.equal(enDesarrollo(" Desarrollo "), true);
  assert.equal(enDesarrollo("produccion"), false);
  assert.equal(enDesarrollo(undefined), false);
  assert.equal(esCorreoDePrueba(["soporte@lacarolina.com.co"], "Soporte@LaCarolina.com.co"), true);
  assert.equal(esCorreoDePrueba(["@lacarolina.com.co"], "ana@lacarolina.com.co"), true);
  assert.equal(esCorreoDePrueba(["soporte@lacarolina.com.co"], "recepcion@biobacips.com"), false);
  assert.equal(esCorreoDePrueba([], "x@y.co"), false);
  assert.equal(normalizarTelefonoPrueba("300 123 4567"), "573001234567");
  assert.equal(normalizarTelefonoPrueba("+57 300-123-4567"), "573001234567");
  assert.equal(esWhatsappDePrueba(["3001234567"], "573001234567"), true);
  assert.equal(esWhatsappDePrueba(["573001234567"], "+57 300 123 4567"), true);
  assert.equal(esWhatsappDePrueba(["573001234567"], "573009999999"), false);
  assert.equal(esWhatsappDePrueba(["573001234567"], ""), false);
});
