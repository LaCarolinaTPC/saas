/**
 * Pruebas del motor de Financiera (Fase 2 del plan).
 *
 *   npm run test:financiera
 *
 * El oráculo es la transcripción LITERAL de `parseExcelToFleetRecords`
 * (excelParser.ts) y de las utilidades de vista de `fleetUtils.ts` del
 * aplicativo de Lovable, no cifras inventadas. El motor llega al mismo
 * resultado por otro camino (rubros de GEMA y contables separados), así que
 * la comparación no es tautológica. Casos borde de la sección 12 del plan:
 * ingresos 0, timbradas 0, Desc. Fondo-conductor mayor que Repuestos.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARAMETROS_SEMILLA,
  RUBROS_CONTABLES_CERO,
  aDosDecimales,
  aPesos,
  consolidarDias,
  costosPorVista,
  cuadra,
  debeCerrarse,
  esPeriodoValido,
  gastoTimbradaPorVista,
  gruposSemaforo,
  indicadores,
  kpisFlota,
  nivelSemaforo,
  normalizarFlota,
  parametroValido,
  rentabilidadPorVista,
  ultimoDiaDelPeriodo,
  utilidadPorVista,
  vehiculoMesDesde,
  type FilaDiaria,
  type VehiculoMes,
} from "./motor";

const EPS = 1e-9;

// ── Oráculo: excelParser.ts, letra por letra ─────────────────────────────────

interface FilaExcel {
  Ingresos: number; "TIM.": number; VIAJES: number;
  DESPACHO: number; FONDO: number; POLIZA: number; "PRESTA.": number; SALARIO: number;
  INTERESES: number; "ESTUD.": number; SITRA: number; COMBS: number; RTICA: number;
  ADMON: number; "OTROS GASTOS": number; Repuestos: number; "Mano de Obra": number;
  "Desc. Fondo - conductor": number;
}

function oraculoExcel(row: FilaExcel) {
  const despacho = Number(row["DESPACHO"]) || 0;
  const fondo = Number(row["FONDO"]) || 0;
  const poliza = Number(row["POLIZA"]) || 0;
  const prestamo = Number(row["PRESTA."]) || 0;
  const salario = Number(row["SALARIO"]) || 0;
  const intereses = Number(row["INTERESES"]) || 0;
  const estudio = Number(row["ESTUD."]) || 0;
  const sitra = Number(row["SITRA"]) || 0;
  const combustible = Number(row["COMBS"]) || 0;
  const rtica = Number(row["RTICA"]) || 0;
  const admon = Number(row["ADMON"]) || 0;
  const otrosGastos = Number(row["OTROS GASTOS"]) || 0;
  const repuestos = Number(row["Repuestos"]) || 0;
  const manoDeObra = Number(row["Mano de Obra"]) || 0;
  const descFondoConductor = Number(row["Desc. Fondo - conductor"]) || 0;
  const ingresos = Number(row["Ingresos"]) || 0;
  const timbradas = Number(row["TIM."]) || 0;

  const repuestosNetos = repuestos - descFondoConductor;
  const gastosOperativosTotales =
    despacho + fondo + poliza + prestamo + salario + intereses +
    estudio + sitra + combustible + rtica + admon + otrosGastos +
    repuestosNetos + manoDeObra;
  const utilidadNeta = ingresos - gastosOperativosTotales;
  const rentabilidad = ingresos > 0 ? (utilidadNeta / ingresos) * 100 : 0;
  const gastosPorTimbrada = timbradas > 0 ? gastosOperativosTotales / timbradas : 0;
  return { gastosOperativosTotales, utilidadNeta, rentabilidad, gastosPorTimbrada, intereses, ingresos, timbradas };
}

/** fleetUtils.ts: la vista operativa quita los intereses. */
function oraculoVistas(r: { ingresos: number; intereses: number; gastosOperativosTotales: number; timbradas: number }) {
  const costosSinFinanciero = r.gastosOperativosTotales - r.intereses;
  const utilidadOperativa = r.ingresos - costosSinFinanciero;
  return {
    costosSinFinanciero,
    utilidadOperativa,
    rentabilidadOperativa: r.ingresos > 0 ? (utilidadOperativa / r.ingresos) * 100 : 0,
    rentabilidadFinanciera: r.ingresos > 0 ? ((r.ingresos - r.gastosOperativosTotales) / r.ingresos) * 100 : 0,
    gastoTimbradaOperativo: r.timbradas > 0 ? costosSinFinanciero / r.timbradas : 0,
  };
}

function aVehiculoMes(row: FilaExcel): VehiculoMes {
  return {
    ingresos: row.Ingresos, timbradas: row["TIM."], viajes: row.VIAJES,
    fondo: row.FONDO, poliza: row.POLIZA, prestamo: row["PRESTA."], estudio: row["ESTUD."],
    salario: row.SALARIO, combustible: row.COMBS, rtica: row.RTICA, admon: row.ADMON, sitra: row.SITRA,
    despacho: row.DESPACHO, intereses: row.INTERESES, otrosGastos: row["OTROS GASTOS"],
    repuestos: row.Repuestos, manoDeObra: row["Mano de Obra"], descFondoConductor: row["Desc. Fondo - conductor"],
    // El Excel del aplicativo no tenia estos conceptos: el oraculo se compara
    // con ellos en cero, que es justo lo que debe pasar para no alterarlo.
    combustibleVehiculosNuevos: 0, polizaVehiculosNuevos: 0,
  };
}

// Generador determinista (LCG) para 200 filas con cifras del orden real:
// bruto ~ 20 M por bus-mes, timbradas ~ 6.400, viajes ~ 80.
function* filasAleatorias(semilla: number, cantidad: number): Generator<FilaExcel> {
  let s = semilla >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const entre = (a: number, b: number) => Math.round(a + (b - a) * rnd());
  for (let i = 0; i < cantidad; i++) {
    yield {
      Ingresos: entre(8_000_000, 32_000_000), "TIM.": entre(2_500, 10_500), VIAJES: entre(40, 110),
      DESPACHO: entre(0, 400_000), FONDO: entre(0, 1_500_000), POLIZA: entre(0, 900_000),
      "PRESTA.": entre(0, 2_000_000), SALARIO: entre(3_000_000, 6_500_000), INTERESES: entre(0, 600_000),
      "ESTUD.": entre(0, 120_000), SITRA: 0, COMBS: entre(1_500_000, 5_000_000), RTICA: entre(50_000, 230_000),
      ADMON: entre(200_000, 800_000), "OTROS GASTOS": entre(0, 700_000), Repuestos: entre(0, 2_500_000),
      "Mano de Obra": entre(0, 1_200_000), "Desc. Fondo - conductor": entre(0, 400_000),
    };
  }
}

test("indicadores(): 200 filas coinciden con excelParser.ts y fleetUtils.ts", () => {
  let n = 0;
  for (const row of filasAleatorias(20260921, 200)) {
    const esperado = oraculoExcel(row);
    const vistas = oraculoVistas(esperado);
    const i = indicadores(aVehiculoMes(row));
    assert.ok(Math.abs(i.gastosOperativosTotales - esperado.gastosOperativosTotales) < EPS, `gastos fila ${n}`);
    assert.ok(Math.abs(i.utilidadNeta - esperado.utilidadNeta) < EPS, `utilidad fila ${n}`);
    assert.ok(Math.abs(i.rentabilidad - esperado.rentabilidad) < EPS, `rentabilidad fila ${n}`);
    assert.ok(Math.abs(i.gastosPorTimbrada - esperado.gastosPorTimbrada) < EPS, `gasto/tim fila ${n}`);
    assert.ok(Math.abs(i.utilidadOperativa - vistas.utilidadOperativa) < EPS, `utilidad operativa fila ${n}`);
    assert.ok(Math.abs(i.rentabilidadOperativa - vistas.rentabilidadOperativa) < EPS, `rent. operativa fila ${n}`);
    assert.ok(Math.abs(i.gastosPorTimbradaOperativo - vistas.gastoTimbradaOperativo) < EPS, `gasto/tim operativo fila ${n}`);
    assert.ok(Math.abs(costosPorVista(i, "operativa") - vistas.costosSinFinanciero) < EPS);
    assert.ok(Math.abs(costosPorVista(i, "financiero") - esperado.gastosOperativosTotales) < EPS);
    assert.ok(Math.abs(utilidadPorVista(i, "ambas") - vistas.utilidadOperativa) < EPS, "'ambas' usa la operativa");
    assert.ok(Math.abs(rentabilidadPorVista(i, "financiero") - vistas.rentabilidadFinanciera) < EPS);
    assert.ok(Math.abs(gastoTimbradaPorVista(i, "operativa") - vistas.gastoTimbradaOperativo) < EPS);
    n++;
  }
  assert.equal(n, 200);
});

const FILA_BASE: FilaExcel = {
  Ingresos: 20_000_000, "TIM.": 6_400, VIAJES: 80,
  DESPACHO: 100_000, FONDO: 800_000, POLIZA: 400_000, "PRESTA.": 1_000_000, SALARIO: 4_500_000,
  INTERESES: 300_000, "ESTUD.": 60_000, SITRA: 0, COMBS: 3_200_000, RTICA: 140_000,
  ADMON: 500_000, "OTROS GASTOS": 250_000, Repuestos: 900_000, "Mano de Obra": 400_000,
  "Desc. Fondo - conductor": 150_000,
};

test("desc. fondo-conductor se resta de repuestos, no se suma", () => {
  const sin = indicadores(aVehiculoMes({ ...FILA_BASE, "Desc. Fondo - conductor": 0 }));
  const con = indicadores(aVehiculoMes(FILA_BASE));
  assert.equal(sin.gastosOperativosTotales - con.gastosOperativosTotales, 150_000);
  assert.equal(con.repuestosNetos, 750_000);
});

test("borde: desc. fondo-conductor mayor que repuestos da repuestos netos negativos y baja el gasto", () => {
  const v = aVehiculoMes({ ...FILA_BASE, Repuestos: 100_000, "Desc. Fondo - conductor": 250_000 });
  const i = indicadores(v);
  assert.equal(i.repuestosNetos, -150_000);
  assert.ok(Math.abs(i.gastosOperativosTotales - oraculoExcel({ ...FILA_BASE, Repuestos: 100_000, "Desc. Fondo - conductor": 250_000 }).gastosOperativosTotales) < EPS);
});

test("borde: ingresos 0 → rentabilidad 0 (no división por cero), utilidad negativa", () => {
  const i = indicadores(aVehiculoMes({ ...FILA_BASE, Ingresos: 0 }));
  assert.equal(i.rentabilidad, 0);
  assert.equal(i.rentabilidadOperativa, 0);
  assert.ok(i.utilidadNeta < 0);
  assert.ok(Number.isFinite(i.rentabilidad));
});

test("borde: timbradas 0 → gasto por timbrada 0", () => {
  const i = indicadores(aVehiculoMes({ ...FILA_BASE, "TIM.": 0 }));
  assert.equal(i.gastosPorTimbrada, 0);
  assert.equal(i.gastosPorTimbradaOperativo, 0);
});

test("sin rubros contables la utilidad es un techo: gastos = solo GEMA", () => {
  const v: VehiculoMes = { ...aVehiculoMes(FILA_BASE), ...RUBROS_CONTABLES_CERO };
  const i = indicadores(v);
  assert.equal(i.gastosContables, 0);
  assert.equal(i.gastosOperativosTotales, i.gastosGema);
  assert.ok(i.utilidadNeta > indicadores(aVehiculoMes(FILA_BASE)).utilidadNeta);
});

// ── KPIs de flota: ponderado, no promedio de columna ─────────────────────────

test("kpisFlota(): rentabilidad ponderada Σutilidad/Σingresos, distinta del promedio simple", () => {
  const a = aVehiculoMes({ ...FILA_BASE, Ingresos: 40_000_000 });          // grande y rentable
  const b = aVehiculoMes({ ...FILA_BASE, Ingresos: 12_000_000 });          // chico y en pérdida
  const ia = indicadores(a);
  const ib = indicadores(b);
  const k = kpisFlota([{ ...a, tieneContable: true }, { ...b, tieneContable: true }]);
  const ponderada = ((ia.utilidadNeta + ib.utilidadNeta) / (a.ingresos + b.ingresos)) * 100;
  const simple = (ia.rentabilidad + ib.rentabilidad) / 2;
  assert.ok(Math.abs(k.rentabilidad - ponderada) < EPS);
  assert.ok(Math.abs(k.rentabilidad - simple) > 0.5, "si coincidieran, la prueba no distinguiría nada");
  assert.ok(Math.abs(k.gastosPorTimbrada - (ia.gastosOperativosTotales + ib.gastosOperativosTotales) / (a.timbradas + b.timbradas)) < EPS);
  assert.equal(k.vehiculos, 2);
  assert.equal(k.productividad, (a.viajes + b.viajes) / 2);
  assert.equal(k.cobertura, "completo");
});

test("kpisFlota(): cobertura parcial / sin_dato y flota vacía", () => {
  const a = aVehiculoMes(FILA_BASE);
  assert.equal(kpisFlota([{ ...a, tieneContable: true }, { ...a, tieneContable: false }]).cobertura, "parcial");
  assert.equal(kpisFlota([{ ...a, tieneContable: false }]).cobertura, "sin_dato");
  const vacia = kpisFlota([]);
  assert.equal(vacia.vehiculos, 0);
  assert.equal(vacia.rentabilidad, 0);
  assert.equal(vacia.gastosPorTimbrada, 0);
  assert.equal(vacia.productividad, 0);
  assert.equal(vacia.cobertura, "sin_dato");
});

// ── Semáforos: mismas comparaciones inclusivas de fleetUtils.ts ──────────────

test("nivelSemaforo(): rentabilidad 15/5", () => {
  const p = PARAMETROS_SEMILLA.rentabilidad;
  assert.equal(nivelSemaforo(15, p), "excelente");
  assert.equal(nivelSemaforo(14.99, p), "aceptable");
  assert.equal(nivelSemaforo(5, p), "aceptable");
  assert.equal(nivelSemaforo(4.99, p), "critico");
  assert.equal(nivelSemaforo(-20, p), "critico");
});

test("nivelSemaforo(): gasto por timbrada 2500/3200 (menor es mejor)", () => {
  const p = PARAMETROS_SEMILLA.gasto_timbrada;
  assert.equal(nivelSemaforo(2500, p), "excelente");
  assert.equal(nivelSemaforo(2500.01, p), "aceptable");
  assert.equal(nivelSemaforo(3200, p), "aceptable");
  assert.equal(nivelSemaforo(3200.01, p), "critico");
  assert.equal(nivelSemaforo(0, p), "excelente", "gasto 0 (sin timbradas) sale verde, como en el aplicativo");
});

test("nivelSemaforo(): productividad 90/80", () => {
  const p = PARAMETROS_SEMILLA.productividad;
  assert.equal(nivelSemaforo(90, p), "excelente");
  assert.equal(nivelSemaforo(89, p), "aceptable");
  assert.equal(nivelSemaforo(80, p), "aceptable");
  assert.equal(nivelSemaforo(79, p), "critico");
});

test("parametroValido(): rechaza umbrales que contradicen la dirección", () => {
  assert.ok(parametroValido(PARAMETROS_SEMILLA.rentabilidad));
  assert.ok(parametroValido(PARAMETROS_SEMILLA.gasto_timbrada));
  assert.ok(!parametroValido({ ...PARAMETROS_SEMILLA.rentabilidad, umbralExcelente: 5, umbralAceptable: 15 }));
  assert.ok(!parametroValido({ ...PARAMETROS_SEMILLA.gasto_timbrada, umbralExcelente: 3200, umbralAceptable: 2500 }));
  assert.ok(!parametroValido({ ...PARAMETROS_SEMILLA.rentabilidad, umbralExcelente: NaN }));
});

test("gruposSemaforo(): cantidad, porcentaje, promedio simple y brecha como calculateKPIGroups", () => {
  const p = PARAMETROS_SEMILLA.productividad;
  const g = gruposSemaforo([95, 100, 85, 70, 60], p);
  assert.deepEqual(g.map((x) => x.cantidad), [2, 1, 2]);
  assert.deepEqual(g.map((x) => Math.round(x.porcentaje)), [40, 20, 40]);
  assert.equal(g[0].promedio, 97.5);
  assert.equal(g[0].brecha, 7.5);
  assert.equal(g[2].promedio, 65);
  assert.equal(g[2].brecha, -25);
  assert.equal(g[1].objetivo, 90);
  const vacio = gruposSemaforo([], p);
  assert.deepEqual(vacio.map((x) => x.porcentaje), [0, 0, 0]);
});

// ── Consolidación día → mes ──────────────────────────────────────────────────

function dia(over: Partial<FilaDiaria>): FilaDiaria {
  return {
    fecha: "2026-03-01", codigo_vehiculo: "500", cedula_propietario: "111", propietario_nombre: "DUEÑO A",
    tipo_propietario: "AFILIADO", placa: "ABC123",
    viajes: 4, timbradas: 300, bruto: 1_000_000,
    cartu_fondo: 40_000, cartu_poliza: 20_000, cartu_presta: 50_000, cartu_estudio: 3_000,
    salario: 200_000, combustible: 150_000, rtica: 7_000, admon: 25_000, sitra: 0,
    fet: 60_000, valor_camb: 5_000, incentivo_c: 0, valor_descuentos: 0,
    ...over,
  };
}

test("consolidarDias(): suma por mes, ingresos = bruto, admon = admon (no cartu_admon), días distintos", () => {
  const filas = [
    dia({ fecha: "2026-03-01" }),
    dia({ fecha: "2026-03-01", timbradas: 100, bruto: 300_000 }), // dos filas el mismo día (dos rutas)
    dia({ fecha: "2026-03-02" }),
    dia({ fecha: "2026-03-03", viajes: null, bruto: null }),         // nulos = 0
  ];
  const [m] = consolidarDias(filas);
  assert.equal(m.periodo, "2026-03");
  assert.equal(m.codigoVehiculo, "500");
  assert.equal(m.cedulaPropietario, "111");
  assert.equal(m.viajes, 12);
  assert.equal(m.timbradas, 1_000);
  assert.equal(m.ingresos, 2_300_000);
  assert.equal(m.admon, 100_000);
  assert.equal(m.fondo, 160_000);
  assert.equal(m.diasConProduccion, 3);
  assert.equal(m.filasOrigen, 4);
  assert.equal(m.placaCambio, false);
  assert.equal(m.fet, 240_000, "informativo: se conserva pero no entra en la utilidad");
});

test("consolidarDias(): un bus con dos dueños en el mes da dos filas, cada una con sus días", () => {
  const filas = [
    dia({ fecha: "2026-03-05", cedula_propietario: "111", propietario_nombre: "DUEÑO A" }),
    dia({ fecha: "2026-03-20", cedula_propietario: "222", propietario_nombre: "DUEÑO B", tipo_propietario: "EMPRESA", bruto: 2_000_000 }),
    dia({ fecha: "2026-03-21", cedula_propietario: "222", propietario_nombre: "DUEÑO B", tipo_propietario: "EMPRESA", bruto: 2_000_000 }),
  ];
  const ms = consolidarDias(filas);
  assert.equal(ms.length, 2);
  const a = ms.find((m) => m.cedulaPropietario === "111")!;
  const b = ms.find((m) => m.cedulaPropietario === "222")!;
  assert.equal(a.ingresos, 1_000_000);
  assert.equal(a.diasConProduccion, 1);
  assert.equal(b.ingresos, 4_000_000);
  assert.equal(b.diasConProduccion, 2);
  assert.equal(b.tipoPropietario, "EMPRESA");

  // Al nivel del vehículo-mes se suman los dueños y la contable es del vehículo.
  const v = vehiculoMesDesde(ms, { ...RUBROS_CONTABLES_CERO, repuestos: 500_000 });
  assert.equal(v.ingresos, 5_000_000);
  assert.equal(v.propietarios, 2);
  assert.equal(v.tieneContable, true);
  assert.equal(v.repuestos, 500_000, "no se prorratea entre dueños");
  const sinContable = vehiculoMesDesde(ms, null);
  assert.equal(sinContable.tieneContable, false);
  assert.equal(sinContable.repuestos, 0);
});

test("consolidarDias(): placa del último día y marca de cambio; sin vehículo se descarta; meses separados", () => {
  const filas = [
    dia({ fecha: "2026-03-10", placa: "OLD001" }),
    dia({ fecha: "2026-03-25", placa: "NEW002" }),
    dia({ fecha: "2026-04-01", placa: "NEW002" }),
    dia({ fecha: "2026-03-12", codigo_vehiculo: null }),
    dia({ fecha: "2026-03-12", codigo_vehiculo: "" }),
  ];
  const ms = consolidarDias(filas);
  assert.equal(ms.length, 2);
  assert.equal(ms[0].periodo, "2026-03");
  assert.equal(ms[0].placa, "NEW002");
  assert.equal(ms[0].placaCambio, true);
  assert.equal(ms[1].periodo, "2026-04");
  assert.equal(ms[1].placaCambio, false);
});

test("consolidarDias(): propietario sin cédula cae en '' y no se pierde", () => {
  const [m] = consolidarDias([dia({ cedula_propietario: null })]);
  assert.equal(m.cedulaPropietario, "");
  assert.equal(m.ingresos, 1_000_000);
});

test("consolidarDias(): idempotente — dos veces las mismas filas, el mismo resultado", () => {
  const filas = [dia({ fecha: "2026-03-01" }), dia({ fecha: "2026-03-02" })];
  assert.deepEqual(consolidarDias(filas), consolidarDias([...filas]));
});

// ── Cierre por GEMA ──────────────────────────────────────────────────────────

test("ultimoDiaDelPeriodo(): febrero bisiesto, diciembre y meses de 30", () => {
  assert.equal(ultimoDiaDelPeriodo("2028-02"), "2028-02-29");
  assert.equal(ultimoDiaDelPeriodo("2026-02"), "2026-02-28");
  assert.equal(ultimoDiaDelPeriodo("2026-12"), "2026-12-31");
  assert.equal(ultimoDiaDelPeriodo("2026-09"), "2026-09-30");
});

test("debeCerrarse(): con el marcador en 2026-09-16, agosto cierra y septiembre no", () => {
  assert.equal(debeCerrarse("2026-08", "abierto", "2026-09-16"), true);
  assert.equal(debeCerrarse("2026-09", "abierto", "2026-09-16"), false);
  assert.equal(debeCerrarse("2026-08", "reabierto", "2026-09-16"), true, "reabierto vuelve a cerrar cuando GEMA lo pasó");
  assert.equal(debeCerrarse("2026-08", "cerrado", "2026-09-16"), false);
  assert.equal(debeCerrarse("2026-08", "abierto", null), false);
  assert.equal(debeCerrarse("2026-09", "abierto", "2026-09-30"), true, "el último día inclusive");
});

test("esPeriodoValido()", () => {
  assert.ok(esPeriodoValido("2026-01"));
  assert.ok(esPeriodoValido("2026-12"));
  assert.ok(!esPeriodoValido("2026-13"));
  assert.ok(!esPeriodoValido("2026-00"));
  assert.ok(!esPeriodoValido("2026-1"));
  assert.ok(!esPeriodoValido("202601"));
});

// ── Redondeo y cotejo (acta, punto 8) ────────────────────────────────────────

test("aPesos / aDosDecimales / cuadra", () => {
  assert.equal(aPesos(20_827.7), 20_828);
  assert.equal(aPesos(-1.5), -1);
  assert.equal(aDosDecimales(5_831.8349), 5_831.83);
  assert.ok(cuadra(100, 101));
  assert.ok(cuadra(100, 99));
  assert.ok(!cuadra(100, 101.01));
  assert.ok(cuadra(12.345, 12.35, 0.01));
});

test("los conceptos de vehiculos nuevos suman al gasto operativo, no al financiero", () => {
  const base = aVehiculoMes(FILA_BASE);
  const con = { ...base, combustibleVehiculosNuevos: 500_000, polizaVehiculosNuevos: 120_000 };
  const a = indicadores(base);
  const b = indicadores(con);
  assert.equal(b.gastosContables - a.gastosContables, 620_000);
  assert.equal(b.gastosOperativosTotales - a.gastosOperativosTotales, 620_000);
  assert.equal(a.utilidadNeta - b.utilidadNeta, 620_000);
  // No son financieros: tambien restan en la vista operativa.
  assert.equal(a.utilidadOperativa - b.utilidadOperativa, 620_000);
  assert.equal(b.intereses, a.intereses, "los intereses no se tocan");
});

test("normalizarFlota(): igual que fleetUtils.ts", () => {
  assert.equal(normalizarFlota("Afiliados"), "AFILIADO");
  assert.equal(normalizarFlota("propia"), "EMPRESA");
  assert.equal(normalizarFlota("Empresa"), "EMPRESA");
  assert.equal(normalizarFlota("otra"), "OTRA");
  assert.equal(normalizarFlota(null), "");
});
