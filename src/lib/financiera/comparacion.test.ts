import { test } from "node:test";
import assert from "node:assert/strict";
import { compararVehiculos, filasDelCorte, resumirComparacion, type FilaComparacion } from "./comparacion";

const fila = (periodo: string, codigo: string, ingresos: number, gastosFinancieros: number, gastosOperativos: number, tieneContable = true): FilaComparacion => ({
  periodo, codigo, placa: `${codigo}ABC`, flotas: ["EMPRESA"], marca: "CHEVROLET", propietarios: [{ cedula: "1", nombre: "Dueño" }],
  ingresos, gastosFinancieros, gastosOperativos, tieneContable,
});

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
