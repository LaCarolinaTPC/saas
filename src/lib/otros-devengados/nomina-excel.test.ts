import { test } from "node:test";
import assert from "node:assert/strict";
import { compararNomina, fechaListado, interpretarListadoNomina, numeroListado } from "./nomina-excel";

const CAB = ["NITEM", "COD_CON", "NOM_CON", "COD_EPL", "NOM_EPL", "CANTIDAD", "NUM_DOC", "FECHA", "TIP_DOC", "COD_PER", "NOM_PER", "VALOR"];
const fila = (con: string, epl: string, valor: string, fecha = "15/11/2026", per = "01047") => [
  "1", con, `Concepto ${con}`, epl, `Empleado ${epl}`, "15", "NM-1", fecha, "03", per, "NOMINA PRIMERA QUINCENA DE NOVIEMBRE", valor,
];

test("números del listado: coma decimal, miles con punto, negativos y números de Excel", () => {
  assert.equal(numeroListado("124547,5"), 124547.5);
  assert.equal(numeroListado("1.234.567,89"), 1234567.89);
  assert.equal(numeroListado("875452"), 875452);
  assert.equal(numeroListado("-94290"), -94290);
  assert.equal(numeroListado(31683.04), 31683.04);
  assert.ok(Number.isNaN(numeroListado("")));
});

test("fechas del listado: día/mes/año, ISO y fecha de Excel", () => {
  assert.equal(fechaListado("15/11/2026"), "2026-11-15");
  assert.equal(fechaListado("2026-11-30 00:00"), "2026-11-30");
  assert.equal(fechaListado(new Date(Date.UTC(2026, 10, 15))), "2026-11-15");
  assert.equal(fechaListado("quince"), null);
});

test("interpreta el listado de MGX y saca el período y el corte", () => {
  const r = interpretarListadoNomina([CAB, fila("003", "123", "875452"), fila("010", "123", "124547,5"), [""], fila("003", "456", "800000")]);
  assert.ok(typeof r !== "string");
  assert.equal(r.codPer, "01047");
  assert.deepEqual({ periodo: r.corte.periodo, quincena: r.corte.quincena }, { periodo: "2026-11", quincena: 1 });
  assert.equal(r.lineas.length, 3);
  assert.deepEqual(r.lineas[1], { codEpl: "123", nomEpl: "Empleado 123", codCon: "010", nomCon: "Concepto 010", cantidad: 15, valor: 124547.5 });
});

test("los códigos que Excel dejó como número recuperan sus ceros", () => {
  const r = interpretarListadoNomina([CAB, ["1", 3, "Salario", 123, "X", 15, "NM", new Date(Date.UTC(2026, 10, 30)), "03", 1048, "N", 875452]]);
  assert.ok(typeof r !== "string");
  assert.equal(r.codPer, "01048");
  assert.equal(r.lineas[0].codCon, "003");
  assert.equal(r.corte.quincena, 2);
});

test("rechaza un archivo que no es el listado, con dos períodos o con dos quincenas", () => {
  assert.match(String(interpretarListadoNomina([["Cédula", "Valor"], ["1", "2"]])), /encabezado/);
  assert.match(String(interpretarListadoNomina([CAB, fila("003", "1", "10"), fila("003", "2", "10", "15/11/2026", "01048")])), /más de un período/);
  assert.match(String(interpretarListadoNomina([CAB, fila("003", "1", "10"), fila("003", "2", "10", "30/11/2026")])), /más de una quincena/);
  assert.match(String(interpretarListadoNomina([CAB, fila("003", "1", "abc")])), /no es un número/);
  assert.match(String(interpretarListadoNomina([CAB])), /no trae líneas/);
});

test("comparación: igual cuando el Excel y MGX coinciden en los conceptos del cruce", () => {
  const l = [
    { cedula: "1", nombre: "A", concepto: "003", valor: 800000 },
    { cedula: "1", nombre: "A", concepto: "010", valor: 100000 },
    { cedula: "1", nombre: "A", concepto: "501", valor: -32000 },
  ];
  const c = compararNomina(l, [...l.slice(0, 2), { cedula: "1", nombre: "A", concepto: "501", valor: -99 }], ["003", "010"]);
  assert.equal(c.nDiferencias, 0);
  assert.deepEqual(c.conceptos, [
    { concepto: "003", excel: 800000, mgx: 800000, diferencia: 0 },
    { concepto: "010", excel: 100000, mgx: 100000, diferencia: 0 },
  ]);
});

test("comparación: señala valores distintos y empleados que solo están en un lado", () => {
  const excel = [
    { cedula: "1", nombre: "A", concepto: "003", valor: 800000 },
    { cedula: "2", nombre: "B", concepto: "003", valor: 700000 },
  ];
  const mgx = [
    { cedula: "1", nombre: "A", concepto: "003", valor: 750000 },
    { cedula: "3", nombre: "C", concepto: "003", valor: 600000 },
    { cedula: "3", nombre: "C", concepto: "003", valor: 0.4 },
  ];
  const c = compararNomina(excel, mgx, ["003"]);
  assert.deepEqual(
    c.diferencias.map((d) => [d.cedula, d.excel, d.mgx]),
    [["1", 800000, 750000], ["2", 700000, 0], ["3", 0, 600000.4]]
  );
  assert.equal(c.conceptos[0].diferencia, 149999.6);
  assert.equal(c.empleadosExcel, 2);
  assert.equal(c.empleadosMgx, 2);
});
