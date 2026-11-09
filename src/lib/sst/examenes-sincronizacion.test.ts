import { test } from "node:test";
import assert from "node:assert/strict";
import type { PersonaExamen } from "./examenes";
import {
  clasificarConductor, clasificarEmpleado, planSincronizacion, situacionEnMaestro,
  type ConductorMaestro, type EmpleadoMaestro,
} from "./examenes-sincronizacion";

const HOY = "2026-11-09";

const cond = (cedula: string, extra: Partial<ConductorMaestro> = {}): ConductorMaestro => ({
  cedula, nombre: `Conductor ${cedula}`, estado: "ACTIVO", fechaIngreso: "2026-01-15", fechaRetiro: null, reubicado: false, ...extra,
});
const emp = (cedula: string, extra: Partial<EmpleadoMaestro> = {}): EmpleadoMaestro => ({
  cedula, nombre: `Empleado ${cedula}`, cargo: "Cajero", status: "activo", fechaIngreso: "2025-03-01", fechaRetiro: null, ...extra,
});
const persona = (cedula: string, extra: Partial<PersonaExamen> = {}): PersonaExamen => ({
  cedula, nombre: `P ${cedula}`, cargo: "Conductor - Cobrador", grupo: "conductores", fechaIngreso: "2020-01-01", periodicidadMeses: 12,
  activo: true, motivoInactivo: null, inactivoDesde: null, observaciones: null, origen: "gestivo", ...extra,
});

test("clasificar: estados de GEMA y de Empleados", () => {
  assert.equal(clasificarConductor("ACTIVO"), "activo");
  assert.equal(clasificarConductor("RETIRADO"), "retirado");
  assert.equal(clasificarConductor("SUSPENDIDO"), "otro");
  assert.equal(clasificarEmpleado("periodo_prueba"), "activo");
  assert.equal(clasificarEmpleado("inactivo"), "otro");
  assert.equal(clasificarEmpleado("retirado"), "retirado");
});

test("situacionEnMaestro: activo en cualquiera gana; reubicado y administrativo", () => {
  const m = situacionEnMaestro(
    [cond("11111", { estado: "RETIRADO", fechaRetiro: "2026-02-01" }), cond("22222", { reubicado: true }), cond("abc")],
    [emp("11111"), emp("33333", { status: "retirado", fechaRetiro: "2026-05-05" })]
  );
  assert.deepEqual([m.get("11111")?.activo, m.get("11111")?.grupo], [true, "administrativos"]);
  assert.equal(m.get("22222")?.grupo, "reubicados");
  assert.deepEqual([m.get("33333")?.retirado, m.get("33333")?.fechaRetiro], [true, "2026-05-05"]);
  assert.equal(m.has("abc"), false);
});

test("planSincronizacion: ingresos con periodicidad del profesiograma", () => {
  const m = situacionEnMaestro([cond("11111")], [emp("22222"), emp("33333", { cargo: "Astronauta" }), emp("44444", { fechaIngreso: "2026-12-01" })]);
  const plan = planSincronizacion([], m, HOY);
  const porCedula = new Map(plan.altas.map((a) => [a.cedula, a]));
  assert.deepEqual([porCedula.get("11111")?.grupo, porCedula.get("11111")?.periodicidadMeses], ["conductores", 12]);
  assert.deepEqual([porCedula.get("22222")?.grupo, porCedula.get("22222")?.periodicidadMeses], ["administrativos", 36]);
  assert.deepEqual([porCedula.get("33333")?.periodicidadMeses, porCedula.get("33333")?.sinProfesiograma], [12, true]);
  assert.equal(porCedula.has("44444"), false, "ingreso futuro: todavía no");
});

test("planSincronizacion: retiros solo de los grupos de GEMA, con fecha de retiro", () => {
  const m = situacionEnMaestro([cond("11111", { estado: "RETIRADO", fechaRetiro: "2026-10-31" }), cond("22222", { estado: "RETIRADO" })], [emp("33333", { status: "retirado" })]);
  const plan = planSincronizacion(
    [persona("11111"), persona("22222"), persona("33333", { grupo: "metrorecaudo" }), persona("55555")],
    m,
    HOY
  );
  assert.deepEqual(plan.retiros.map((r) => [r.cedula, r.fecha]), [["11111", "2026-10-31"], ["22222", HOY]]);
  assert.equal(plan.altas.length, 0);
});

test("planSincronizacion: reingreso y completar datos faltantes", () => {
  const m = situacionEnMaestro([cond("11111", { fechaIngreso: "2026-08-01" }), cond("22222", { fechaIngreso: "2019-05-01" }), cond("33333")], []);
  const plan = planSincronizacion(
    [
      persona("11111", { activo: false, motivoInactivo: "retirado", inactivoDesde: "2025-12-31" }),
      persona("22222", { activo: false, motivoInactivo: "retirado", inactivoDesde: "2025-12-31" }),
      persona("33333", { fechaIngreso: null, cargo: null }),
    ],
    m,
    HOY
  );
  assert.deepEqual(plan.reingresos.map((r) => [r.cedula, r.fechaIngreso]), [["11111", "2026-08-01"]]);
  assert.deepEqual(plan.completar, [{ cedula: "33333", fechaIngreso: "2026-01-15", cargo: "Conductor - Cobrador" }]);
});
