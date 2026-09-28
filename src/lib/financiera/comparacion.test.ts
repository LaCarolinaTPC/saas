import { test } from "node:test";
import assert from "node:assert/strict";
import { CONCEPTOS, compararVehiculos, detalleConceptos, filasDelCorte, resumirComparacion, type ConceptosFila, type FilaComparacion } from "./comparacion";
import { indicadores, RUBROS_CONTABLES_CERO, type VehiculoMes } from "./motor";

const CERO = Object.fromEntries(CONCEPTOS.map((c) => [c.clave, 0])) as ConceptosFila;

const fila = (periodo: string, codigo: string, ingresos: number, gastosFinancieros: number, gastosOperativos: number, tieneContable = true): FilaComparacion => ({
  periodo, codigo, placa: `${codigo}ABC`, flotas: ["EMPRESA"], marca: "CHEVROLET", propietarios: [{ cedula: "1", nombre: "Dueño" }],
  ingresos, gastosFinancieros, gastosOperativos, tieneContable, conceptos: CERO,
});

/** Igual que page.tsx: los gastos salen del motor y los conceptos de la misma fila. */
const desdeMotor = (periodo: string, codigo: string, v: VehiculoMes, tieneContable = true): FilaComparacion => {
  const i = indicadores(v);
  return {
    ...fila(periodo, codigo, v.ingresos, i.gastosOperativosTotales, i.gastosOperativosTotales - v.intereses, tieneContable),
    conceptos: Object.fromEntries(CONCEPTOS.map((c) => [c.clave, v[c.clave]])) as ConceptosFila,
  };
};

const GEMA_CERO = { fondo: 0, poliza: 0, prestamo: 0, estudio: 0, salario: 0, combustible: 0, rtica: 0, admon: 0, sitra: 0 };
const vm = (parcial: Partial<VehiculoMes>): VehiculoMes => ({ viajes: 0, timbradas: 0, ingresos: 0, ...GEMA_CERO, ...RUBROS_CONTABLES_CERO, ...parcial });

const DATOS = [
  fila("2025-01", "500", 100, 80, 70),
  fila("2025-02", "500", 200, 150, 130),
  fila("2025-02", "501", 50, 40, 35),
  fila("2026-01", "500", 150, 100, 90),
  fila("2026-02", "502", 75, 60, 55, false),
];

test("los dos cortes son libres: acumulado enero-corte y meses aislados de años distintos", () => {
  assert.deepEqual(filasDelCorte(DATOS, "acumulado", { anio: 2025, mes: 2 }).map((f) => f.codigo), ["500", "500", "501"]);
  assert.deepEqual(filasDelCorte(DATOS, "mensual", { anio: 2026, mes: 1 }).map((f) => f.codigo), ["500"]);
  assert.deepEqual(filasDelCorte(DATOS, "mensual", { anio: 2025, mes: 2 }).map((f) => f.codigo), ["500", "501"]);
});

test("resumen pondera la rentabilidad y la vista operativa excluye intereses", () => {
  const periodo = filasDelCorte(DATOS, "acumulado", { anio: 2025, mes: 2 });
  assert.deepEqual(resumirComparacion(periodo, "financiero"), {
    vehiculos: 2, registros: 3, ingresos: 350, gastos: 270, utilidad: 80, rentabilidad: 80 / 350 * 100, completo: true,
  });
  assert.equal(resumirComparacion(periodo, "operativa").utilidad, 115);
});

test("detalle une vehículos de ambos períodos y detecta ausencia y contabilidad parcial", () => {
  const base = filasDelCorte(DATOS, "mensual", { anio: 2025, mes: 2 });
  const actual = filasDelCorte(DATOS, "mensual", { anio: 2026, mes: 2 });
  const comparados = compararVehiculos(base, actual, "financiero");
  assert.deepEqual(comparados.map((v) => v.codigo), ["500", "501", "502"]);
  assert.equal(comparados[0].presente2, false);
  assert.equal(comparados[2].presente1, false);
  assert.equal(comparados[2].completo2, false);
});

test("el detalle por concepto suma exactamente los gastos del resumen, en ambas vistas", () => {
  const base = [
    desdeMotor("2026-07", "500", vm({ ingresos: 10_000_000, combustible: 3_000_000, admon: 250_000, despacho: 400_000, intereses: 500_000, repuestos: 900_000, descFondoConductor: 150_000, manoDeObra: 200_000 })),
    desdeMotor("2026-07", "501", vm({ ingresos: 8_000_000, combustible: 2_500_000, salario: 1_000_000 }), false),
  ];
  const comparacion = [
    desdeMotor("2026-08", "500", vm({ ingresos: 11_000_000, combustible: 3_200_000, admon: 275_000, despacho: 400_000, intereses: 450_000, otrosGastos: 80_000, combustibleVehiculosNuevos: 120_000 })),
  ];
  for (const vista of ["financiero", "operativa"] as const) {
    const d = detalleConceptos(base, comparacion, vista);
    assert.equal(d.total.valor1, resumirComparacion(base, vista).gastos);
    assert.equal(d.total.valor2, resumirComparacion(comparacion, vista).gastos);
    assert.equal(d.conceptos.some((c) => c.clave === "intereses"), vista === "financiero");
  }
  const d = detalleConceptos(base, comparacion, "financiero");
  const desc = d.conceptos.find((c) => c.clave === "descFondoConductor")!;
  assert.equal(desc.valor1, -150_000);
  assert.equal(desc.diferencia, 150_000);
  const combustible = d.conceptos.find((c) => c.clave === "combustible")!;
  assert.equal(combustible.valor1, 5_500_000);
  assert.equal(combustible.diferencia, -2_300_000);
  assert.equal(d.conceptos.find((c) => c.clave === "otrosGastos")!.variacion, null);
  assert.deepEqual(d.archivo1, { vehiculos: 2, conArchivo: 1 });
  assert.deepEqual(d.archivo2, { vehiculos: 1, conArchivo: 1 });
});
