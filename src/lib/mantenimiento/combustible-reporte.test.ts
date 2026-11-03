import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResumenArchivo } from "./combustible-data";
import { armarReporteCarga, celdaCsv, reporteCsv, reporteMarkdown, textoGema } from "./combustible-reporte";

const archivo = (over: Partial<ResumenArchivo> = {}): ResumenArchivo => ({
  archivo: "COMBUSTIBLE 01-10-2026.xlsx",
  fechaNombre: "2026-10-01",
  errorArchivo: null,
  filasArchivo: 3,
  resumen: { tanqueos: 3, galones: 60.5, valor: 1000000, buses: 2, desde: "2026-10-01", hasta: "2026-10-01", alertas: { placa_distinta: 1 } },
  nuevas: 2,
  corregidas: 1,
  sinCambio: 0,
  enOtroArchivo: 0,
  enOtroArchivoDistinto: 0,
  fueraDeRango: 0,
  rechazadas: [{ hoja: "Hoja1", linea: 7, factura: "F-9", motivo: "sin galones" }],
  rechazadasTotal: 1,
  avisos: [],
  cambios: [{ fecha: "2026-10-01", hora: "05:10:00", vehiculo: "500", factura: "F-1", antes: { galones: 20, valor: 300000 }, despues: { galones: 21.5, valor: 320000 } }],
  conciliacion: null,
  ...over,
});

test("el resumen suma lo que se escribirá y omite las tablas vacías", () => {
  const r = armarReporteCarga([archivo(), archivo({ archivo: "malo.xlsx", errorArchivo: "No se pudo leer el Excel" })], "03/11/2026 10:00");
  assert.equal(r.resumen[0], "Se escribirán 3 tanqueos");
  assert.match(r.contexto[0], /2 archivo\(s\), 1 rechazado\(s\) entero\(s\)/);
  assert.deepEqual(r.tablas.map((t) => t.titulo), ["Resumen por archivo", "Alertas", "Tanqueos que cambian", "Filas rechazadas"]);
  assert.equal(r.tablas[0].filas[1][1], "Rechazado entero");
  assert.equal(r.archivo, "reporte_carga_combustible_2026-10-01");
});

test("avisa cuando la previsualización recortó las listas", () => {
  const r = armarReporteCarga([archivo({ rechazadasTotal: 80, corregidas: 60 })], "x");
  assert.ok(r.notas.some((n) => n.includes("se listan 1 de 80 filas rechazadas")));
  assert.ok(r.notas.some((n) => n.includes("se listan 1 de 60 tanqueos que cambian")));
});

test("Markdown: tablas con números alineados a la derecha y barras escapadas", () => {
  const md = reporteMarkdown(armarReporteCarga([archivo({ avisos: ["placa A|B"] })], "x"));
  assert.match(md, /^# Reporte de carga de combustible/);
  assert.match(md, /\| Archivo \| Días \| Tanqueos \| Buses \| Galones \| Valor \|/);
  assert.match(md, /\| --- \| --- \| ---: \| ---: \|/);
  assert.match(md, /placa A\\\|B/);
  assert.match(md, /\| 21,500 \| \$ 320\.000 \|/);
});

test("CSV: números sin miles y con coma decimal", () => {
  assert.equal(celdaCsv(21.5, "galones"), "21,500");
  assert.equal(celdaCsv(1234567.4, "pesos"), "1234567");
  assert.equal(celdaCsv(null, "pesos"), "");
  const filas = reporteCsv(armarReporteCarga([archivo()], "x"));
  const i = filas.findIndex((f) => f[0] === "Resumen por archivo");
  assert.deepEqual(filas[i + 2].slice(2, 6), ["3", "2", "60,500", "1000000"]);
});

test("texto del cruce con GEMA", () => {
  assert.equal(textoGema(null), "Sin cruce");
  assert.equal(
    textoGema({ estado: "diferencias", diasSinLiquidar: [], diasComparados: ["2026-10-01"], petromil: 100, gema: 50, diferencia: -50, busesDia: 4, cuadran: 3, porCausa: {}, diferencias: [] }),
    "Diferencia $ -50 · 1 de 4 buses-día",
  );
});
