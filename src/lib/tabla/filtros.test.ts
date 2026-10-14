import { test } from "node:test";
import assert from "node:assert/strict";
import { coincideTexto, pasaFiltroNumero, sinTildes } from "./filtros";

test("filtro numérico de columna", () => {
  const pasa = (e: string, v: number | null) => pasaFiltroNumero(e, v);
  assert.equal(pasa("", 3), true);
  assert.equal(pasa(">10", 11), true);
  assert.equal(pasa(">10", 10), false);
  assert.equal(pasa(">=10", 10), true);
  assert.equal(pasa("<0", -1), true);
  assert.equal(pasa("<= -2", -2), true);
  assert.equal(pasa("5", 5), true);
  assert.equal(pasa("=5", 6), false);
  assert.equal(pasa("!=0", 0), false);
  assert.equal(pasa("<>0", 3), true);
  assert.equal(pasa("10..20", 15), true);
  assert.equal(pasa("10..20", 21), false);
  assert.equal(pasa("-5..5", -5), true);
  assert.equal(pasa("±10", -12), true); // diferencia de 10 o más hacia cualquier lado
  assert.equal(pasa("±10", 9), false);
  assert.equal(pasa("1.000", 1000), true); // separador de miles
  assert.equal(pasa("vacío", null), true);
  assert.equal(pasa("vacio", 3), false);
  assert.equal(pasa(">0", null), false);
  assert.equal(pasa("abc", 3), true); // lo que no se entiende no filtra
});

test("texto sin tildes ni mayúsculas", () => {
  assert.equal(sinTildes("Actualización Conteo"), "ACTUALIZACION CONTEO");
  assert.ok(sinTildes("OÑATE BARROS").includes(sinTildes("oñate")));
});

test("coincidencia de texto de los buscadores", () => {
  // Filtro vacío (o solo espacios) no filtra nada.
  assert.equal(coincideTexto("", "lo que sea"), true);
  assert.equal(coincideTexto("   ", "lo que sea"), true);

  // Tildes y mayúsculas: el caso que fallaba antes de unificar.
  assert.equal(coincideTexto("auditoria", "Auditoría (bitácora de pagos)"), true);
  assert.equal(coincideTexto("AUDITORÍA", "auditoria"), true);
  assert.equal(coincideTexto("  tesor ", "Tesorería"), true);
  assert.equal(coincideTexto("oñate", "OÑATE BARROS"), true);

  // Coincide en cualquiera de los campos; los nulos y vacíos se ignoran.
  assert.equal(coincideTexto("ana", "Luis Pérez", "ana@x.co"), true);
  assert.equal(coincideTexto("x", null, undefined, ""), false);
  assert.equal(coincideTexto("zzz", "Luis", "ana@x.co"), false);

  // Sin campos no hay dónde buscar.
  assert.equal(coincideTexto("ana"), false);
});
