/**
 * Pruebas de la migración del histórico (fase 7): lectura de las filas del
 * aplicativo de Lovable, conversión al archivo de 8 columnas y cotejo contra
 * el consolidado de Gestivo.
 *
 *   npm run test:financiera
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLUMNAS_COTEJO,
  aFilaContable,
  conceptosVehiculosNuevos,
  cotejar,
  csvContable,
  filaDesdeApi,
  leerHistorico,
  tieneContable,
  veredictoParalela,
  type FilaGestivo,
} from "./historico";
import { interpretarFilas, leerCsv } from "./archivo-contable";
import { indicadores } from "./motor";

/** Una fila como la devuelve la API del aplicativo (nombres de su base). */
function api(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    periodo_normalizado: "2026-03",
    vehiculo_id: 500,
    placa: "WGD221",
    modelo: 2015,
    propietario: "GIRALDO DE ANAYA NORMA SOFIA",
    flota: "Afiliado",
    viajes: 80,
    timbradas: 6400,
    ingresos: 20000000,
    fondo: 800000,
    poliza: 400000,
    prestamo: 1000000,
    estudio: 60000,
    salario: 4500000,
    combustible: 3200000,
    rtica: 140000,
    admon: 500000,
    sitra: 0,
    despacho: 100000,
    intereses: 300000,
    otros_gastos: 250000,
    repuestos: 900000,
    mano_de_obra: 400000,
    desc_fondo_conductor: 150000,
    // 10.600.000 de GEMA + 1.800.000 contables (repuestos ya netos) = 12.400.000
    gastos_operativos_totales: 12400000,
    utilidad_neta: 7600000,
    rentabilidad: 38,
    gastos_por_timbrada: 1937.5,
    ...over,
  };
}

/** La fila equivalente en el consolidado de Gestivo. */
function gestivo(over: Partial<FilaGestivo> = {}): FilaGestivo {
  return {
    periodo: "2026-03",
    codigoVehiculo: "500",
    tieneContable: true,
    viajes: 80, timbradas: 6400, ingresos: 20000000,
    fondo: 800000, poliza: 400000, prestamo: 1000000, estudio: 60000, salario: 4500000,
    combustible: 3200000, rtica: 140000, admon: 500000, sitra: 0,
    despacho: 100000, intereses: 300000, otrosGastos: 250000,
    repuestos: 900000, manoDeObra: 400000, descFondoConductor: 150000,
    combustibleVehiculosNuevos: 0, polizaVehiculosNuevos: 0,
    ...over,
  };
}

// ── Lectura ──────────────────────────────────────────────────────────────────

test("filaDesdeApi(): normaliza período, vehículo y flota", () => {
  const r = filaDesdeApi(api(), "prueba");
  assert.ok("fila" in r);
  if (!("fila" in r)) return;
  assert.equal(r.fila.periodo, "2026-03");
  assert.equal(r.fila.vehiculo, "500");
  assert.equal(r.fila.flota, "AFILIADO");
  assert.equal(r.fila.ingresos, 20000000);
  assert.equal(r.fila.descFondoConductor, 150000);
  assert.equal(r.fila.utilidadNeta, 7600000);
});

test("filaDesdeApi(): acepta los nombres del Excel original", () => {
  const r = filaDesdeApi(
    {
      Fecha_OK: "2026-03",
      "VEHI.": "0500",
      PLACA: "WGD221",
      VIAJES: 80,
      "TIM.": 6400,
      Ingresos: "20.000.000",
      DESPACHO: 100000,
      "Desc. Fondo - conductor": 150000,
      Flota: "propia",
    },
    "excel"
  );
  assert.ok("fila" in r);
  if (!("fila" in r)) return;
  assert.equal(r.fila.periodo, "2026-03");
  assert.equal(r.fila.vehiculo, "500", "quita el cero a la izquierda");
  assert.equal(r.fila.ingresos, 20000000);
  assert.equal(r.fila.flota, "EMPRESA");
  assert.equal(r.fila.timbradas, 6400);
});

test("filaDesdeApi(): rechaza período o vehículo inservibles", () => {
  const sinPeriodo = filaDesdeApi(api({ periodo_normalizado: "nada" }), "x");
  assert.ok("error" in sinPeriodo && /período/.test(sinPeriodo.error));
  const sinVehiculo = filaDesdeApi(api({ vehiculo_id: 0 }), "x");
  assert.ok("error" in sinVehiculo && /vehículo/.test(sinVehiculo.error));
});

test("leerHistorico(): acumula repetidas como hacía el aplicativo y descarta las inservibles", () => {
  const l = leerHistorico([
    api(),
    api({ despacho: 50000, repuestos: 100000, viajes: 10 }),
    api({ vehiculo_id: 501, despacho: 1 }),
    api({ periodo_normalizado: "roto" }),
  ]);
  assert.equal(l.filas.length, 2);
  assert.equal(l.repetidas, 1);
  assert.equal(l.rechazadas.length, 1);
  const f = l.filas.find((x) => x.vehiculo === "500")!;
  assert.equal(f.despacho, 150000, "suma los dos despachos");
  assert.equal(f.repuestos, 1000000);
  assert.equal(f.viajes, 90);
  assert.equal(f.utilidadNeta, null, "los indicadores guardados dejan de valer al acumular");
});

test("leerHistorico(): ordena por período y vehículo", () => {
  const l = leerHistorico([
    api({ periodo_normalizado: "2026-04", vehiculo_id: 501 }),
    api({ periodo_normalizado: "2026-03", vehiculo_id: 510 }),
    api({ periodo_normalizado: "2026-03", vehiculo_id: 99 }),
  ]);
  assert.deepEqual(l.filas.map((f) => `${f.periodo}|${f.vehiculo}`), ["2026-03|99", "2026-03|510", "2026-04|501"]);
});

// ── Conceptos de vehículos nuevos ────────────────────────────────────────────

test("conceptosVehiculosNuevos(): la diferencia positiva contra GEMA es el concepto", () => {
  const { filas } = leerHistorico([api({ combustible: 5_000_000, poliza: 900_000 })]);
  const n = conceptosVehiculosNuevos(filas, [gestivo({ combustible: 0, poliza: 400_000 })]);
  assert.equal(n.filas.length, 1);
  assert.equal(n.filas[0].combustibleVehiculosNuevos, 5_000_000);
  assert.equal(n.filas[0].polizaVehiculosNuevos, 500_000);
  assert.equal(n.total.combustible, 5_000_000);
  assert.equal(n.total.poliza, 500_000);
  // Los otros seis rubros viajan con la fila: el upsert escribe la fila entera.
  assert.equal(n.filas[0].repuestos, 900_000);
  assert.equal(n.sinArchivo.length, 0);
  assert.equal(n.gemaMayor.length, 0);
});

test("conceptosVehiculosNuevos(): si GEMA reporta más, no es ajuste manual y no se carga", () => {
  const { filas } = leerHistorico([api({ combustible: 1_000_000 })]);
  const n = conceptosVehiculosNuevos(filas, [gestivo({ combustible: 3_000_000 })]);
  assert.equal(n.filas.length, 0);
  assert.equal(n.gemaMayor.length, 1);
  assert.equal(n.gemaMayor[0].columna, "combustible");
  assert.equal(n.gemaMayor[0].valor, -2_000_000);
});

test("conceptosVehiculosNuevos(): sin archivo contable en el mes, el ajuste queda fuera", () => {
  const { filas } = leerHistorico([api({ combustible: 5_000_000 })]);
  const n = conceptosVehiculosNuevos(filas, [gestivo({ combustible: 0, tieneContable: false })]);
  assert.equal(n.filas.length, 0, "no se crea un mes contable a medias");
  assert.deepEqual(n.sinArchivo, [{ periodo: "2026-03", vehiculo: "500" }]);
  assert.equal(n.combustible.length, 0, "tampoco cuenta como ajuste");
  assert.equal(n.total.combustible, 0);
});

test("conceptosVehiculosNuevos(): sin diferencia no hay fila, y sin par en Gestivo se ignora", () => {
  const { filas } = leerHistorico([api(), api({ vehiculo_id: 999 })]);
  const n = conceptosVehiculosNuevos(filas, [gestivo()]);
  assert.equal(n.filas.length, 0);
  assert.equal(n.sinArchivo.length, 0);
});

test("cotejar(): el concepto cargado hace cuadrar el combustible del aplicativo", () => {
  // El aplicativo tenia 1.800.000 mas de combustible que GEMA, escritos a mano.
  const { filas } = leerHistorico([
    api({ combustible: 5_000_000, gastos_operativos_totales: 14_200_000, utilidad_neta: 5_800_000, rentabilidad: 29 }),
  ]);
  const sinCargar = cotejar(filas, [gestivo({ combustible: 3_200_000 })]);
  assert.equal(sinCargar.porColumna.combustible, 1);
  assert.equal(sinCargar.total.cuadran, 0);

  const cargado = cotejar(filas, [gestivo({ combustible: 3_200_000, combustibleVehiculosNuevos: 1_800_000 })]);
  assert.equal(cargado.porColumna.combustible, undefined, "el total vuelve a coincidir");
  assert.equal(cargado.total.difieren, 0, "y con el la utilidad");
  assert.equal(cargado.total.cuadran, 1);
});

// ── Salida al archivo de la fase 4 ───────────────────────────────────────────

test("aFilaContable(): los rubros del contrato, con el nombre del contrato", () => {
  const { filas } = leerHistorico([api()]);
  const c = aFilaContable(filas[0]);
  assert.deepEqual(Object.keys(c), [
    "periodo", "vehiculo", "despacho", "intereses", "otros_gastos", "repuestos", "mano_de_obra", "desc_fondo_conductor",
    "combustible_vehiculos_nuevos", "poliza_vehiculos_nuevos",
  ]);
  assert.equal(c.vehiculo, "500");
  assert.equal(c.repuestos, 900000);
});

test("csvContable(): el CSV que produce lo lee el cargador de la fase 4 sin rechazos", () => {
  const { filas } = leerHistorico([api(), api({ vehiculo_id: 501, despacho: 1234.5 })]);
  const csv = csvContable(filas);
  const leido = interpretarFilas(leerCsv(csv));
  assert.equal(leido.errorArchivo, null);
  assert.equal(leido.rechazadas.length, 0);
  assert.equal(leido.filas.length, 2);
  assert.equal(leido.filas[0].despacho, 100000);
  assert.equal(leido.filas[1].despacho, 1234.5, "el decimal sobrevive al viaje");
  assert.equal(leido.filas[0].descFondoConductor, 150000);
});

test("tieneContable(): distingue las filas que aportan algo", () => {
  const { filas } = leerHistorico([
    api(),
    api({ vehiculo_id: 501, despacho: 0, intereses: 0, otros_gastos: 0, repuestos: 0, mano_de_obra: 0, desc_fondo_conductor: 0 }),
  ]);
  assert.equal(tieneContable(filas[0]), true);
  assert.equal(tieneContable(filas[1]), false);
});

// ── Cotejo ───────────────────────────────────────────────────────────────────

test("cotejar(): dos filas idénticas cuadran en todo", () => {
  const { filas } = leerHistorico([api()]);
  const c = cotejar(filas, [gestivo()]);
  assert.equal(c.total.cuadran, 1);
  assert.equal(c.total.difieren, 0);
  assert.equal(c.diferencias.length, 0);
  const p = c.porPeriodo[0];
  assert.equal(p.cotejablesUtilidad, 1);
  assert.equal(p.utilidadCuadra, 1);
  assert.equal(p.deltaIngresos, 0);
});

test("cotejar(): detecta una diferencia en un rubro de GEMA y dice cuál", () => {
  const { filas } = leerHistorico([api()]);
  const c = cotejar(filas, [gestivo({ admon: 490000 })]);
  assert.equal(c.total.difieren, 1);
  const d = c.diferencias[0];
  assert.equal(d.tipo, "difiere");
  const col = d.columnas.find((x) => x.columna === "admon")!;
  assert.equal(col.lovable, 500000);
  assert.equal(col.gestivo, 490000);
  assert.equal(col.diferencia, 10000);
  assert.equal(c.porColumna.admon, 1);
});

test("cotejar(): la tolerancia de ±1 COP no marca diferencias de redondeo", () => {
  const { filas } = leerHistorico([api()]);
  const c = cotejar(filas, [gestivo({ ingresos: 20000000.4, salario: 4499999.9 })]);
  assert.equal(c.total.cuadran, 1);
  assert.equal(c.total.difieren, 0);
});

test("cotejar(): varios redondeos que caben uno a uno pueden no caber en la utilidad", () => {
  // ingresos +0,6 y salario −0,5 pasan cada uno la tolerancia de su columna,
  // pero la utilidad derivada se desvía 1,1 y ahí sí se reporta. Es lo que
  // debe pasar: el criterio de aceptación es sobre la utilidad, no sobre cada
  // partida por separado.
  const { filas } = leerHistorico([api()]);
  const c = cotejar(filas, [gestivo({ ingresos: 20000000.6, salario: 4499999.5 })]);
  assert.equal(c.total.difieren, 1);
  const cols = c.diferencias[0].columnas.map((x) => x.columna);
  assert.deepEqual(cols, ["utilidad_neta"], "ninguna columna de GEMA se marca, solo el total");
});

test("cotejar(): sin rubros contables en Gestivo, la utilidad no se coteja", () => {
  const { filas } = leerHistorico([api()]);
  const sinContable = gestivo({
    tieneContable: false,
    despacho: 0, intereses: 0, otrosGastos: 0, repuestos: 0, manoDeObra: 0, descFondoConductor: 0,
  });
  const c = cotejar(filas, [sinContable]);
  assert.equal(c.total.cuadran, 1, "los doce rubros de GEMA sí cuadran");
  assert.equal(c.porPeriodo[0].cotejablesUtilidad, 0);
  assert.equal(c.porPeriodo[0].utilidadCuadra, 0);
});

test("cotejar(): una utilidad distinta se reporta aunque los rubros de GEMA cuadren", () => {
  const { filas } = leerHistorico([api({ utilidad_neta: 7000000, rentabilidad: 35 })]);
  const g = gestivo();
  const c = cotejar(filas, [g]);
  assert.equal(c.total.difieren, 1);
  const cols = c.diferencias[0].columnas.map((x) => x.columna);
  assert.ok(cols.includes("utilidad_neta"));
  assert.ok(cols.includes("rentabilidad"));
  assert.equal(indicadores(g).utilidadNeta, 7600000);
});

test("cotejar(): filas que están en una herramienta y no en la otra", () => {
  const { filas } = leerHistorico([api(), api({ vehiculo_id: 777 })]);
  const c = cotejar(filas, [gestivo(), gestivo({ codigoVehiculo: "888" })]);
  assert.equal(c.total.soloLovable, 1);
  assert.equal(c.total.soloGestivo, 1);
  assert.equal(c.diferencias.find((d) => d.tipo === "solo_lovable")!.vehiculo, "777");
  assert.equal(c.diferencias.find((d) => d.tipo === "solo_gestivo")!.vehiculo, "888");
  const p = c.porPeriodo[0];
  assert.equal(p.vehiculosLovable, 2);
  assert.equal(p.vehiculosGestivo, 2);
});

test("cotejar(): resume período a período", () => {
  const { filas } = leerHistorico([api(), api({ periodo_normalizado: "2026-04" })]);
  const c = cotejar(filas, [gestivo(), gestivo({ periodo: "2026-04", viajes: 70 })]);
  assert.deepEqual(c.porPeriodo.map((p) => p.periodo), ["2026-03", "2026-04"]);
  assert.equal(c.porPeriodo[0].cuadran, 1);
  assert.equal(c.porPeriodo[1].difieren, 1);
});

test("veredictoParalela(): exige tres meses, cero diferencias y utilidad cotejable", () => {
  const meses = ["2026-01", "2026-02", "2026-03"];
  const crudas = meses.map((m) => api({ periodo_normalizado: m }));
  const { filas } = leerHistorico(crudas);
  const gs = meses.map((m) => gestivo({ periodo: m }));

  const bueno = veredictoParalela(cotejar(filas, gs));
  assert.equal(bueno.acepta, true);
  assert.deepEqual(bueno.motivos, []);

  const pocos = veredictoParalela(cotejar(leerHistorico([api()]).filas, [gestivo()]));
  assert.equal(pocos.acepta, false);
  assert.ok(pocos.motivos.some((m) => /Solo hay 1 meses/.test(m)));

  const sinContableGestivo = gs.map((g) => ({ ...g, tieneContable: false }));
  const malo = veredictoParalela(cotejar(filas, sinContableGestivo));
  assert.equal(malo.acepta, false);
  assert.ok(malo.motivos.some((m) => /no se pudieron cotejar en utilidad/.test(m)));
});

test("COLUMNAS_COTEJO cubre las doce medidas que Gestivo saca de GEMA", () => {
  assert.equal(COLUMNAS_COTEJO.length, 12);
  for (const c of ["viajes", "timbradas", "ingresos", "admon", "sitra"] as const) {
    assert.ok((COLUMNAS_COTEJO as readonly string[]).includes(c));
  }
  assert.ok(!(COLUMNAS_COTEJO as readonly string[]).includes("despacho"), "despacho no viene de GEMA");
});
