import { test } from "node:test";
import assert from "node:assert/strict";
import {
  excluirIndividualDuplicado, liquidar, prefijoCierre, resumenPorAfiliado, esDeAfiliado, resumenDeducciones,
  detalleObligaciones, sumar, type FilaTercero, type Montos,
} from "./liquidacion-afiliados";

// Filas reales de ingreso_tercero del vehículo 501 (propietario 91066003),
// tal como aparecen en el GAF-R-12 del 2026-09-01 al 2026-09-25.
const DIA_1: FilaTercero = {
  fecha: "2026-09-01", tipo_cierre: "CU (RUTAS,GRUPOS,PROM)", ruta: "A - 16 MIRAMAR", codigo_vehiculo: "501",
  placa: "WGD222", cedula_conductor: "8527063", codigo_conductor: "10397", conductor_nombre: "MANOTAS MARTINEZ DAVID ENRIQUE",
  cedula_propietario: "91066003", propietario_nombre: "MUÑOZ MUÑOZ HELIODORO", tipo_propietario: "AFILIADO",
  viajes: 3, timbradas: 139, timbradas_cu: 190.96, bruto: 626360, total_cartulina: 205200, cartu_admon: 128000,
  cartu_estudio: 4000, cartu_fondo: 500, cartu_poliza: 35154, cartu_presta: 72700, salario: 119125, factura: 0,
  incentivo_c: 1231, combustible: 148454, sitra: 0, rtica: 4384.5, admon: 15659, liquido: 97153,
  descuentos_otros: null,
};
// Día 13: sin operación, solo póliza, préstamo e incentivo.
const DIA_13: FilaTercero = {
  ...DIA_1, fecha: "2026-09-13", tipo_cierre: "CU (RUTAS,GRUPOS)", viajes: 0, timbradas: 0, timbradas_cu: 0, bruto: 0,
  total_cartulina: 72700, cartu_admon: 0, cartu_estudio: 0, cartu_fondo: 0, salario: 0, incentivo_c: 1370,
  combustible: 0, rtica: 0, admon: 0, liquido: -109224,
};

test("prefijo del cierre como lo imprime GEMA", () => {
  assert.equal(prefijoCierre("CU (RUTAS,GRUPOS,PROM)"), "CU/RGP");
  assert.equal(prefijoCierre("CU (RUTAS,GRUPOS)"), "CU/RG");
  assert.equal(prefijoCierre("INDIVIDUAL"), "IND");
  assert.equal(prefijoCierre(null), "—");
});

test("el cierre INDIVIDUAL duplicado de un CU se descarta", () => {
  const individual = { ...DIA_1, tipo_cierre: "INDIVIDUAL" };
  assert.equal(excluirIndividualDuplicado([DIA_1, individual]).length, 1);
  // Un INDIVIDUAL sin contraparte CU se queda.
  assert.equal(excluirIndividualDuplicado([{ ...individual, fecha: "2026-09-02" }, DIA_1]).length, 2);
});

test("resumen de deducciones: el líquido de GEMA cuadra con bruto menos deducciones", () => {
  const liq = liquidar("91066003", [DIA_13, DIA_1]);
  assert.equal(liq.vehiculos.length, 1);
  const v = liq.vehiculos[0];
  assert.deepEqual(v.filas.map((f) => f.fecha), ["2026-09-01", "2026-09-13"]);
  assert.equal(v.dias, 2);
  assert.equal(v.resumen.base, 626360);
  assert.equal(v.resumen.cartulina, 277900); // sin póliza
  assert.equal(v.resumen.poliza, 70308);
  assert.equal(v.resumen.liquido, 97153 - 109224);
  // bruto − deducciones = líquido, salvo el redondeo de rtica y admon.
  assert.ok(Math.abs(v.resumen.base - v.resumen.totalDeducciones - v.resumen.liquido) <= 1);
});

test("un propietario no ve filas de otro", () => {
  const ajena = { ...DIA_1, cedula_propietario: "999", codigo_vehiculo: "552" };
  const liq = liquidar("91066003", [DIA_1, ajena]);
  assert.deepEqual(liq.vehiculos.map((v) => v.codigo), ["501"]);
});

test("resumen por afiliado y universo del módulo", () => {
  const otro = { ...DIA_1, cedula_propietario: "123", propietario_nombre: "ABC", codigo_vehiculo: "794" };
  const r = resumenPorAfiliado([DIA_1, DIA_13, otro]);
  assert.deepEqual(r.map((x) => x.cedula), ["123", "91066003"]);
  assert.equal(r[1].dias, 2);
  const op = new Set(["501"]);
  assert.equal(esDeAfiliado(DIA_1, op), true);
  assert.equal(esDeAfiliado(otro, op), false); // vehículo EMPRESA en la operación
  assert.equal(esDeAfiliado({ ...DIA_1, tipo_propietario: "EMPRESA" }, op), false);
});

test("con descuentos otros se llega al producido neto del GAF-R-12 (vehículo 501, 1 al 25 sep 2026)", () => {
  // Totales del PDF de GEMA del propietario 91066003.
  const t: Montos = {
    ...sumar([]), bruto: 16533473, total_cartulina: 4732500, cartu_poliza: 808542, salario: 3056106,
    combustible: 3681811, rtica: 115734, admon: 413337, incentivo_c: 30815, liquido: 3694627, descuentos_otros: 1909321,
  };
  const r = resumenDeducciones(t, { conDato: 23, total: 23 });
  assert.equal(r.obligaciones, 1909321);
  assert.equal(r.totalDeducciones, 14748166); // "TOTAL DEDUCCIONES" del PDF
  assert.equal(r.producidoNeto, 1785307); // "PRODUCIDO NETO" del PDF
  assert.equal(r.obligacionesParciales, false);
  // Sin ningún día con dato no hay obligaciones ni producido neto.
  const sin = resumenDeducciones({ ...t, descuentos_otros: 0 }, { conDato: 0, total: 23 });
  assert.equal(sin.obligaciones, null);
  assert.equal(sin.producidoNeto, null);
  assert.equal(sin.totalDeducciones, 14748166 - 1909321);
  assert.equal(resumenDeducciones(t, { conDato: 5, total: 23 }).obligacionesParciales, true);
});

test("detalle de descuentos otros por día y cobertura en la liquidación", () => {
  const conPago = { ...DIA_1, fecha: "2026-09-06", descuentos_otros: 510445 };
  assert.deepEqual(detalleObligaciones([DIA_1, conPago, { ...conPago, ruta: "otra", descuentos_otros: 5 }]), [{ fecha: "2026-09-06", valor: 510450 }]);
  const liq = liquidar("91066003", [{ ...DIA_1, descuentos_otros: 0 }, conPago]);
  assert.equal(liq.resumen.obligaciones, 510445);
  assert.equal(liq.resumen.producidoNeto, liq.resumen.base - liq.resumen.totalDeducciones);
  assert.equal(liquidar("91066003", [DIA_1]).resumen.producidoNeto, null);
});
