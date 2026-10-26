import { test } from "node:test";
import assert from "node:assert/strict";
import { MENSAJES_ANIVERSARIO, MENSAJES_CUMPLEANOS, elegirMensaje, textoAnios, unirNombres } from "./mensajes-cumpleanos";
import { MENSAJES_SIN_ACCIDENTES } from "./mensajes-seguridad";

test("hay varios mensajes, sin repetir y de largo razonable para el TV", () => {
  for (const lista of [MENSAJES_CUMPLEANOS, MENSAJES_ANIVERSARIO, MENSAJES_SIN_ACCIDENTES]) {
    assert.ok(lista.length >= 8);
    assert.equal(new Set(lista).size, lista.length);
    for (const m of lista) assert.ok(m.length > 20 && m.length <= 140, m);
  }
});

test("textoAnios", () => {
  assert.equal(textoAnios(1), "1 año");
  assert.equal(textoAnios(10), "10 años");
});

test("elegirMensaje: dentro del rango y nunca repite el anterior", () => {
  const n = MENSAJES_CUMPLEANOS.length;
  for (let anterior = 0; anterior < n; anterior++) {
    for (let k = 0; k < 50; k++) {
      const i = elegirMensaje(n, anterior, k / 50);
      assert.ok(i >= 0 && i < n);
      assert.notEqual(i, anterior);
    }
  }
  // Sin anterior puede salir cualquiera, incluidos los extremos.
  assert.equal(elegirMensaje(n, null, 0), 0);
  assert.equal(elegirMensaje(n, null, 0.9999999), n - 1);
  // Con un solo mensaje no hay de dónde elegir.
  assert.equal(elegirMensaje(1, 0, 0.5), 0);
  // Un anterior fuera de rango se ignora.
  assert.equal(elegirMensaje(4, 9, 0), 0);
});

test("elegirMensaje: con anterior, todos los demás son posibles", () => {
  const vistos = new Set<number>();
  for (let k = 0; k < 100; k++) vistos.add(elegirMensaje(5, 2, k / 100));
  assert.deepEqual([...vistos].sort(), [0, 1, 3, 4]);
});

test("unirNombres", () => {
  assert.equal(unirNombres([]), "");
  assert.equal(unirNombres(["Ana Pérez"]), "Ana Pérez");
  assert.equal(unirNombres(["Ana Pérez", "Luis Gómez"]), "Ana Pérez y Luis Gómez");
  assert.equal(unirNombres(["Ana", "Luis", "Marta"]), "Ana, Luis y Marta");
});
