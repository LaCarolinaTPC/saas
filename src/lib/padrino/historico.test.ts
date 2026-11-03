import { test } from "node:test";
import assert from "node:assert/strict";
import { leerTablaHistorico, resumenLectura, tablaDeCsv, textoCelda } from "./historico";

test("lee el Excel de Nómina: encabezado después de un título, cédulas con puntos, año de una fecha", () => {
  const tabla: unknown[][] = [
    ["Pagos Plan Padrino 2019-2026"],
    [],
    ["Nombre", "C.C.", "Fecha de pago", "Valor pagado"],
    ["ANA", "1.043.011.199", new Date(Date.UTC(2024, 4, 30)), 350000],
    ["LUIS", 72189317, "15/11/2025", "$ 200.000"],
    ["LUIS", 72189317, "15/11/2025", "$ 200.000"], // repetida
    ["SIN", "", "2025", 1],
    ["MALA", "12", "2025", 1],
    [null, null, null, null],
  ];
  const l = leerTablaHistorico(tabla);
  assert.deepEqual(l.columnas, { cedula: "C.C.", anio: "Fecha de pago", valor: "Valor pagado" });
  assert.deepEqual(l.validas.map((f) => [f.cedula, f.anio, f.valor, f.fila]), [
    ["1043011199", 2024, 350000, 4],
    ["72189317", 2025, 200000, 5],
  ]);
  assert.equal(l.repetidas, 1);
  assert.deepEqual(l.errores.map((e) => e.fila), [7, 8]);
  assert.deepEqual(resumenLectura(l), { filas: 2, cedulas: 2, desde: 2024, hasta: 2025, valor: 550000, errores: 2, repetidas: 1 });
});

test("columna de año explícita y celdas de Excel con fórmula o texto enriquecido", () => {
  const l = leerTablaHistorico([
    ["Documento", "Año", "Monto"],
    [{ richText: [{ text: "8788" }, { text: "510" }] }, { result: 2023 }, "100.000,00"],
  ]);
  assert.deepEqual(l.validas.map((f) => [f.cedula, f.anio, f.valor]), [["8788510", 2023, 100000]]);
  assert.equal(textoCelda({ text: "x" }), "x");
});

test("sin columna de cédula: un solo error claro", () => {
  const l = leerTablaHistorico([["Nombre", "Valor"], ["ANA", 1]]);
  assert.equal(l.validas.length, 0);
  assert.match(l.errores[0].motivo, /cédula/);
});

test("CSV con punto y coma, comillas y BOM", () => {
  const t = tablaDeCsv('﻿Cédula;Año;Valor\n"72.189.317";2024;"350.000"\n8788510;2025;200000\n');
  assert.deepEqual(t, [["Cédula", "Año", "Valor"], ["72.189.317", "2024", "350.000"], ["8788510", "2025", "200000"]]);
  assert.deepEqual(leerTablaHistorico(t).validas.map((f) => f.cedula), ["72189317", "8788510"]);
  assert.deepEqual(tablaDeCsv("cedula,anio\n1234567,2020"), [["cedula", "anio"], ["1234567", "2020"]]);
});
