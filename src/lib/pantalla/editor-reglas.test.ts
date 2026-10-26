import { test } from "node:test";
import assert from "node:assert/strict";
import { ajustarASnap, dentroDelLienzo, redimensionar, rotacionDesde } from "./editor-reglas";

test("ajustarASnap pega el centro de la caja al centro del lienzo dentro del umbral", () => {
  const r = ajustarASnap({ x: 855, y: 437, w: 200, h: 200 }, [], 10);
  assert.equal(r.x, 860);
  assert.equal(r.y, 440);
  assert.deepEqual(r.guias, [{ eje: "x", pos: 960 }, { eje: "y", pos: 540 }]);
});

test("ajustarASnap no mueve fuera del umbral", () => {
  const r = ajustarASnap({ x: 700, y: 300, w: 100, h: 100 }, [], 10);
  assert.deepEqual([r.x, r.y, r.guias.length], [700, 300, 0]);
});

test("ajustarASnap alinea con el borde de otra caja", () => {
  const r = ajustarASnap({ x: 305, y: 700, w: 100, h: 50 }, [{ x: 300, y: 100, w: 400, h: 100 }], 10);
  assert.equal(r.x, 300);
  assert.deepEqual(r.guias[0], { eje: "x", pos: 300 });
});

test("redimensionar desde el sureste crece; desde el noroeste mantiene la esquina opuesta", () => {
  const c = { x: 100, y: 100, w: 200, h: 100 };
  assert.deepEqual(redimensionar(c, "se", 50, 20), { x: 100, y: 100, w: 250, h: 120 });
  assert.deepEqual(redimensionar(c, "no", 50, 20), { x: 150, y: 120, w: 150, h: 80 });
});

test("redimensionar respeta el mínimo y la proporción en esquinas", () => {
  const c = { x: 0, y: 0, w: 200, h: 100 };
  assert.deepEqual(redimensionar(c, "e", -500, 0), { x: 0, y: 0, w: 20, h: 100 });
  const p = redimensionar(c, "se", 200, 0, true);
  assert.equal(p.w, 400);
  assert.equal(p.h, 200);
  // Un lado (no esquina) no fuerza proporción.
  assert.deepEqual(redimensionar(c, "s", 0, 50, true), { x: 0, y: 0, w: 200, h: 150 });
});

test("rotacionDesde: arriba 0°, derecha 90°, abajo 180°, con snap a 15°", () => {
  assert.equal(rotacionDesde(0, 0, 0, -10), 0);
  assert.equal(rotacionDesde(0, 0, 10, 0), 90);
  assert.equal(rotacionDesde(0, 0, 0, 10), 180);
  assert.equal(rotacionDesde(0, 0, -10, 0), 270);
  assert.equal(rotacionDesde(0, 0, 10, -9, true), 45);
});

test("dentroDelLienzo deja al menos 40 px visibles", () => {
  assert.deepEqual(dentroDelLienzo({ x: 5000, y: -900, w: 200, h: 100 }), { x: 1880, y: -60, w: 200, h: 100 });
  assert.deepEqual(dentroDelLienzo({ x: 10, y: 10, w: 200, h: 100 }), { x: 10, y: 10, w: 200, h: 100 });
});
