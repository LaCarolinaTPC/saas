/**
 * Pruebas del análisis de flota (Fase 5): filtros en cascada, acumulación al
 * corte, agrupación por código de vehículo y agregados ponderados.
 *
 *   npm run test:financiera
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorSemaforo,
  agruparPorVehiculo,
  aplicarFiltros,
  cobertura,
  filtrosAQuery,
  filtrosDesde,
  llaveFila,
  mantenimiento,
  opcionesFiltro,
  periodosDelFiltro,
  porMes,
  resumenFlota,
  tieneTimbradas,
  valoresVista,
  type FilaConsolidada,
  type Filtros,
  type Propietario,
} from "./analisis";
import { PARAMETROS_SEMILLA, gastosPorTimbrada, indicadores, nivelSemaforo } from "./motor";

function fila(over: Partial<FilaConsolidada> & { periodo: string; codigoVehiculo: string }): FilaConsolidada {
  return {
    propietarios: 1, cedulaPropietario: "111", propietarioNombre: "DUEÑO A", tipoPropietario: "AFILIADO",
    placa: "ABC123", modelo: "2015", vehiculoActivo: true, estadoPeriodo: "cerrado", diasConProduccion: 25,
    viajes: 80, timbradas: 6_400, ingresos: 20_000_000,
    fondo: 800_000, poliza: 400_000, prestamo: 1_000_000, estudio: 60_000, salario: 4_500_000,
    combustible: 3_200_000, rtica: 140_000, admon: 500_000, sitra: 0,
    fet: 1_200_000, valorCamb: 100_000, incentivoC: 0, valorDescuentos: 0,
    despacho: 100_000, intereses: 300_000, otrosGastos: 250_000, repuestos: 900_000, manoDeObra: 400_000, descFondoConductor: 150_000,
    combustibleVehiculosNuevos: 0, polizaVehiculosNuevos: 0,
    tieneContable: true,
    ...over,
  };
}

const F: Filtros = { anio: 2026, mes: null, flota: null, propietario: null, vehiculo: null, vista: "financiero" };

const FILAS: FilaConsolidada[] = [
  fila({ periodo: "2026-01", codigoVehiculo: "500" }),
  fila({ periodo: "2026-02", codigoVehiculo: "500" }),
  fila({ periodo: "2026-03", codigoVehiculo: "500", ingresos: 5_000_000 }), // mes en pérdida
  fila({ periodo: "2026-01", codigoVehiculo: "501", cedulaPropietario: "222", propietarioNombre: "DUEÑO B", tipoPropietario: "EMPRESA", placa: "XYZ789" }),
  fila({ periodo: "2026-02", codigoVehiculo: "501", cedulaPropietario: "222", propietarioNombre: "DUEÑO B", tipoPropietario: "EMPRESA", placa: "XYZ789", tieneContable: false, despacho: 0, intereses: 0, otrosGastos: 0, repuestos: 0, manoDeObra: 0, descFondoConductor: 0 }),
  // 502 con dos dueños en enero (la vista lo marca VARIOS / MIXTO)
  fila({ periodo: "2026-01", codigoVehiculo: "502", propietarios: 2, cedulaPropietario: null, propietarioNombre: "VARIOS", tipoPropietario: "MIXTO" }),
  fila({ periodo: "2025-12", codigoVehiculo: "500" }),
];

const OWNERS = new Map<string, Propietario[]>([
  [llaveFila("2026-01", "502"), [{ cedula: "111", nombre: "DUEÑO A", tipo: "AFILIADO" }, { cedula: "333", nombre: "DUEÑO C", tipo: "EMPRESA" }]],
]);

test("filtrosDesde(): valores válidos, inválidos y por defecto; ida y vuelta con la URL", () => {
  const f = filtrosDesde({ anio: "2026", mes: "3", flota: "AFILIADO", vista: "operativa" }, 2025);
  assert.deepEqual(f, { anio: 2026, mes: 3, flota: "AFILIADO", propietario: null, vehiculo: null, vista: "operativa" });
  const g = filtrosDesde({ anio: "abc", mes: "13", vista: "rara" }, 2025);
  assert.equal(g.anio, 2025);
  assert.equal(g.mes, null);
  assert.equal(g.vista, "financiero");
  assert.equal(filtrosAQuery({ anio: 2026, mes: 3, vista: "financiero" }), "?anio=2026&mes=3");
  assert.equal(filtrosAQuery({ anio: 2026, vista: "ambas", vehiculo: "500" }), "?anio=2026&vehiculo=500&vista=ambas");
});

test("periodosDelFiltro(): un mes acumula desde enero; sin mes, el año", () => {
  assert.deepEqual(periodosDelFiltro(2026, 3), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(periodosDelFiltro(2026, null).length, 12);
  assert.equal(periodosDelFiltro(2026, null)[11], "2026-12");
});

test("aplicarFiltros(): año, acumulado al corte, flota, propietario (incluido dueño de varios) y vehículo", () => {
  assert.equal(aplicarFiltros(FILAS, F, OWNERS).length, 6, "2025-12 queda fuera");
  assert.equal(aplicarFiltros(FILAS, { ...F, mes: 2 }, OWNERS).length, 5, "enero y febrero");
  assert.equal(aplicarFiltros(FILAS, { ...F, flota: "EMPRESA" }, OWNERS).length, 3, "501 dos meses + 502 mixto con dueño EMPRESA");
  assert.equal(aplicarFiltros(FILAS, { ...F, propietario: "333" }, OWNERS).length, 1, "dueño C solo está en el 502 compartido");
  assert.equal(aplicarFiltros(FILAS, { ...F, propietario: "111" }, OWNERS).length, 4, "dueño A: 500 ×3 + 502 compartido");
  assert.equal(aplicarFiltros(FILAS, { ...F, vehiculo: "501" }, OWNERS).length, 2);
});

test("opcionesFiltro(): cascada Año → Mes → Flota → Propietario → Vehículo", () => {
  const o = opcionesFiltro(FILAS, F, OWNERS);
  assert.deepEqual(o.meses, [1, 2, 3]);
  assert.deepEqual(o.flotas.map((x) => x.valor), ["AFILIADO", "EMPRESA"]);
  assert.deepEqual(o.propietarios.map((x) => x.valor), ["111", "222", "333"]);
  assert.deepEqual(o.vehiculos.map((x) => x.valor), ["500", "501", "502"]);

  const e = opcionesFiltro(FILAS, { ...F, flota: "EMPRESA" }, OWNERS);
  assert.deepEqual(e.propietarios.map((x) => x.valor), ["222", "333"]);
  assert.deepEqual(e.vehiculos.map((x) => x.valor), ["501", "502"]);

  const c = opcionesFiltro(FILAS, { ...F, flota: "EMPRESA", propietario: "333" }, OWNERS);
  assert.deepEqual(c.vehiculos.map((x) => x.valor), ["502"]);
  assert.equal(c.propietarios.length, 2, "el propietario elegido no recorta su propia lista");
});

test("agruparPorVehiculo(): suma meses, cuenta pérdida y contable, productividad por mes con movimiento", () => {
  const v = agruparPorVehiculo(aplicarFiltros(FILAS, F, OWNERS));
  assert.deepEqual(v.map((x) => x.codigoVehiculo), ["500", "501", "502"]);
  const v500 = v[0];
  assert.equal(v500.meses, 3);
  assert.equal(v500.ingresos, 45_000_000);
  assert.equal(v500.viajes, 240);
  assert.equal(v500.productividad, 80);
  assert.equal(v500.mesesEnPerdida, 1);
  assert.equal(v500.tieneContable, true);
  assert.equal(v500.indicadores.utilidadNeta, 45_000_000 - 3 * indicadores(FILAS[0]).gastosOperativosTotales);
  const v501 = v[1];
  assert.equal(v501.mesesConContable, 1);
  assert.equal(v501.tieneContable, false);
  assert.equal(v501.tipoPropietario, "EMPRESA");
  const v502 = v[2];
  assert.equal(v502.propietarioNombre, "VARIOS");
  assert.equal(v502.tipoPropietario, "MIXTO");
});

test("resumenFlota(): ponderado, cobertura parcial y productividad por vehículo-mes", () => {
  const filas = aplicarFiltros(FILAS, F, OWNERS);
  const r = resumenFlota(filas);
  assert.equal(r.vehiculoMes, 6);
  assert.equal(r.vehiculosDistintos, 3);
  assert.equal(r.cobertura, "parcial");
  const sumaUtil = filas.reduce((s, f) => s + indicadores(f).utilidadNeta, 0);
  const sumaIng = filas.reduce((s, f) => s + f.ingresos, 0);
  assert.ok(Math.abs(r.rentabilidad - (sumaUtil / sumaIng) * 100) < 1e-9);
  assert.equal(r.productividad, 80);
  assert.equal(cobertura(filas).conContable, 5);
  assert.equal(cobertura([]).estado, "sin_dato");
});

test("porMes(): una fila por período, ordenada", () => {
  const m = porMes(aplicarFiltros(FILAS, F, OWNERS));
  assert.deepEqual(m.map((x) => x.periodo), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(m[0].resumen.vehiculoMes, 3);
  assert.ok(m[2].resumen.utilidadNeta < 0, "marzo en pérdida");
});

test("valoresVista(): operativa quita los intereses", () => {
  const i = indicadores(FILAS[0]);
  const fin = valoresVista(i, "financiero");
  const op = valoresVista(i, "operativa");
  assert.equal(op.utilidad - fin.utilidad, 300_000);
  assert.equal(fin.gastos - op.gastos, 300_000);
  assert.ok(op.rentabilidad > fin.rentabilidad);
});

test("agruparPorSemaforo(): reparte y calcula promedio y brecha", () => {
  const v = agruparPorVehiculo(aplicarFiltros(FILAS, F, OWNERS));
  const g = agruparPorSemaforo(v, (x) => x.productividad, PARAMETROS_SEMILLA.productividad);
  assert.deepEqual(g.map((x) => x.vehiculos.length), [0, 3, 0], "80 viajes/mes es aceptable con 90/80");
  assert.equal(g[1].brecha, -10);
  assert.ok(Math.abs(g[1].porcentaje - 100) < 1e-9);
});

test("mantenimiento(): repuestos netos + mano de obra, % mano de obra, orden por total", () => {
  const v = agruparPorVehiculo(aplicarFiltros(FILAS, F, OWNERS));
  const m = mantenimiento(v);
  assert.equal(m[0].vehiculo.codigoVehiculo, "500");
  assert.equal(m[0].repuestosNetos, 3 * 750_000);
  assert.equal(m[0].manoDeObra, 3 * 400_000);
  assert.equal(m[0].total, 3 * 1_150_000);
  assert.ok(Math.abs(m[0].pctManoDeObra - (400_000 / 1_150_000) * 100) < 1e-9);
  const sin = m.find((x) => x.vehiculo.codigoVehiculo === "501")!;
  assert.equal(sin.total, 1_150_000, "solo el mes con archivo aporta");
});

test("tieneTimbradas(): un vehículo sin timbradas no se clasifica en gasto por timbrada", () => {
  // Sin timbradas el cociente vale 0 y nivelSemaforo lo pondría en excelente:
  // el 519 en 2025, siete meses sin producir y 27,7 M de gasto, salía como el mejor.
  const par = PARAMETROS_SEMILLA.gasto_timbrada;
  assert.equal(nivelSemaforo(gastosPorTimbrada(0, 27_700_000), par), "excelente", "el defecto que se evita");
  assert.equal(tieneTimbradas({ timbradas: 0 }), false);
  assert.equal(tieneTimbradas({ timbradas: 1 }), true);
});
