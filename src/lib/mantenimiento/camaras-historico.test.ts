import { test } from "node:test";
import assert from "node:assert/strict";
import { mapearFilaForms, type FilaForms } from "./camaras-historico";

const fila = (f: Partial<FilaForms>): FilaForms => ({
  novedad: null, estadoCamara: null, tipo: null, tipoSensor: null, dfs: null, aforo: null, ...f,
});

test("cámara normal con conteos; el «Normal » con espacio es el mismo tipo", () => {
  assert.deepEqual(mapearFilaForms(fila({ novedad: "CAMARA", tipo: "Normal ", dfs: 81, aforo: 79 })), [
    { elemento: "camara", tipoNovedad: "camara_normal", dfs: 81, aforo: 79, alertas: [] },
  ]);
});

test("sensor: el tipo sale de TIPO INTERVENCIÓN SENSOR", () => {
  const [r] = mapearFilaForms(fila({ novedad: "SENSOR", tipoSensor: "No Marca P. 1" }));
  assert.equal(r.elemento, "sensor");
  assert.equal(r.tipoNovedad, "sensor_no_marca_p1");
});

test("fila vieja sin NOVEDAD: cámara y sensor del mismo viaje", () => {
  const r = mapearFilaForms(fila({ estadoCamara: "BUENA", tipo: "Normal", tipoSensor: "Rutina", dfs: 60, aforo: 59 }));
  assert.deepEqual(r.map((x) => [x.elemento, x.tipoNovedad, x.dfs]), [
    ["camara", "camara_normal", 60], ["sensor", "sensor_rutina", null],
  ]);
});

test("TIPO «Sensor» en fila de cámara: cámara normal sin alerta y sensor con su tipo", () => {
  const r = mapearFilaForms(fila({ novedad: "CAMARA", tipo: "Sensor", tipoSensor: "No Descargaba", dfs: 50, aforo: 48 }));
  assert.deepEqual(r.map((x) => [x.tipoNovedad, x.alertas]), [["camara_normal", []], ["sensor_no_descargaba", []]]);
});

test("DFS digitado como texto: NO es sin información, VARADO es bus varado", () => {
  assert.equal(mapearFilaForms(fila({ novedad: "CAMARA", tipo: "Normal", dfs: "NO", aforo: 82 }))[0].tipoNovedad, "camara_no_bajo_info");
  const [v] = mapearFilaForms(fila({ novedad: "CAMARA", tipo: "Normal", dfs: "VARADO", aforo: 43 }));
  assert.equal(v.tipoNovedad, "camara_varado");
  assert.equal(v.dfs, null);
  assert.equal(v.aforo, 43);
});

test("sin información o varado: el DFS de 0 es falta de dato", () => {
  const [r] = mapearFilaForms(fila({ novedad: "CAMARA", tipo: "No Bajo Info", dfs: 0, aforo: 38 }));
  assert.equal(r.dfs, null);
  assert.equal(r.aforo, 38);
});

test("cámara dañada: el aforo de 0 es que no hubo video", () => {
  const [r] = mapearFilaForms(fila({ estadoCamara: "MALO", tipo: "Desconfiguración", dfs: 41, aforo: 0 }));
  assert.equal(r.tipoNovedad, "camara_desconfiguracion");
  assert.equal(r.dfs, 41);
  assert.equal(r.aforo, null);
});

test("conteos imposibles se descartan con alerta", () => {
  const [r] = mapearFilaForms(fila({ novedad: "CAMARA", tipo: "Normal", dfs: 6767, aforo: -42 }));
  assert.equal(r.dfs, null);
  assert.equal(r.aforo, null);
  assert.deepEqual(r.alertas, ["conteo_invalido"]);
});

test("varado con «Aforo» en el sensor: dos revisiones", () => {
  const r = mapearFilaForms(fila({ novedad: "CAMARA", tipo: "Varado", tipoSensor: "Aforo", dfs: 0, aforo: 20 }));
  assert.deepEqual(r.map((x) => x.tipoNovedad), ["camara_varado", "sensor_diferencia_aforo"]);
});

test("sin tipo: cámara normal con alerta de tipo deducido", () => {
  const [r] = mapearFilaForms(fila({ novedad: "CAMARA", dfs: 10, aforo: 10 }));
  assert.equal(r.tipoNovedad, "camara_normal");
  assert.deepEqual(r.alertas, ["tipo_deducido"]);
});
