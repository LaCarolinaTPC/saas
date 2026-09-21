/**
 * Pruebas del archivo contable (Fase 4 del plan, sección 12):
 * mismo contenido en CSV y .xlsx ⇒ mismo resultado; separador `;` y decimal
 * `,`; celda vacía → 0 y contada; vehículo inexistente → fila rechazada sin
 * abortar el resto; período cerrado con archivo → archivo rechazado entero;
 * período inexistente → archivo rechazado; cabecera incompleta → rechazado.
 *
 *   npm run test:financiera
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  COLUMNAS_ARCHIVO,
  interpretarFilas,
  leerArchivo,
  leerCsv,
  leerXlsx,
  mapearEncabezado,
  normalizarPeriodo,
  normalizarVehiculo,
  parsearNumero,
  plantillaCsv,
  validarContraConsolidado,
  type PeriodoContexto,
} from "./archivo-contable";
import type { RubrosContables } from "./motor";

/** Las ocho columnas obligatorias: lo que contabilidad ya tiene hoy. */
const CAB = "periodo;vehiculo;despacho;intereses;otros_gastos;repuestos;mano_de_obra;desc_fondo_conductor";
/** Con los dos conceptos de vehiculos nuevos. */
const CAB10 = CAB + ";combustible_vehiculos_nuevos;poliza_vehiculos_nuevos";

function contexto(over: Partial<PeriodoContexto> & { periodo: string }): PeriodoContexto {
  return {
    estado: "abierto",
    vehiculos: new Set(["500", "501", "502"]),
    existentes: new Map<string, RubrosContables>(),
    gemaPorVehiculo: new Map<string, { combustible: number; poliza: number }>(),
    ingresos: 60_000_000,
    gastosGema: 33_000_000,
    ...over,
  };
}

function xlsxDesde(filas: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contable");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── Normalización ────────────────────────────────────────────────────────────

test("normalizarPeriodo(): formas aceptadas", () => {
  assert.equal(normalizarPeriodo("2026-03"), "2026-03");
  assert.equal(normalizarPeriodo("2026-3"), "2026-03");
  assert.equal(normalizarPeriodo("2026/03"), "2026-03");
  assert.equal(normalizarPeriodo("03/2026"), "2026-03");
  assert.equal(normalizarPeriodo("15/03/2026"), "2026-03");
  assert.equal(normalizarPeriodo("2026-03-01"), "2026-03");
  assert.equal(normalizarPeriodo("Marzo 2026"), "2026-03");
  assert.equal(normalizarPeriodo("mar-26"), "2026-03");
  assert.equal(normalizarPeriodo(202603), "2026-03");
  assert.equal(normalizarPeriodo(new Date(2026, 2, 1)), "2026-03", "fecha local, como la entrega xlsx");
  assert.equal(normalizarPeriodo(46082), "2026-03", "serial de Excel del 2026-03-01");
  assert.equal(normalizarPeriodo("marzo"), null);
  assert.equal(normalizarPeriodo(""), null);
});

test("normalizarVehiculo(): texto, número y ceros a la izquierda", () => {
  assert.equal(normalizarVehiculo(" 500 "), "500");
  assert.equal(normalizarVehiculo(500), "500");
  assert.equal(normalizarVehiculo("500.0"), "500");
  assert.equal(normalizarVehiculo("0500"), "500");
  assert.equal(normalizarVehiculo(""), null);
  assert.equal(normalizarVehiculo(null), null);
});

test("parsearNumero(): colombiano, anglosajón, vacío y basura", () => {
  assert.deepEqual(parsearNumero("1.234.567,89"), { valor: 1234567.89, vacio: false });
  assert.deepEqual(parsearNumero("1,234,567.89"), { valor: 1234567.89, vacio: false });
  assert.deepEqual(parsearNumero("1.234"), { valor: 1234, vacio: false }, "un punto con tres dígitos es miles");
  assert.deepEqual(parsearNumero("12.5"), { valor: 12.5, vacio: false });
  assert.deepEqual(parsearNumero("1234,5", ","), { valor: 1234.5, vacio: false });
  assert.deepEqual(parsearNumero("1.234,5", ","), { valor: 1234.5, vacio: false });
  assert.deepEqual(parsearNumero("1,234.5", "."), { valor: 1234.5, vacio: false });
  assert.deepEqual(parsearNumero("$ 950.000"), { valor: 950000, vacio: false });
  assert.deepEqual(parsearNumero("-150000"), { valor: -150000, vacio: false });
  assert.deepEqual(parsearNumero("(150000)"), { valor: -150000, vacio: false });
  assert.deepEqual(parsearNumero(""), { valor: 0, vacio: true });
  assert.deepEqual(parsearNumero(null), { valor: 0, vacio: true });
  assert.deepEqual(parsearNumero(120000), { valor: 120000, vacio: false });
  assert.equal(parsearNumero("abc"), null);
  assert.equal(parsearNumero("12a"), null);
  assert.equal(parsearNumero(true), null);
});

test("mapearEncabezado(): tolera tildes, mayúsculas y los nombres del Excel original; falla si falta una", () => {
  const ok = mapearEncabezado(["Período", "VEHI.", "DESPACHO", "INTERESES", "OTROS GASTOS", "Repuestos", "Mano de Obra", "Desc. Fondo - conductor"]);
  assert.ok("indices" in ok);
  if ("indices" in ok) {
    assert.equal(ok.indices.periodo, 0);
    assert.equal(ok.indices.vehiculo, 1);
    assert.equal(ok.indices.desc_fondo_conductor, 7);
  }
  const mal = mapearEncabezado(["periodo", "vehiculo", "despacho", "intereses", "otros_gastos", "repuestos", "mano_de_obra"]);
  assert.ok("error" in mal && /Faltan: desc_fondo_conductor/.test(mal.error));
  const desordenado = mapearEncabezado([...COLUMNAS_ARCHIVO].reverse());
  assert.ok("indices" in desordenado, "el orden de las columnas no importa");
});

// ── Lectura ──────────────────────────────────────────────────────────────────

test("leerCsv(): detecta `;` con decimal coma y `,` con decimal punto; comillas y BOM", () => {
  const a = leerCsv(`﻿${CAB}\r\n2026-03;500;"1.200,50";0;;950000;400000;150000\r\n`);
  assert.equal(a.separador, ";");
  assert.equal(a.filas.length, 1);
  assert.equal(a.filas[0][2], "1.200,50");
  const ia = interpretarFilas(a);
  assert.equal(ia.filas[0].despacho, 1200.5);
  assert.equal(ia.filas[0].otrosGastos, 0);
  assert.equal(ia.filas[0].celdasVacias, 1);

  const b = leerCsv(`${CAB.replace(/;/g, ",")}\n2026-03,500,"1,200.50",0,,950000,400000,150000\n`);
  assert.equal(b.separador, ",");
  const ib = interpretarFilas(b);
  assert.equal(ib.filas[0].despacho, 1200.5);
});

test("mismo contenido en CSV y en .xlsx produce el mismo resultado", () => {
  const csv = leerArchivo("marzo.csv", Buffer.from(`${CAB}\n2026-03;500;120000;350000;80000;950000;400000;150000\n2026-03;501;0;;0;0;0;0\n`, "utf8"));
  const xlsx = leerArchivo("marzo.xlsx", xlsxDesde([
    [...COLUMNAS_ARCHIVO],
    ["2026-03", 500, 120000, 350000, 80000, 950000, 400000, 150000, 0, 0],
    ["2026-03", 501, 0, null, 0, 0, 0, 0, 0, 0],
  ]));
  assert.ok(!("error" in csv) && !("error" in xlsx));
  if ("error" in csv || "error" in xlsx) return;
  const ic = interpretarFilas(csv);
  const ix = interpretarFilas(xlsx);
  const limpiar = (f: typeof ic.filas) => f.map(({ linea: _l, ...r }) => { void _l; return r; });
  assert.deepEqual(limpiar(ic.filas), limpiar(ix.filas));
  assert.equal(ic.celdasVacias, 1);
  assert.equal(ix.celdasVacias, 1);
});

test("leerArchivo(): extensión desconocida se rechaza; xlsx con fecha en período se normaliza", () => {
  const r = leerArchivo("datos.pdf", Buffer.from(""));
  assert.ok("error" in r);
  const t = leerXlsx(xlsxDesde([[...COLUMNAS_ARCHIVO], [new Date(2026, 2, 1), "500", 1, 2, 3, 4, 5, 6, 0, 0]]));
  const i = interpretarFilas(t);
  assert.equal(i.filas[0].periodo, "2026-03");
});

// ── Interpretación ───────────────────────────────────────────────────────────

test("interpretarFilas(): cabecera incompleta o sin filas rechaza el archivo entero", () => {
  const sinCol = interpretarFilas(leerCsv("periodo;vehiculo;despacho\n2026-03;500;1\n"));
  assert.ok(sinCol.errorArchivo && /cabecera/.test(sinCol.errorArchivo));
  const vacio = interpretarFilas(leerCsv(`${CAB}\n`));
  assert.ok(vacio.errorArchivo && /no tiene filas/.test(vacio.errorArchivo));
});

test("interpretarFilas(): fila con texto en un rubro se rechaza, las demás siguen; repetidas se rechazan", () => {
  const i = interpretarFilas(leerCsv(
    `${CAB}\n` +
    `2026-03;500;120000;350000;80000;950000;400000;150000\n` +
    `2026-03;501;abc;0;0;0;0;0\n` +
    `2026-03;500;1;1;1;1;1;1\n` +
    `2026-13;502;1;1;1;1;1;1\n` +
    `2026-03;;1;1;1;1;1;1\n` +
    `;;;;;;;\n`
  ));
  assert.equal(i.errorArchivo, null);
  assert.equal(i.filas.length, 1);
  assert.equal(i.rechazadas.length, 4);
  assert.match(i.rechazadas[0].motivo, /no es un número/);
  assert.match(i.rechazadas[1].motivo, /repetido/);
  assert.match(i.rechazadas[2].motivo, /Período no válido/);
  assert.match(i.rechazadas[3].motivo, /código del vehículo/);
  assert.equal(i.rechazadas[0].linea, 3);
});

// ── Validación contra el consolidado ─────────────────────────────────────────

const ARCHIVO_MARZO = `${CAB}\n` +
  `2026-03;500;120000;350000;80000;950000;400000;150000\n` +
  `2026-03;501;100000;0;;500000;200000;0\n` +
  `2026-03;999;1;1;1;1;1;1\n`;

test("validarContraConsolidado(): vehículo sin movimiento se rechaza sin abortar; delta de totales", () => {
  const ctx = new Map([["2026-03", contexto({ periodo: "2026-03" })]]);
  const r = validarContraConsolidado(interpretarFilas(leerCsv(ARCHIVO_MARZO)), ctx);
  assert.equal(r.errorArchivo, null);
  assert.equal(r.validas.length, 2);
  assert.equal(r.rechazadas.length, 1);
  assert.match(r.rechazadas[0].motivo, /999 no tuvo movimiento en 2026-03/);
  assert.equal(r.celdasVacias, 1);
  assert.equal(r.totalFilas, 3);
  const p = r.porPeriodo[0];
  assert.equal(p.periodo, "2026-03");
  assert.equal(p.nuevas, 2);
  assert.equal(p.reemplazadas, 0);
  assert.equal(p.rechazadas, 1);
  assert.equal(p.sinArchivo, 1, "el 502 queda sin archivo");
  assert.equal(p.vehiculosMes, 3);
  assert.equal(p.antes.gastosContables, 0);
  // 500: 120000+350000+80000+(950000-150000)+400000 = 1.750.000 · 501: 100000+0+0+500000+200000 = 800.000
  assert.equal(p.despues.gastosContables, 2_550_000);
  assert.equal(p.antes.utilidad, 27_000_000);
  assert.equal(p.despues.utilidad, 24_450_000);
  assert.equal(p.despues.vehiculosConArchivo, 2);
});

test("validarContraConsolidado(): recarga del mismo período reemplaza y no duplica", () => {
  const existentes = new Map<string, RubrosContables>([
    ["500", { despacho: 1, intereses: 1, otrosGastos: 1, repuestos: 1, manoDeObra: 1, descFondoConductor: 0,
              combustibleVehiculosNuevos: 0, polizaVehiculosNuevos: 0 }],
  ]);
  const ctx = new Map([["2026-03", contexto({ periodo: "2026-03", existentes })]]);
  const r = validarContraConsolidado(interpretarFilas(leerCsv(ARCHIVO_MARZO)), ctx);
  assert.equal(r.errorArchivo, null);
  const p = r.porPeriodo[0];
  assert.equal(p.reemplazadas, 1);
  assert.equal(p.nuevas, 1);
  assert.equal(p.antes.gastosContables, 5);
  assert.equal(p.despues.gastosContables, 2_550_000);
});

test("validarContraConsolidado(): período inexistente rechaza el archivo entero", () => {
  const r = validarContraConsolidado(interpretarFilas(leerCsv(ARCHIVO_MARZO)), new Map());
  assert.ok(r.errorArchivo && /2026-03 no existe en el consolidado/.test(r.errorArchivo));
  assert.equal(r.validas.length, 0);
});

test("validarContraConsolidado(): período cerrado SIN archivo entra; cerrado CON archivo se rechaza entero", () => {
  const sin = new Map([["2026-03", contexto({ periodo: "2026-03", estado: "cerrado" })]]);
  const r1 = validarContraConsolidado(interpretarFilas(leerCsv(ARCHIVO_MARZO)), sin);
  assert.equal(r1.errorArchivo, null);
  assert.equal(r1.validas.length, 2);

  const con = new Map([["2026-03", contexto({
    periodo: "2026-03", estado: "cerrado",
    existentes: new Map([["502", { despacho: 0, intereses: 0, otrosGastos: 0, repuestos: 0, manoDeObra: 0, descFondoConductor: 0,
                                   combustibleVehiculosNuevos: 0, polizaVehiculosNuevos: 0 }]]),
  })]]);
  const r2 = validarContraConsolidado(interpretarFilas(leerCsv(ARCHIVO_MARZO)), con);
  assert.ok(r2.errorArchivo && /cerrado y ya tiene archivo/.test(r2.errorArchivo));
  assert.equal(r2.validas.length, 0);

  const reabierto = new Map([["2026-03", { ...con.get("2026-03")!, estado: "reabierto" as const }]]);
  const r3 = validarContraConsolidado(interpretarFilas(leerCsv(ARCHIVO_MARZO)), reabierto);
  assert.equal(r3.errorArchivo, null, "reabierto admite reemplazo");
});

test("validarContraConsolidado(): varios períodos en un archivo, uno inválido tumba todo", () => {
  const dos = `${CAB}\n2026-03;500;1;1;1;1;1;1\n2026-04;500;1;1;1;1;1;1\n`;
  const ctx = new Map([["2026-03", contexto({ periodo: "2026-03" })]]);
  const r = validarContraConsolidado(interpretarFilas(leerCsv(dos)), ctx);
  assert.ok(r.errorArchivo && /2026-04/.test(r.errorArchivo));
  ctx.set("2026-04", contexto({ periodo: "2026-04" }));
  const ok = validarContraConsolidado(interpretarFilas(leerCsv(dos)), ctx);
  assert.equal(ok.errorArchivo, null);
  assert.deepEqual(ok.porPeriodo.map((p) => p.periodo), ["2026-03", "2026-04"]);
});

// ── Conceptos de vehículos nuevos (2026-09-21) ──────────────────────────────

test("un archivo con las ocho columnas de siempre sigue entrando", () => {
  const i = interpretarFilas(leerCsv(`${CAB}\n2026-03;500;1;2;3;4;5;6\n`));
  assert.equal(i.errorArchivo, null);
  assert.equal(i.filas.length, 1);
  assert.equal(i.filas[0].combustibleVehiculosNuevos, 0, "la columna ausente vale 0");
  assert.equal(i.filas[0].polizaVehiculosNuevos, 0);
  assert.equal(i.filas[0].celdasVacias, 0, "ausente no es lo mismo que vacia");
});

test("con las diez columnas, los dos conceptos nuevos se leen", () => {
  const i = interpretarFilas(leerCsv(`${CAB10}\n2026-03;500;1;2;3;4;5;6;1.500.000;80.000\n`));
  assert.equal(i.errorArchivo, null);
  assert.equal(i.filas[0].combustibleVehiculosNuevos, 1_500_000);
  assert.equal(i.filas[0].polizaVehiculosNuevos, 80_000);
});

test("los conceptos nuevos entran en el gasto contable del período", () => {
  const ctx = new Map([["2026-03", contexto({ periodo: "2026-03" })]]);
  const r = validarContraConsolidado(
    interpretarFilas(leerCsv(`${CAB10}\n2026-03;500;0;0;0;0;0;0;1000000;50000\n`)),
    ctx
  );
  assert.equal(r.errorArchivo, null);
  assert.equal(r.porPeriodo[0].despues.gastosContables, 1_050_000);
  assert.equal(r.porPeriodo[0].antes.utilidad - r.porPeriodo[0].despues.utilidad, 1_050_000);
});

test("avisa (sin bloquear) si GEMA ya reporta ese combustible o esa póliza", () => {
  const gemaPorVehiculo = new Map([
    ["500", { combustible: 4_000_000, poliza: 0 }],
    ["501", { combustible: 0, poliza: 900_000 }],
    ["502", { combustible: 0, poliza: 0 }],
  ]);
  const ctx = new Map([["2026-03", contexto({ periodo: "2026-03", gemaPorVehiculo })]]);
  const r = validarContraConsolidado(
    interpretarFilas(leerCsv(
      `${CAB10}\n` +
      `2026-03;500;0;0;0;0;0;0;1000000;0\n` +
      `2026-03;501;0;0;0;0;0;0;0;50000\n` +
      `2026-03;502;0;0;0;0;0;0;1000000;50000\n`
    )),
    ctx
  );
  assert.equal(r.errorArchivo, null);
  assert.equal(r.validas.length, 3, "avisar no bloquea");
  assert.equal(r.avisos.length, 2);
  assert.match(r.avisos[0].mensaje, /ya reporta combustible/);
  assert.equal(r.avisos[0].vehiculo, "500");
  assert.match(r.avisos[1].mensaje, /ya reporta poliza/);
  assert.equal(r.avisos[1].vehiculo, "501");
});

test("sin GEMA de referencia, o con el concepto en cero, no hay aviso", () => {
  const gemaPorVehiculo = new Map([["500", { combustible: 4_000_000, poliza: 900_000 }]]);
  const ctx = new Map([["2026-03", contexto({ periodo: "2026-03", gemaPorVehiculo })]]);
  const r = validarContraConsolidado(
    interpretarFilas(leerCsv(`${CAB10}\n2026-03;500;1;2;3;4;5;6;0;0\n`)),
    ctx
  );
  assert.equal(r.avisos.length, 0);
  const sinRef = validarContraConsolidado(
    interpretarFilas(leerCsv(`${CAB10}\n2026-03;500;0;0;0;0;0;0;1000000;0\n`)),
    new Map([["2026-03", contexto({ periodo: "2026-03" })]])
  );
  assert.equal(sinRef.avisos.length, 0, "sin gemaPorVehiculo no se puede avisar");
});

test("plantillaCsv(): se lee con el propio lector y da una fila válida", () => {
  const i = interpretarFilas(leerCsv(plantillaCsv()));
  assert.equal(i.errorArchivo, null);
  assert.equal(i.filas.length, 1);
  assert.equal(i.filas[0].periodo, "2026-03");
  assert.equal(i.filas[0].vehiculo, "500");
  assert.equal(i.filas[0].repuestos, 950000);
  assert.equal(i.filas[0].combustibleVehiculosNuevos, 0);
  assert.equal(i.filas[0].polizaVehiculosNuevos, 0);
});
