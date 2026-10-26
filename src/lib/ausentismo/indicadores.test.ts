import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenarTabla, siguienteOrden, SIN_DATO, type Grupo, type GrupoMensual } from "./indicadores";

const grupo = (clave: string, dias: number, eventos: number, extra: Partial<Grupo> = {}): Grupo => ({
  clave, etiqueta: clave, detalle: null, eventos, prorrogas: 0, dias, trabajadores: 1,
  promedio: eventos > 0 ? dias / eventos : 0, pctDias: 0, ...extra,
});
const claves = (gs: { clave: string }[]) => gs.map((g) => g.clave);

// Ranking por días: así llega la lista a la tabla.
const ranking = [
  grupo("ANA", 30, 1),
  grupo("beto", 20, 4),
  grupo("Ángela", 10, 2),
  grupo("__otros__", 50, 9),
  grupo(SIN_DATO, 5, 1),
];

test("sin orden devuelve el ranking tal cual", () => {
  assert.equal(ordenarTabla(ranking, null), ranking);
});

test("ordena por una columna numérica en los dos sentidos", () => {
  assert.deepEqual(claves(ordenarTabla(ranking, { columna: "eventos", dir: "desc" })), ["beto", "Ángela", "ANA", "__otros__", SIN_DATO]);
  assert.deepEqual(claves(ordenarTabla(ranking, { columna: "eventos", dir: "asc" })), ["ANA", "Ángela", "beto", "__otros__", SIN_DATO]);
});

test("Otros y Sin dato quedan al final aunque tengan el valor más alto", () => {
  const r = ordenarTabla(ranking, { columna: "dias", dir: "desc" });
  assert.deepEqual(claves(r).slice(-2), ["__otros__", SIN_DATO]);
});

test("el texto ordena sin distinguir mayúsculas ni tildes", () => {
  assert.deepEqual(claves(ordenarTabla(ranking, { columna: "etiqueta", dir: "asc" })), ["ANA", "Ángela", "beto", "__otros__", SIN_DATO]);
});

test("no agrega ni quita filas", () => {
  const r = ordenarTabla(ranking, { columna: "promedio", dir: "asc" });
  assert.equal(r.length, ranking.length);
  assert.deepEqual(new Set(claves(r)), new Set(claves(ranking)));
});

test("la tasa sin base va al final en cualquier sentido; el mes ordena por fecha", () => {
  const mes = (m: string, tasa: number | null): GrupoMensual => ({ ...grupo(m, 1, 1), etiqueta: `x${m}`, mes: m, tasa, parcial: false });
  const meses = [mes("2026-02", 3), mes("2026-10", null), mes("2026-01", 5)];
  assert.deepEqual(claves(ordenarTabla(meses, { columna: "tasa", dir: "desc" })), ["2026-01", "2026-02", "2026-10"]);
  assert.deepEqual(claves(ordenarTabla(meses, { columna: "tasa", dir: "asc" })), ["2026-02", "2026-01", "2026-10"]);
  assert.deepEqual(claves(ordenarTabla(meses, { columna: "mes", dir: "desc" })), ["2026-10", "2026-02", "2026-01"]);
});

test("el clic recorre primer sentido → contrario → original", () => {
  const a = siguienteOrden(null, "dias");
  assert.deepEqual(a, { columna: "dias", dir: "desc" });
  const b = siguienteOrden(a, "dias");
  assert.deepEqual(b, { columna: "dias", dir: "asc" });
  assert.equal(siguienteOrden(b, "dias"), null);
  assert.deepEqual(siguienteOrden(null, "etiqueta"), { columna: "etiqueta", dir: "asc" });
  assert.deepEqual(siguienteOrden(b, "eventos"), { columna: "eventos", dir: "desc" });
});
