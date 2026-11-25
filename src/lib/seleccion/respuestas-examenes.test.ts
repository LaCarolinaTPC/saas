import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarBanco, interpretarRutas, mensajeRutas } from "./respuestas-examenes";

test("banco: sí y no a «¿tiene cuenta en el Banco de Bogotá?»", () => {
  assert.equal(interpretarBanco("Sí, tengo cuenta"), "si");
  assert.equal(interpretarBanco("si señor"), "si");
  assert.equal(interpretarBanco("Tengo cuenta de ahorros en el banco de bogota"), "si");
  assert.equal(interpretarBanco("ya tengo la cuenta"), "si");
  assert.equal(interpretarBanco("No tengo cuenta"), "no");
  assert.equal(interpretarBanco("no"), "no");
  assert.equal(interpretarBanco("no cuento con cuenta en ese banco"), "no");
  assert.equal(interpretarBanco("nunca he tenido"), "no");
  // Otro banco: que lo aclare el asistente.
  assert.equal(interpretarBanco("tengo en bancolombia"), null);
  assert.equal(interpretarBanco("tengo nequi y bancolombia"), null);
  assert.equal(interpretarBanco("tengo en bancolombia y en el de bogota"), "si");
  assert.equal(interpretarBanco("¿a qué hora es el examen?"), null);
});

test("rutas: cuántas dice llevar aprendidas", () => {
  assert.equal(interpretarRutas("2"), 2);
  assert.equal(interpretarRutas("dos rutas"), 2);
  assert.equal(interpretarRutas("Llevo 3"), 3);
  assert.equal(interpretarRutas("una sola"), 1);
  assert.equal(interpretarRutas("ninguna todavía"), 0);
  assert.equal(interpretarRutas("no me sé ninguna"), 0);
  assert.equal(interpretarRutas("la 7 y la 12"), 2);
  assert.equal(interpretarRutas("me las sé todas"), 99);
  assert.equal(interpretarRutas("hola, buenas tardes"), null);
});

test("rutas: con el mínimo o más, sigue; con menos, a aprender", () => {
  assert.equal(mensajeRutas(2, 2), "rutas_suficientes");
  assert.equal(mensajeRutas(3, 2), "rutas_suficientes");
  assert.equal(mensajeRutas(1, 2), "rutas_faltan");
  assert.equal(mensajeRutas(0, 2), "rutas_faltan");
});
