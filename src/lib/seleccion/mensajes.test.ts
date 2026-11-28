import { test } from "node:test";
import assert from "node:assert/strict";
import { aFormatoMeta, parametrosPlantilla, primerNombre, renderizarConLineas, renderizarMensaje, validarTextoMensaje, variablesDe } from "./mensajes";

const AUTORIZACION =
  "Para continuar necesitamos tu autorización (Ley 1581 de 2012). Puedes leer nuestra política de tratamiento de datos aquí: {enlace_politica}. ¿Nos autorizas? Responde SÍ o NO.";

test("renderizar reemplaza variables", () => {
  assert.equal(renderizarMensaje("Hola, {nombre}. Te esperamos a las {hora}.", { nombre: "Carlos", hora: "1:00 p. m." }), "Hola, Carlos. Te esperamos a las 1:00 p. m.");
  // Con el negrito de WhatsApp entre los dos puntos (prueba completa del 21-nov-2026).
  assert.equal(renderizarMensaje("Te esperamos el *{fecha} a las {hora}*.", { fecha: "lunes 23", hora: "9:00 a. m." }), "Te esperamos el *lunes 23 a las 9:00 a. m.*");
});

test("renderizar quita «, {nombre}» y las frases con variables vacías", () => {
  assert.equal(renderizarMensaje("Hola, {nombre}. Vimos que te interesó.", { nombre: "" }), "Hola. Vimos que te interesó.");
  assert.equal(
    renderizarMensaje(AUTORIZACION, { enlace_politica: "" }),
    "Para continuar necesitamos tu autorización (Ley 1581 de 2012). ¿Nos autorizas? Responde SÍ o NO."
  );
  assert.match(renderizarMensaje(AUTORIZACION, { enlace_politica: "https://x.co/p" }), /aquí: https:\/\/x\.co\/p\./);
});

test("primer nombre legible desde el nombre de WhatsApp", () => {
  assert.equal(primerNombre("JUAN PÉREZ"), "Juan");
  assert.equal(primerNombre("🚚 carlos"), "Carlos");
  assert.equal(primerNombre("."), "");
  assert.equal(primerNombre(null), "");
});

test("variables y formato de Meta", () => {
  assert.deepEqual(variablesDe("Hola, {nombre}. El {fecha} a las {hora}, {nombre}."), ["nombre", "fecha", "hora"]);
  assert.equal(aFormatoMeta("Hola, {nombre}. A las {hora}.", ["nombre", "hora"]), "Hola, {{1}}. A las {{2}}.");
  assert.deepEqual(parametrosPlantilla(["nombre", "hora"], { nombre: "Carlos", hora: "1:00 p. m." }), ["Carlos", "1:00 p. m."]);
  // Meta no admite parámetros vacíos: sin nombre va «qué tal» («Hola, qué tal.»); otro dato vacío impide enviarla.
  assert.deepEqual(parametrosPlantilla(["nombre"], { nombre: "" }), ["qué tal"]);
  assert.equal(parametrosPlantilla(["nombre", "hora"], { nombre: "Carlos", hora: "" }), null);
});

test("validar texto editado", () => {
  assert.deepEqual(validarTextoMensaje("Hola, {nombre}. ¿Sigues interesado?", ["nombre"]), []);
  assert.match(validarTextoMensaje("Hola, {apellido}. Hola.", ["nombre"])[0], /no disponibles/);
  assert.ok(validarTextoMensaje("Hola {nombre", ["nombre"]).some((e) => /sin cerrar/.test(e)));
  assert.ok(validarTextoMensaje("{nombre}, hola.", ["nombre"]).some((e) => /empiece o termine/.test(e)));
  assert.ok(validarTextoMensaje("  ", ["nombre"]).some((e) => /vacío/.test(e)));
});

test("renderizarConLineas respeta los saltos de línea", () => {
  assert.equal(
    renderizarConLineas("Hola, {nombre}.\n\n\n\nTe esperamos en {direccion}.\nGracias.", { nombre: "Ana", direccion: "" }),
    "Hola, Ana.\n\nGracias."
  );
});
