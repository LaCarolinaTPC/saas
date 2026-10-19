import { test } from "node:test";
import assert from "node:assert/strict";
import { contarCambiosDeCedula } from "./ingesta";

/**
 * Qué cuenta como «cambio de cédula», que es lo que decide si hay que
 * reatribuir las marcaciones ya cargadas.
 *
 * El caso que se escapó en producción: una persona NUEVA en ZKAccess cuyo pin
 * ya tenía marcaciones (se enroló después de que llegaran, o la borraron y la
 * volvieron a crear — hay 261 pines así, con 38.454 marcaciones sin dueño). Si
 * no cuenta como cambio, la re-resolución no corre y su historial se queda sin
 * cédula para siempre.
 */
test("persona nueva CON cédula cuenta: su historial hay que atribuirlo", () => {
  const antes = new Map<string, string | null>([["27", "72197769"]]);
  const n = contarCambiosDeCedula(antes, [
    { pin: "27", cedula: "72197769" },
    { pin: "18", cedula: "71111118" }, // nueva, con cédula
  ]);
  assert.equal(n, 1);
});

test("persona nueva SIN cédula no cuenta: no hay nada que atribuir", () => {
  const antes = new Map<string, string | null>([["27", "72197769"]]);
  const n = contarCambiosDeCedula(antes, [
    { pin: "27", cedula: "72197769" },
    { pin: "999", cedula: null },
  ]);
  assert.equal(n, 0);
});

test("cédula corregida cuenta", () => {
  const antes = new Map<string, string | null>([["21", "79999901"]]);
  assert.equal(contarCambiosDeCedula(antes, [{ pin: "21", cedula: "72433999" }]), 1);
});

test("cédula borrada cuenta: hay que desatribuir sus marcaciones", () => {
  const antes = new Map<string, string | null>([["89", "72162708"]]);
  assert.equal(contarCambiosDeCedula(antes, [{ pin: "89", cedula: null }]), 1);
});

test("sin cambios no cuenta nada: en régimen no se reatribuye", () => {
  const antes = new Map<string, string | null>([
    ["27", "72197769"],
    ["999", null],
  ]);
  const n = contarCambiosDeCedula(antes, [
    { pin: "27", cedula: "72197769" },
    { pin: "999", cedula: null },
  ]);
  assert.equal(n, 0);
});

test("un pin que desaparece del equipo no cuenta como cambio", () => {
  // Deja de venir en el snapshot: se apaga con activo_en_zk, pero su cédula
  // sigue siendo la que era y sus marcaciones no se tocan.
  const antes = new Map<string, string | null>([
    ["27", "72197769"],
    ["18", "71111118"],
  ]);
  assert.equal(contarCambiosDeCedula(antes, [{ pin: "27", cedula: "72197769" }]), 0);
});
