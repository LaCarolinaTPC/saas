import { test } from "node:test";
import assert from "node:assert/strict";
import { paginar, paginasVisibles } from "./paginacion";

const cien = Array.from({ length: 100 }, (_, i) => i + 1);

test("parte la lista y dice qué filas muestra", () => {
  const p = paginar(cien, 2, 25);
  assert.deepEqual([p.filas[0], p.filas.at(-1), p.desde, p.hasta, p.totalPaginas, p.total], [26, 50, 26, 50, 4, 100]);
});

test("recorta la página fuera de rango y la última puede venir incompleta", () => {
  assert.equal(paginar(cien, 99, 30).pagina, 4);
  assert.deepEqual(paginar(cien, 4, 30).filas, [91, 92, 93, 94, 95, 96, 97, 98, 99, 100]);
  assert.equal(paginar(cien, 0, 25).pagina, 1);
});

test("sin filas: una página vacía y contadores en cero", () => {
  const p = paginar([], 3, 25);
  assert.deepEqual([p.pagina, p.totalPaginas, p.desde, p.hasta, p.filas.length], [1, 1, 0, 0, 0]);
});

test("números de página con saltos", () => {
  assert.deepEqual(paginasVisibles(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(paginasVisibles(1, 20), [1, 2, null, 20]);
  assert.deepEqual(paginasVisibles(10, 20), [1, null, 9, 10, 11, null, 20]);
  assert.deepEqual(paginasVisibles(3, 20), [1, 2, 3, 4, null, 20]);
  assert.deepEqual(paginasVisibles(20, 20), [1, null, 19, 20]);
});
