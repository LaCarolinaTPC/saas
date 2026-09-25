import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLAS_DEFECTO } from "./calendario-pago";
import { armarPagos, fechaPagoPorDefecto, opcionesFechaPago, periodosQuePaganEl, rangoDe } from "./pagos-afiliados";
import type { FilaTercero } from "./liquidacion-afiliados";

const base: FilaTercero = {
  fecha: "2026-09-21", tipo_cierre: "CU (RUTAS,GRUPOS)", ruta: "R", codigo_vehiculo: "501", placa: "WGD222",
  cedula_conductor: "1", codigo_conductor: "10397", conductor_nombre: "X", cedula_propietario: "S1",
  propietario_nombre: "SEMANAL UNO", tipo_propietario: "AFILIADO", viajes: 3, timbradas: 100, timbradas_cu: 100,
  bruto: 500000, total_cartulina: 200000, cartu_admon: 128000, cartu_estudio: 4000, cartu_fondo: 500,
  cartu_poliza: 30000, cartu_presta: 67500, salario: 90000, factura: 0, incentivo_c: 1370, combustible: 100000,
  sitra: 0, rtica: 3500, admon: 12500, liquido: 62630, descuentos_otros: null,
};

test("fecha de pago por defecto: la próxima desde hoy", () => {
  const op = opcionesFechaPago(REGLAS_DEFECTO, "2026-09-25");
  assert.equal(op[0] > "2026-10-01", true); // incluye las 3 semanas siguientes
  assert.equal(fechaPagoPorDefecto(op, "2026-09-25"), "2026-09-29");
  assert.equal(fechaPagoPorDefecto(op, "2026-09-29"), "2026-09-29");
});

test("en una fecha pagan periodos distintos según el plazo", () => {
  const p = periodosQuePaganEl(REGLAS_DEFECTO, "2026-09-22");
  assert.equal(p.SEMANAL?.periodo.desde, "2026-09-14");
  assert.equal(p.DECADA?.periodo.desde, "2026-09-01"); // quincena 1-15 se paga el 22
  assert.deepEqual(rangoDe(p), { desde: "2026-09-01", hasta: "2026-09-20" });
  assert.equal(periodosQuePaganEl(REGLAS_DEFECTO, "2026-09-29").DECADA, undefined);
});

test("cada afiliado se mide en SU periodo", () => {
  const periodos = periodosQuePaganEl(REGLAS_DEFECTO, "2026-09-22");
  const filas: FilaTercero[] = [
    { ...base, fecha: "2026-09-15" }, // semanal: dentro de su semana 14-20
    { ...base, fecha: "2026-09-08" }, // semanal: fuera (otra semana)
    { ...base, fecha: "2026-09-08", cedula_propietario: "Q1", propietario_nombre: "QUINCENAL UNO", codigo_vehiculo: "552" },
    { ...base, fecha: "2026-09-18", cedula_propietario: "Q1", propietario_nombre: "QUINCENAL UNO", codigo_vehiculo: "552" }, // fuera de 1-15
  ];
  const props = new Map([
    ["S1", { codigo: "A1", plazo: "SEMANAL" as const }],
    ["Q1", { codigo: "A2", plazo: "DECADA" as const }],
  ]);
  const r = armarPagos({ periodos, filas, propietarios: props, hoy: "2026-09-25", ultimoSincronizado: "2026-09-23" });
  assert.deepEqual(r.map((x) => [x.cedula, x.plazo, x.dias, x.estado, x.incompleto]), [
    ["Q1", "DECADA", 1, "fecha_cumplida", false],
    ["S1", "SEMANAL", 1, "fecha_cumplida", false],
  ]);
  assert.equal(r[1].resumen.base, 500000);
});
