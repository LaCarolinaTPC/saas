import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buscarFichaReal,
  distanciaAcotada,
  mismaCedulaMalEscrita,
  notaDeRevision,
  palabrasDelNombre,
  similitudDeNombre,
  type FichaCandidata,
} from "./duplicados";

function ficha(cedula: string, nombre: string, extra: Partial<FichaCandidata> = {}): FichaCandidata {
  return { cedula, nombre, estado: "RETIRADO", codigo: "4273", ...extra };
}

// ── Nombres ────────────────────────────────────────────────────────────────

test("las palabras cortas no cuentan: son conectores", () => {
  assert.deepEqual([...palabrasDelNombre("GUADAÑO DE LA HOZ HUGO JOSE")], [
    "GUADANO",
    "HOZ",
    "HUGO",
    "JOSE",
  ]);
});

test("quita tildes y la Ñ, igual que los otros normalizadores", () => {
  assert.deepEqual([...palabrasDelNombre("MUÑOZ VARELA")], ["MUNOZ", "VARELA"]);
  assert.deepEqual([...palabrasDelNombre("ACUÑA QUIÑONES")], ["ACUNA", "QUINONES"]);
});

test("el orden no importa: GEMA pone el apellido primero", () => {
  // El caso real: la ficha de Contratación contra la de GEMA.
  assert.equal(similitudDeNombre("ALEJANDRO GONZALEZ", "GONZALEZ GONZALEZ ALEJANDRO ARNALDO"), 1);
  assert.equal(similitudDeNombre("DANIEL BARRIOS", "BARRIOS LOPEZ DANIEL JOSE"), 1);
  assert.equal(similitudDeNombre("IVAN ANTONIO MARTINEZ HOYOS", "MARTINEZ HOYOS IVAN ANTONIO"), 1);
});

test("nombres distintos no se parecen", () => {
  assert.equal(similitudDeNombre("PEDRO PEREZ", "JUAN GOMEZ"), 0);
  assert.equal(similitudDeNombre("", "JUAN GOMEZ"), 0);
  assert.equal(similitudDeNombre(null, null), 0);
});

// ── Cédulas ────────────────────────────────────────────────────────────────

test("distancia acotada corta cuando se pasa del tope", () => {
  assert.equal(distanciaAcotada("72432641", "72432641", 2), 0);
  assert.equal(distanciaAcotada("8803185", "8803158", 2), 2);
  assert.ok(distanciaAcotada("72008791", "1143460411", 2) > 2);
});

test("dígitos que sobran o faltan, en la punta o en medio", () => {
  // Casos reales del 2026-10-19. Los dos primeros son recortes de la punta;
  // el tercero tiene el dígito metido en medio («72|4|32641») y el cuarto dos.
  assert.equal(mismaCedulaMalEscrita("1001915077", "100191507"), "digito de mas o de menos");
  assert.equal(mismaCedulaMalEscrita("1001779588", "100177958"), "digito de mas o de menos");
  assert.equal(mismaCedulaMalEscrita("724432641", "72432641"), "digito de mas o de menos");
  assert.equal(mismaCedulaMalEscrita("852700636", "8527063"), "digito de mas o de menos");
});

test("el motivo lo decide la longitud, no dónde está el dígito", () => {
  assert.equal(mismaCedulaMalEscrita("72432641", "724432641"), "digito de mas o de menos");
  assert.equal(mismaCedulaMalEscrita("72432004", "72432002"), "digitos cambiados");
});

test("dígitos transpuestos o cambiados", () => {
  assert.equal(mismaCedulaMalEscrita("8803185", "8803158"), "digitos cambiados");
  assert.equal(mismaCedulaMalEscrita("72279696", "72279969"), "digitos cambiados");
  assert.equal(mismaCedulaMalEscrita("72432002", "72432004"), "digitos cambiados");
});

test("dos cédulas distintas de verdad no se confunden", () => {
  assert.equal(mismaCedulaMalEscrita("72008791", "1143460411"), null);
  assert.equal(mismaCedulaMalEscrita("72008791", "72008791"), null); // la misma no es un error
  assert.equal(mismaCedulaMalEscrita("", "72008791"), null);
});

// ── La búsqueda completa ───────────────────────────────────────────────────

const CONOCIDAS: FichaCandidata[] = [
  ficha("1001915077", "GONZALEZ GONZALEZ ALEJANDRO ARNALDO"),
  ficha("72432641", "MARTINEZ HOYOS IVAN ANTONIO", { estado: "ACTIVO" }),
  ficha("1143460411", "DAMS MOLINA GINA PAOLA", { estado: "ACTIVO" }),
];

test("encuentra la ficha real del caso que reportó el usuario", () => {
  const r = buscarFichaReal("100191507", "ALEJANDRO GONZALEZ", CONOCIDAS);
  assert.equal(r.length, 1);
  assert.equal(r[0].ficha.cedula, "1001915077");
  assert.equal(r[0].similitudNombre, 1);
  assert.equal(r[0].motivo, "digito de mas o de menos");
});

test("una cédula parecida con otro nombre NO cuenta", () => {
  // Es la guarda que evita pegarle la historia de alguien a otra persona.
  const r = buscarFichaReal("100191507", "PEDRO PEREZ GOMEZ", CONOCIDAS);
  assert.equal(r.length, 0);
});

test("no compara contra fichas sin confirmar: ninguna es la verdad", () => {
  const provisional = [ficha("1001915077", "GONZALEZ ALEJANDRO", { codigo: null })];
  assert.equal(buscarFichaReal("100191507", "ALEJANDRO GONZALEZ", provisional).length, 0);
});

test("una cédula de 11 dígitos no encuentra a nadie, y así es", () => {
  // `11051674660` existe en los datos y no tiene hermano hallable.
  assert.equal(buscarFichaReal("11051674660", "ROBINSON LEONARDO POSADA CASTAÑO", CONOCIDAS).length, 0);
});

test("la nota dice la cédula sospechada y el motivo", () => {
  const r = buscarFichaReal("100191507", "ALEJANDRO GONZALEZ", CONOCIDAS);
  const nota = notaDeRevision(r);
  assert.ok(nota);
  assert.match(nota, /REVISAR LA CEDULA/);
  assert.match(nota, /1001915077/);
  assert.match(nota, /digito de mas o de menos/);
});

test("sin parecidos no hay nota", () => {
  assert.equal(notaDeRevision([]), null);
});
