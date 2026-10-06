import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  construirExcelConductores, diasLaborados, fechaExcel, filasExport, nombreMes, resumenPorCausa, resumenPorMes,
} from "./retiros-excel";
import type { RetiroRegistrado } from "./retiro";

const base = { codigo: "101", tipo_conductor: "CONDUCTOR", celular: null, correo: null };
const CONDUCTORES = [
  { ...base, cedula: "1", nombre: "ANA", estado: "RETIRADO", fecha_ingreso: "2025-01-10", fecha_retiro: "2026-08-10" },
  { ...base, cedula: "2", nombre: "LUIS", estado: "RETIRADO", fecha_ingreso: "2026-07-01", fecha_retiro: "2026-07-31" },
  { ...base, cedula: "3", nombre: "EVA", estado: "RETIRADO", fecha_ingreso: null, fecha_retiro: "2026-09-01" },
  { ...base, cedula: "4", nombre: "JUAN", estado: "ACTIVO", fecha_ingreso: "2024-03-01", fecha_retiro: null },
];
const retiro = (cedula: string, causa: string, nota: string | null = null): RetiroRegistrado => ({
  cedula, fechaRetiro: null, causa, nota, registradoPor: "rrhh@x.co", registradoAt: "2026-09-02T15:00:00Z",
  actualizadoPor: null, actualizadoAt: "2026-09-02T15:00:00Z",
});
const RETIROS: Record<string, RetiroRegistrado> = {
  "1": retiro("1", "MEJOR_OFERTA", "Se fue a otra empresa"),
  "2": retiro("2", "PERIODO_PRUEBA"),
};

test("la fecha de Excel no se corre un día", () => {
  assert.equal(fechaExcel("2026-08-10")?.toISOString(), "2026-08-10T00:00:00.000Z");
  assert.equal(fechaExcel(null), null);
  assert.equal(fechaExcel("basura"), null);
});

test("días laborados entre ingreso y retiro", () => {
  assert.equal(diasLaborados("2026-07-01", "2026-07-31"), 30);
  assert.equal(diasLaborados(null, "2026-07-31"), null);
  assert.equal(diasLaborados("2026-08-01", "2026-07-31"), null);
});

test("filas con causa, tipo y nota; los activos sin datos de retiro", () => {
  const filas = filasExport(CONDUCTORES, (c) => RETIROS[c.cedula] ?? null);
  assert.equal(filas[0].causa, "Mejor oferta laboral");
  assert.equal(filas[0].tipoCausa, "Decisión del conductor");
  assert.equal(filas[0].nota, "Se fue a otra empresa");
  assert.equal(filas[0].registradoPor, "rrhh@x.co");
  assert.equal(filas[1].tipoCausa, "Decisión de la empresa");
  assert.equal(filas[1].diasLaborados, 30);
  assert.equal(filas[2].causa, "Sin registrar");
  assert.equal(filas[2].diasLaborados, null);
  assert.equal(filas[3].causa, "");
  assert.equal(filas[3].fechaRetiro, null);
});

test("resumen por causa deja «Sin registrar» al final", () => {
  const r = resumenPorCausa(filasExport(CONDUCTORES, (c) => RETIROS[c.cedula] ?? null));
  assert.equal(r.length, 3);
  assert.equal(r.at(-1)?.causa, "Sin registrar");
  assert.equal(r.reduce((s, x) => s + x.cantidad, 0), 3);
});

test("el libro trae el listado con fechas reales y el resumen", async () => {
  const filas = filasExport(CONDUCTORES, (c) => RETIROS[c.cedula] ?? null);
  const blob = await construirExcelConductores(filas, ["Estado RETIRADO"]);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await blob.arrayBuffer());
  const hoja = libro.getWorksheet("Conductores")!;
  assert.equal(hoja.getCell("A3").value, "Filtros: Estado RETIRADO");
  assert.equal(hoja.getCell("A4").value, "Nombre");
  assert.equal(hoja.getCell("A5").value, "ANA");
  const fecha = hoja.getCell("I5").value as Date;
  assert.ok(fecha instanceof Date);
  assert.equal(fecha.toISOString().slice(0, 10), "2026-08-10");
  assert.equal(hoja.getCell("J5").value, "agosto 2026");
  assert.equal(hoja.getCell("M5").value, "Mejor oferta laboral");
  const meses = libro.getWorksheet("Retiros por mes")!;
  assert.equal(meses.getCell("A2").value, "septiembre 2026");
  const resumen = libro.getWorksheet("Resumen por causa")!;
  assert.equal(resumen.getCell("B2").value, "Mejor oferta laboral");
});

test("nombre del mes de retiro", () => {
  assert.equal(nombreMes("2026-08"), "agosto 2026");
  assert.equal(nombreMes("Sin fecha"), "Sin fecha");
});

test("retiros por mes, abiertos por tipo de causa", () => {
  const r = resumenPorMes(filasExport(CONDUCTORES, (c) => RETIROS[c.cedula] ?? null));
  assert.deepEqual(r.map((x) => x.mes), ["2026-09", "2026-08", "2026-07"]);
  assert.equal(r[0].sinCausa, 1);
  assert.equal(r[1].voluntario, 1);
  assert.equal(r[2].empresa, 1);
});
