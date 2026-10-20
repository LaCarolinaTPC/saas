import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirEspejo, MAXIMO_BORRADO, MINIMO_ESPEJO } from "./espejo";

/** Un maestro de `n` llaves: "1", "2", … */
function maestro(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

test("borra las que el origen ya no trae", () => {
  const guardadas = maestro(100);
  const vigentes = new Set(maestro(98)); // se fueron la 99 y la 100
  const r = decidirEspejo(guardadas, vigentes);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.borrar, ["99", "100"]);
});

test("si el origen trae todo, no borra nada", () => {
  const r = decidirEspejo(["1", "2"], new Set(["1", "2"]));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.borrar, []);
});

test("en una tabla diminuta las guardas ganan, y está bien", () => {
  // 3 filas y falta una es un 33 %: la guarda se niega antes que borrar un
  // tercio del maestro. `conductores` tiene 1.289, así que no la toca nunca.
  const r = decidirEspejo(["1", "2", "3"], new Set(["1", "2"]));
  assert.equal(r.ok, false);
});

test("llaves nuevas en el origen no son asunto del borrado", () => {
  const r = decidirEspejo(["1"], new Set(["1", "2", "3"]));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.borrar, []);
});

test("el caso real del 2026-10-19: 22 de 1.289", () => {
  const guardadas = maestro(1289);
  // El origen trae 1.267 de las primeras.
  const vigentes = new Set(guardadas.slice(0, 1267));
  const r = decidirEspejo(guardadas, vigentes);
  assert.ok(r.ok, "22 de 1.289 es un 1,7 %: muy por debajo del tope");
  if (!r.ok) return;
  assert.equal(r.borrar.length, 22);
});

// ── Las guardas, que son la razón de que esto exista ───────────────────────

test("si el origen viene corto NO borra: parece una consulta que falló", () => {
  const guardadas = maestro(1000);
  // Llegó la mitad. Sin la guarda, se borrarían 500 conductores reales.
  const r = decidirEspejo(guardadas, new Set(guardadas.slice(0, 500)));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.motivo, /el origen trajo 500 y hay 1000/);
});

test("el umbral del origen corto está donde dice", () => {
  const guardadas = maestro(1000);
  const justoDebajo = new Set(guardadas.slice(0, Math.ceil(1000 * MINIMO_ESPEJO) - 1));
  assert.equal(decidirEspejo(guardadas, justoDebajo).ok, false);
});

test("si habría que borrar demasiado NO borra, aunque el origen venga completo", () => {
  // 1000 guardadas, el origen trae 950 PERO son 950 llaves que no están
  // guardadas: sobrarían las 1000. Pasa la primera guarda y cae en la segunda.
  const guardadas = maestro(1000);
  const vigentes = new Set(Array.from({ length: 950 }, (_, i) => `otra-${i}`));
  const r = decidirEspejo(guardadas, vigentes);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.motivo, /habria que borrar 1000 de 1000/);
});

test("el tope de borrado está donde dice", () => {
  const guardadas = maestro(1000);
  const tope = Math.floor(1000 * MAXIMO_BORRADO);
  // Justo en el tope: pasa.
  const enTope = decidirEspejo(guardadas, new Set(guardadas.slice(tope)));
  assert.equal(enTope.ok, true);
  // Uno más: se frena. (Cuando el origen es un subconjunto de lo guardado, las
  // dos guardas caen en el mismo punto: 10 % de sobrantes es lo mismo que 90 %
  // de cobertura. Lo que importa es que se frene.)
  const pasado = decidirEspejo(guardadas, new Set(guardadas.slice(tope + 1)));
  assert.equal(pasado.ok, false);
});

test("una tabla vacía no revienta ni dispara guardas", () => {
  const r = decidirEspejo([], new Set());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.borrar, []);
});

test("un origen vacío con tabla llena se frena", () => {
  const r = decidirEspejo(["1", "2", "3"], new Set());
  assert.equal(r.ok, false);
});

test("una llave repetida en la tabla sale una sola vez en el borrado", () => {
  // La cédula es única en `conductores`, pero la decisión es por llave y no
  // debe depender de eso.
  const guardadas = [...maestro(1000), "1000"];
  const r = decidirEspejo(guardadas, new Set(maestro(999)));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.borrar, ["1000"]);
});

test("los dos umbrales dejan margen entre sí", () => {
  assert.ok(MINIMO_ESPEJO > 0.5 && MINIMO_ESPEJO < 1);
  assert.ok(MAXIMO_BORRADO > 0 && MAXIMO_BORRADO < 0.5);
});
