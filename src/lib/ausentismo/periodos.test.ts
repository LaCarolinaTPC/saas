import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clavesPeriodicas,
  cubreDia,
  describirPeriodo,
  empiezaEn,
  finDesdeReintegro,
  periodoDe,
  posicionEnPeriodo,
  reintegroDesdeFin,
  seCruzan,
} from "./periodos";
import type { Concepto } from "./constants";

const concepto = (key: string, cubre_rango: boolean): Concepto => ({
  key,
  nombre: key === "vacaciones" ? "Vacaciones" : key,
  orden: 10,
  activo: true,
  cuenta_reincidencia: !cubre_rango,
  exige_soporte: false,
  cubre_rango,
});

const CATALOGO = [concepto("vacaciones", true), concepto("permiso", false)];
const PERIODICAS = clavesPeriodicas(CATALOGO);

/** Vacaciones del 20/09 al 05/10: 16 días. */
const vacaciones = {
  fecha: "2026-09-20",
  tipo: "vacaciones",
  fecha_inicio: "2026-09-20",
  fecha_fin: "2026-10-05",
};

const permiso = {
  fecha: "2026-09-22",
  tipo: "permiso",
  fecha_inicio: "2026-09-22",
  fecha_fin: "2026-09-24",
};

test("solo los conceptos marcados cubren rango", () => {
  assert.deepEqual([...PERIODICAS], ["vacaciones"]);
  assert.deepEqual(periodoDe(vacaciones, PERIODICAS), {
    inicio: "2026-09-20",
    fin: "2026-10-05",
  });
  assert.equal(periodoDe(permiso, PERIODICAS), null);
});

test("las vacaciones se presentan todos los días del periodo, extremos incluidos", () => {
  for (const dia of ["2026-09-20", "2026-09-21", "2026-09-30", "2026-10-05"]) {
    assert.ok(cubreDia(vacaciones, dia, PERIODICAS), dia);
  }
  assert.equal(cubreDia(vacaciones, "2026-09-19", PERIODICAS), false);
  assert.equal(cubreDia(vacaciones, "2026-10-06", PERIODICAS), false);
});

test("un concepto que no cubre rango se sigue viendo solo su día", () => {
  assert.ok(cubreDia(permiso, "2026-09-22", PERIODICAS));
  // Aunque traiga fecha fin: nada cambia para los conceptos de siempre.
  assert.equal(cubreDia(permiso, "2026-09-23", PERIODICAS), false);
});

test("sin fecha de terminación el periodo cubre un solo día", () => {
  const abierto = { ...vacaciones, fecha_fin: null };
  assert.ok(cubreDia(abierto, "2026-09-20", PERIODICAS));
  assert.equal(cubreDia(abierto, "2026-09-21", PERIODICAS), false);
});

test("empiezaEn distingue el primer día del periodo de los que vienen corriendo", () => {
  assert.ok(empiezaEn(vacaciones, "2026-09-20", PERIODICAS));
  assert.equal(empiezaEn(vacaciones, "2026-09-21", PERIODICAS), false);
  assert.ok(empiezaEn(permiso, "2026-09-22", PERIODICAS));
});

test("la posición dentro del periodo cuenta desde el primer día", () => {
  assert.deepEqual(posicionEnPeriodo(vacaciones, "2026-09-20", PERIODICAS), { dia: 1, total: 16 });
  assert.deepEqual(posicionEnPeriodo(vacaciones, "2026-09-22", PERIODICAS), { dia: 3, total: 16 });
  assert.deepEqual(posicionEnPeriodo(vacaciones, "2026-10-05", PERIODICAS), { dia: 16, total: 16 });
  // Fuera del periodo, en un concepto normal y en un periodo de un solo día no hay nada que marcar.
  assert.equal(posicionEnPeriodo(vacaciones, "2026-10-06", PERIODICAS), null);
  assert.equal(posicionEnPeriodo(permiso, "2026-09-22", PERIODICAS), null);
  assert.equal(
    posicionEnPeriodo({ ...vacaciones, fecha_fin: "2026-09-20" }, "2026-09-20", PERIODICAS),
    null
  );
});

test("seCruzan detecta el traslape en todas sus formas", () => {
  const p = { inicio: "2026-09-20", fin: "2026-10-05" as string | null };
  // Contenido, a caballo por cada extremo y exactamente en el límite.
  assert.ok(seCruzan(p, { inicio: "2026-09-25", fin: "2026-09-26" }));
  assert.ok(seCruzan(p, { inicio: "2026-09-10", fin: "2026-09-20" }));
  assert.ok(seCruzan(p, { inicio: "2026-10-05", fin: "2026-10-20" }));
  assert.ok(seCruzan(p, { inicio: "2026-09-01", fin: "2026-12-31" }));
  // Contiguos pero sin tocarse, y un día suelto dentro.
  assert.equal(seCruzan(p, { inicio: "2026-10-06", fin: "2026-10-10" }), false);
  assert.equal(seCruzan(p, { inicio: "2026-09-18", fin: "2026-09-19" }), false);
  assert.ok(seCruzan(p, { inicio: "2026-09-22", fin: null }));
  assert.equal(seCruzan(p, { inicio: "2026-10-06", fin: null }), false);
});

test("describirPeriodo escribe las fechas como las lee RRHH", () => {
  const labels = { vacaciones: "Vacaciones" };
  assert.equal(describirPeriodo(vacaciones, labels), "Vacaciones del 20/09/26 al 05/10/26");
  assert.equal(
    describirPeriodo({ ...vacaciones, fecha_fin: null }, labels),
    "Vacaciones desde el 20/09/26"
  );
});

test("finDesdeReintegro deja el periodo hasta el día antes de volver", () => {
  assert.equal(finDesdeReintegro("2026-10-05", "2026-10-20"), "2026-10-19");
  // Cambio de mes, de año y febrero.
  assert.equal(finDesdeReintegro("2026-09-20", "2026-10-01"), "2026-09-30");
  assert.equal(finDesdeReintegro("2026-12-20", "2027-01-01"), "2026-12-31");
  assert.equal(finDesdeReintegro("2028-02-20", "2028-03-01"), "2028-02-29");
  // Vuelve al día siguiente: un solo día de vacaciones.
  assert.equal(finDesdeReintegro("2026-10-05", "2026-10-06"), "2026-10-05");
  // Reintegro el mismo día del inicio o antes: no hay periodo.
  assert.equal(finDesdeReintegro("2026-10-05", "2026-10-05"), null);
  assert.equal(finDesdeReintegro("2026-10-05", "2026-10-01"), null);
});

test("reintegroDesdeFin precarga el reintegro de los periodos ya guardados", () => {
  assert.equal(reintegroDesdeFin("2026-09-20", "2026-10-05"), "2026-10-06");
  // Los viejos de un solo día (sin fin) siguen siendo de un día.
  assert.equal(reintegroDesdeFin("2026-09-20", null), "2026-09-21");
  const ini = "2026-09-20";
  assert.equal(finDesdeReintegro(ini, reintegroDesdeFin(ini, null)), ini);
});
