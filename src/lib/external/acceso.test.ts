import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTERNAL_RESOURCES } from "./resources";
import { ALL_MODULES } from "../permissions-shared";
import { ACCESO_TOTAL, MODULOS_POR_RECURSO, SIN_ACCESO, puedeVer, recursosDeModulos } from "./acceso";

// Módulos de los tipos de usuario de producción el 2026-09-30.
const TESORERIA = ["dashboard", "tesoreria", "rendimiento", "financiera"];
const OPERACIONES = ["accidentabilidad"];
const RRHH = [
  "vacantes", "candidatos", "empleados", "conductores", "documentos", "campanas",
  "ausentismo", "tesoreria", "comunicaciones", "riesgo", "incapacidades",
];

test("todo recurso expuesto tiene sus módulos definidos, y solo con módulos que existen", () => {
  const modulos = new Set<string>(ALL_MODULES);
  for (const r of EXTERNAL_RESOURCES) {
    assert.ok(r.name in MODULOS_POR_RECURSO, `${r.name} sin módulos: solo lo vería el administrador`);
    for (const m of MODULOS_POR_RECURSO[r.name] ?? []) {
      assert.ok(modulos.has(m), `${r.name}: módulo inexistente ${m}`);
    }
  }
  const expuestos = new Set(EXTERNAL_RESOURCES.map((r) => r.name));
  for (const nombre of Object.keys(MODULOS_POR_RECURSO)) {
    assert.ok(expuestos.has(nombre), `${nombre} tiene módulos pero no está en EXTERNAL_RESOURCES`);
  }
});

test("operaciones solo ve accidentabilidad y los catálogos sin datos personales", () => {
  const ve = recursosDeModulos(OPERACIONES);
  assert.deepEqual(
    [...ve].sort(),
    ["accidente_evaluaciones", "accidente_eventos", "accidente_vehiculos", "accidentes", "departments"]
  );
});

test("tesorería ve el dinero del afiliado y la operación de GEMA, no la salud ni el reclutamiento", () => {
  const ve = recursosDeModulos(TESORERIA);
  for (const r of ["ingreso_tercero", "propietarios", "viajes_recaudados", "historico_despacho", "devengados_entregas", "vw_financiera_consolidado", "gema_sync_state"]) {
    assert.ok(ve.has(r), r);
  }
  for (const r of ["ausentismo", "candidates", "riesgo_conductores", "accidentes", "mantenimiento_reportes"]) {
    assert.ok(!ve.has(r), r);
  }
});

test("rotación ve la operación de GEMA pero no el dinero del afiliado", () => {
  const ve = recursosDeModulos(["rotacion"]);
  assert.ok(ve.has("viajes_recaudados"));
  assert.ok(ve.has("cumplimientos"));
  assert.ok(ve.has("conductores_con_grupo"));
  assert.ok(!ve.has("ingreso_tercero"));
  assert.ok(!ve.has("propietarios"));
});

test("RRHH ve personal, salud y riesgo, y lo de tesorería por tener ese módulo", () => {
  const ve = recursosDeModulos(RRHH);
  for (const r of ["employees", "candidates", "ausentismo", "ausentismo_registros", "riesgo_conductores", "conductores_con_grupo", "devengados_entregas"]) {
    assert.ok(ve.has(r), r);
  }
  assert.ok(!ve.has("accidentes"));
  assert.ok(!ve.has("vw_financiera_consolidado"));
});

test("un tipo sin módulos solo ve los catálogos; sin tipo no ve nada; el admin ve todo", () => {
  assert.deepEqual([...recursosDeModulos([])], ["departments"]);
  assert.equal(puedeVer(SIN_ACCESO, "departments"), false);
  for (const r of EXTERNAL_RESOURCES) assert.ok(puedeVer(ACCESO_TOTAL, r.name));
});
