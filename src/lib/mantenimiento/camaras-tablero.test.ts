import { test } from "node:test";
import assert from "node:assert/strict";
import type { RevisionCamaras } from "./camaras-data";
import type { TipoNovedad } from "./camaras-reglas";
import { resumirTablero } from "./camaras-tablero";

const TIPOS: TipoNovedad[] = [
  { clave: "camara_normal", elemento: "camara", nombre: "Normal", es_falla: false, exige_dfs: true, exige_aforo: true, activo: true, orden: 1 },
  { clave: "camara_microsd", elemento: "camara", nombre: "MicroSD", es_falla: true, exige_dfs: false, exige_aforo: false, activo: true, orden: 2 },
  { clave: "sensor_apagado", elemento: "sensor", nombre: "Sensor apagado", es_falla: true, exige_dfs: false, exige_aforo: false, activo: true, orden: 3 },
];

let n = 0;
const rev = (r: Partial<RevisionCamaras>): RevisionCamaras => ({
  id: String(++n), fecha_viaje: "2026-09-10", vehiculo_codigo: "537", viaje: "1", despacho_numero: null,
  conductor_cedula: "1", conductor_nombre: "PEREZ", conductor_origen: "gema_viaje", elemento: "camara",
  tipo_novedad: "camara_normal", con_falla: false, dfs_optocontrol: 50, aforo: 50, revision_repetida: false,
  observaciones: null, mantenimiento_reporte_id: null, tecnico_email: null, origen: "formulario", alertas: [], created_at: "",
  ...r,
});

test("totales, cuadre del DFS y viajes distintos", () => {
  const t = resumirTablero([
    rev({}),
    rev({ elemento: "sensor", tipo_novedad: "sensor_apagado", con_falla: true, dfs_optocontrol: null, aforo: null }),
    rev({ viaje: "2", dfs_optocontrol: 30, aforo: 60 }),
  ], TIPOS, {});
  assert.equal(t.revisiones, 3);
  assert.equal(t.viajesRevisados, 2);
  assert.equal(t.fallas, 1);
  assert.equal(t.comparables, 2);
  assert.equal(t.pctCuadra, 50);
  assert.deepEqual(t.porTipo, [{ clave: "sensor_apagado", cantidad: 1, nombre: "Sensor apagado", elemento: "sensor" }]);
});

test("vehículos ordenados por fallas, con la diferencia del sensor", () => {
  const t = resumirTablero([
    rev({ vehiculo_codigo: "610", tipo_novedad: "camara_microsd", con_falla: true, dfs_optocontrol: null, aforo: null }),
    rev({ vehiculo_codigo: "537", dfs_optocontrol: 40, aforo: 50 }),
  ], TIPOS, {});
  assert.equal(t.vehiculos[0].codigo, "610");
  assert.equal(t.vehiculos[0].fallasCamara, 1);
  assert.equal(t.vehiculos[1].diferenciaDfs, -10);
});

test("conductores: caja frente al aforo, mínimo de viajes y sin repetidas", () => {
  const filas = [1, 2, 3].map((i) => rev({ viaje: String(i), despacho_numero: i, aforo: 100 }));
  const t = resumirTablero([
    ...filas,
    rev({ viaje: "1", despacho_numero: 1, aforo: 100, revision_repetida: true }),
    rev({ conductor_cedula: "2", despacho_numero: 9, aforo: 10 }),
  ], TIPOS, { 1: 90, 2: 90, 3: 90, 9: 10 });
  assert.equal(t.conductores.length, 1);
  assert.deepEqual(t.conductores[0], { cedula: "1", nombre: "PEREZ", viajes: 3, aforo: 300, caja: 270, diferencia: -30, pct: -10 });
});

test("meses del más reciente al más viejo", () => {
  const t = resumirTablero([rev({ fecha_viaje: "2026-08-01" }), rev({ fecha_viaje: "2026-09-01" })], TIPOS, {});
  assert.deepEqual(t.porMes.map((m) => m.mes), ["2026-09", "2026-08"]);
});
