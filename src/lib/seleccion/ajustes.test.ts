import { test } from "node:test";
import assert from "node:assert/strict";
import { mostrarValor, validarAjuste } from "./ajustes";

const a = (clave: string, unidad: string) => ({ clave, unidad, nombre: clave });

test("sí o no (por ejemplo, si el RNMC es obligatorio)", () => {
  assert.deepEqual(validarAjuste(a("rnmc_obligatorio", "si_no"), "false"), { ok: true, valor: false });
  assert.deepEqual(validarAjuste(a("rnmc_obligatorio", "si_no"), "Sí"), { ok: true, valor: true });
  assert.deepEqual(validarAjuste(a("rnmc_obligatorio", "si_no"), true), { ok: true, valor: true });
  assert.equal(validarAjuste(a("rnmc_obligatorio", "si_no"), "tal vez").ok, false);
  assert.equal(mostrarValor("si_no", false), "No");
  assert.equal(mostrarValor("si_no", true), "Sí");
});

test("horas en formato HH:MM", () => {
  assert.deepEqual(validarAjuste(a("recordatorio_cita_hora", "hora"), " 08:00 "), { ok: true, valor: "08:00" });
  assert.equal(validarAjuste(a("recordatorio_cita_hora", "hora"), "8 am").ok, false);
  assert.equal(validarAjuste(a("recordatorio_cita_hora", "hora"), "24:00").ok, false);
});

test("números dentro de su rango", () => {
  assert.deepEqual(validarAjuste(a("reactivacion_aviso1_horas", "horas"), "24"), { ok: true, valor: 24 });
  assert.equal(validarAjuste(a("reactivacion_aviso1_horas", "horas"), "0").ok, false);
  assert.equal(validarAjuste(a("reactivacion_aviso1_horas", "horas"), "").ok, false);
  assert.deepEqual(validarAjuste(a("simit_tope", "pesos"), "3.000.000"), { ok: true, valor: 3_000_000 });
});

test("edad mínima menor que la máxima", () => {
  const todos = [{ clave: "edad_minima", valor: 20 }, { clave: "edad_maxima", valor: 57 }];
  assert.equal(validarAjuste(a("edad_minima", "numero"), 60, todos).ok, false);
  assert.equal(validarAjuste(a("edad_maxima", "numero"), 19, todos).ok, false);
  assert.deepEqual(validarAjuste(a("edad_maxima", "numero"), 60, todos), { ok: true, valor: 60 });
});

test("listas: licencias válidas y ciudades sin repetir", () => {
  assert.deepEqual(validarAjuste(a("licencias", "lista"), "c2, C3, c2"), { ok: true, valor: ["C2", "C3"] });
  assert.equal(validarAjuste(a("licencias", "lista"), "C2, D1").ok, false);
  assert.deepEqual(validarAjuste(a("ciudades", "lista"), ["Barranquilla", " Soledad "]), { ok: true, valor: ["Barranquilla", "Soledad"] });
  assert.equal(validarAjuste(a("ciudades", "lista"), "").ok, false);
});

test("enlace de la política con https", () => {
  assert.equal(validarAjuste(a("enlace_politica", "texto"), "http://x.co").ok, false);
  assert.deepEqual(validarAjuste(a("enlace_politica", "texto"), "https://x.co/p"), { ok: true, valor: "https://x.co/p" });
  assert.deepEqual(validarAjuste(a("enlace_politica", "texto"), ""), { ok: true, valor: "" });
});

test("mostrar valores legibles", () => {
  assert.equal(mostrarValor("horas", 1), "1 hora");
  assert.equal(mostrarValor("dias", 7), "7 días");
  assert.equal(mostrarValor("pesos", 3000000), "$3.000.000");
  assert.equal(mostrarValor("lista", ["C2", "C3"]), "C2, C3");
  assert.equal(mostrarValor("texto", ""), "—");
});

test("nombre del asistente: no vacío, corto y sin llaves", () => {
  const a = { clave: "asistente_nombre", unidad: "texto", nombre: "Nombre del asistente de IA" };
  assert.deepEqual(validarAjuste(a, "  Angie "), { ok: true, valor: "Angie" });
  assert.equal(validarAjuste(a, "").ok, false);
  assert.equal(validarAjuste(a, "x".repeat(41)).ok, false);
  assert.equal(validarAjuste(a, "{nombre}").ok, false);
});
