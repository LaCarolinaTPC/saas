import { test } from "node:test";
import assert from "node:assert/strict";
import { analizarVacaciones, enVacaciones, normalizarTipoCierre, type RegistroVacacion } from "./liquidacion";

const reg = (inicio: string, fin: string | null): RegistroVacacion => ({
  fecha: inicio,
  fecha_inicio: inicio,
  fecha_fin: fin,
});

// ── analizarVacaciones ────────────────────────────────────────────────────────

test("vacación al INICIO de la quincena: cuenta desde el reingreso", () => {
  // Vacación 1–9; quincena 1–15. Reingreso = 10.
  const r = analizarVacaciones([reg("2026-10-01", "2026-10-09")], "2026-10-01", "2026-10-15");
  assert.ok(r);
  assert.equal(r.reingreso, "2026-10-10");
  assert.equal(r.cubreInicio, true, "el día 1 ya es vacación");
  assert.equal(r.cubreTodaLaQuincena, false, "quedan días liquidables (10–15)");
});

test("vacación al FINAL de la quincena: conserva los días trabajados antes", () => {
  // Vacación 20–(mes siguiente); quincena 16–31. El día 16 no es vacación.
  const r = analizarVacaciones([reg("2026-10-20", "2026-11-05")], "2026-10-16", "2026-10-31");
  assert.ok(r);
  assert.equal(r.reingreso, "2026-11-06");
  assert.equal(r.cubreInicio, false, "el día 16 no es vacación (trabajó)");
  assert.equal(r.cubreTodaLaQuincena, false);
});

test("vacación que cubre TODA la quincena: no hay días liquidables", () => {
  const r = analizarVacaciones([reg("2026-09-25", "2026-10-20")], "2026-10-01", "2026-10-15");
  assert.ok(r);
  assert.equal(r.cubreInicio, true);
  assert.equal(r.cubreTodaLaQuincena, true);
  assert.equal(r.reingreso, "2026-10-21");
});

test("sin solape con el rango devuelve null", () => {
  assert.equal(analizarVacaciones([reg("2026-08-01", "2026-08-10")], "2026-10-01", "2026-10-15"), null);
  assert.equal(analizarVacaciones([], "2026-10-01", "2026-10-15"), null);
});

test("sin fecha_fin cubre solo el día de inicio", () => {
  const r = analizarVacaciones([reg("2026-10-05", null)], "2026-10-01", "2026-10-15");
  assert.ok(r);
  assert.deepEqual(r.periodos, [{ inicio: "2026-10-05", fin: "2026-10-05" }]);
  assert.equal(r.reingreso, "2026-10-06");
  assert.equal(r.cubreInicio, false);
});

test("dos vacaciones en la quincena: el reingreso es el de la última", () => {
  const r = analizarVacaciones(
    [reg("2026-10-02", "2026-10-04"), reg("2026-10-10", "2026-10-12")],
    "2026-10-01",
    "2026-10-15"
  );
  assert.ok(r);
  assert.equal(r.periodos.length, 2);
  assert.equal(r.reingreso, "2026-10-13");
  assert.equal(r.cubreInicio, false, "el día 1 quedó libre entre vacaciones");
  assert.equal(r.cubreTodaLaQuincena, false);
});

// ── enVacaciones ──────────────────────────────────────────────────────────────

test("enVacaciones: dentro y fuera de los periodos", () => {
  const p = [{ inicio: "2026-10-02", fin: "2026-10-09" }];
  assert.equal(enVacaciones(p, "2026-10-05"), true);
  assert.equal(enVacaciones(p, "2026-10-02"), true);
  assert.equal(enVacaciones(p, "2026-10-09"), true);
  assert.equal(enVacaciones(p, "2026-10-01"), false);
  assert.equal(enVacaciones(p, "2026-10-10"), false);
});

// ── sanity: la homologación de tipos de cierre no cambió ──────────────────────

test("normalizarTipoCierre sigue homologando", () => {
  assert.equal(normalizarTipoCierre("CU (RUTAS,GRUPOS)"), "CU Rutas");
  assert.equal(normalizarTipoCierre("INDIVIDUAL"), "Individual");
});
