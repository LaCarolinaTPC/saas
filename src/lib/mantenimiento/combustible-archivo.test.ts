import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  crearMaestro, encontrarEncabezado, fechaDelNombre, interpretarArchivo, leerFechaHora, leerLibro, llaveTanqueo,
  normalizarFactura, normalizarPlaca, resumirTanqueos, tanqueoCambio, type HojaCruda,
} from "./combustible-archivo";

const maestro = crearMaestro([
  { codigo: "500", placa: "WGD221" },
  { codigo: "501", placa: "WGD222" },
  { codigo: "1030", placa: "QXM-197" },
]);
const HOY = "2026-10-14";
const TITULO = [["S.S PETROMIL TERMINAL DE TRANSPORTE"], ["WILFRED ANAYA O E.U"], ["NIT: 900087673-5"], ["RELACION SUMINISTRO DE COMBUSTIBLE"], ["LA CAROLINA"]];
const CABECERA = ["Fecha", "Factura", "# Interno", "Placa", "Producto", "Volumen", "Total"];

/** Serial de Excel de una fecha y hora de Colombia, como lo guarda el archivo. */
function serial(fecha: string, hora = "00:00:00"): number {
  const [h, m, s] = hora.split(":").map(Number);
  return (Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000 + (h * 3600 + m * 60 + s) / 86400;
}

function hoja(nombre: string, filas: unknown[][]): HojaCruda {
  return { nombre, filas };
}

test("lee la fecha y la hora del serial de Excel sin depender de la zona horaria", () => {
  assert.deepEqual(leerFechaHora(serial("2026-10-01", "07:06:41")), { fecha: "2026-10-01", hora: "07:06:41" });
  // 23:59:59.9996 por pérdida de precisión redondea al día siguiente.
  assert.deepEqual(leerFechaHora(serial("2026-10-01") - 0.000001), { fecha: "2026-10-01", hora: "00:00:00" });
  assert.deepEqual(leerFechaHora("29/05/2026 1:24:46 p. m."), { fecha: "2026-05-29", hora: "13:24:46" });
  assert.deepEqual(leerFechaHora("29/05/2026"), { fecha: "2026-05-29", hora: null });
  assert.deepEqual(leerFechaHora("2026-05-29T08:05:00"), { fecha: "2026-05-29", hora: "08:05:00" });
  assert.equal(leerFechaHora("31/02/2026"), null);
  assert.equal(leerFechaHora("ayer"), null);
});

test("saca la fecha del nombre del archivo en sus variantes", () => {
  assert.equal(fechaDelNombre("13 DE OCTUBRE DEL 2026 CARO COMBUST.xlsx"), "2026-10-13");
  assert.equal(fechaDelNombre("06 OCTUBRE 2026 CAROLINA COMBUSTIBLE.xlsx"), "2026-10-06");
  assert.equal(fechaDelNombre("01 ABRIL 2023 CARO COMB.xlsx"), "2023-04-01");
  assert.equal(fechaDelNombre("Copia de 22 de septiembre 2024.xlsx"), "2024-09-22");
  assert.equal(fechaDelNombre("01 DE AGOSTO CARO COMBUSTIBLE.xlsx"), null);
});

test("normaliza factura y placa", () => {
  assert.equal(normalizarFactura(196811), "196811");
  assert.equal(normalizarFactura(" 196811.0 "), "196811");
  assert.equal(normalizarPlaca("tdv-334"), "TDV334");
  assert.equal(normalizarPlaca("  "), null);
});

test("encuentra la cabecera debajo del título y reconoce los nombres alternos", () => {
  const e = encontrarEncabezado([...TITULO, ["Fecha", "Factura", "Precio", "Cantidad", " Dinero", "Placa", " interno"]]);
  assert.deepEqual(e, { fila: 5, indices: { fecha: 0, factura: 1, galones: 3, valor: 4, placa: 5, interno: 6 } });
  const sinFecha = encontrarEncabezado([["", "Factura", "# Interno", "Placa", "Producto", "Volumen", "Total"]]);
  assert.equal(sinFecha?.indices.fecha, 0);
  assert.equal(encontrarEncabezado([["Nombre", "Cédula"]]), null);
});

test("lee el formato habitual, salta la fila de totales y marca las alertas", () => {
  const r = interpretarArchivo("01 DE OCTUBRE 2026 CAROLINA.xlsx", [hoja("Sheet0", [
    ...TITULO, CABECERA,
    [serial("2026-10-01", "07:06:41"), "196811", "500", "WGD221", "ACPM/DIESEL", 20.663, 237625],
    [serial("2026-10-01", "09:06:36"), "196816", "1030", "QXM197", "ACPM/DIESEL", 29.84, 343160],
    [serial("2026-10-01", "10:00:00"), "196820", "501", "WGB999", "ACPM/DIESEL", 50.5, 580750],
    [serial("2026-10-01", "11:00:00"), "196821", "777", "ZZZ111", "ACPM/DIESEL", 10, 80000],
    [null, null, null, null, null, 110.003, 1241535],
  ])], maestro, HOY);
  assert.equal(r.errorArchivo, null);
  assert.equal(r.filasArchivo, 4);
  assert.equal(r.tanqueos.length, 4);
  const [a, b, c, d] = r.tanqueos;
  assert.equal(a.llave, "196811|2026-10-01|07:06:41|500");
  assert.deepEqual(a.alertas, []);
  assert.deepEqual(b.alertas, [], "la placa del maestro con guion cuadra");
  assert.deepEqual(c.alertas, ["placa_distinta", "volumen_alto"]);
  assert.deepEqual(d.alertas, ["vehiculo_no_existe", "precio_distinto"]);
});

test("junta las dos hojas iguales del mismo archivo", () => {
  const filas = [
    [serial("2026-10-01", "07:06:41"), "196811", "500", "WGD221", "ACPM/DIESEL", 20.663, 237625],
    [serial("2026-10-01", "07:59:18"), "196812", "501", "WGD222", "ACPM/DIESEL", 17.95, 206425],
  ];
  const r = interpretarArchivo("x.xlsx", [hoja("Sheet0", [...TITULO, CABECERA, ...filas]), hoja("Hoja1", [...TITULO, CABECERA, filas[1], filas[0]])], maestro, HOY);
  assert.equal(r.filasArchivo, 4);
  assert.equal(r.tanqueos.length, 2);
  assert.deepEqual(r.avisos, []);
});

test("avisa cuando un tanqueo repetido trae otros galones y conserva el primero", () => {
  const r = interpretarArchivo("x.xlsx", [hoja("Hoja1", [
    CABECERA,
    [serial("2026-10-01", "08:00:00"), "1", "500", "WGD221", "ACPM", 10, 115000],
    [serial("2026-10-01", "08:00:00"), "1", "500", "WGD221", "ACPM", 12, 138000],
  ])], maestro, HOY);
  assert.equal(r.tanqueos.length, 1);
  assert.equal(r.tanqueos[0].galones, 10);
  assert.match(r.avisos[0], /dos veces/);
});

test("la hoja cruda del surtidor sin interno solo aporta lo que la otra hoja no trae", () => {
  const cruda = hoja("Sheet0", [
    ["Fecha", "Factura", "Surtidor", "Precio", "Cantidad", "Total Dinero", "Nombre - Cliente 1", "Documento - Cliente 1", "Flota", "Documento De La Flota", "Placa"],
    [serial("2026-03-27", "07:29:59"), "177949", "SURTIDOR 1", 11320, 11.852, 134165, "PERSONA", "123", "LA CAROLINA", "800", "WGD221"],
    [serial("2026-03-27", "08:04:44"), "177950", "SURTIDOR 1", 11320, 20.224, 228936, "PERSONA", "123", "LA CAROLINA", "800", "WGD222"],
    [serial("2026-03-27", "08:06:00"), "177951", "SURTIDOR 1", 11320, 5.213, 59011, "PERSONA", "123", "LA CAROLINA", "800", "ABC123"],
  ]);
  const ordenada = hoja("Hoja1", [
    ["Fecha", "Factura", "Precio", "Cantidad", "Total Dinero", "Placa", "intero"],
    [serial("2026-03-27", "07:29:59"), "177949", 11320, 11.852, 134165, "WGD221", 500],
  ]);
  const r = interpretarArchivo("27 DE MARZO 2026 CARO COMBUSTIBLE.xlsx", [cruda, ordenada], maestro, HOY);
  assert.equal(r.tanqueos.length, 2);
  const porPlaca = r.tanqueos.find((t) => t.factura === "177950")!;
  assert.equal(porPlaca.vehiculoCodigo, "501");
  assert.deepEqual(porPlaca.alertas, ["interno_por_placa"]);
  assert.deepEqual(r.tanqueos.find((t) => t.factura === "177949")!.alertas, []);
  assert.equal(r.rechazadas.length, 1);
  assert.match(r.rechazadas[0].motivo, /ABC123/);
  assert.match(r.avisos[0], /1 tanqueos de hojas sin número interno/);
  assert.ok(!JSON.stringify(r).includes("PERSONA"), "no lee el nombre del cliente");
});

test("marca la factura a nombre de dos buses y conserva los dos tanqueos", () => {
  const r = interpretarArchivo("x.xlsx", [hoja("Hoja1", [
    CABECERA,
    [serial("2026-02-03", "11:16:20"), "172880", "500", "WGD221", "ACPM", 15.876, 182574],
    [serial("2026-02-03", "11:16:20"), "172880", "501", "WGD222", "ACPM", 15.876, 182574],
  ])], maestro, HOY);
  assert.equal(r.tanqueos.length, 2);
  assert.ok(r.tanqueos.every((t) => t.alertas.includes("factura_compartida")));
});

test("sin fecha en la fila usa la del nombre del archivo y marca sin_hora", () => {
  const r = interpretarArchivo("16 MARZO 2026 CARO COMB.xlsx", [hoja("Hoja1", [
    CABECERA,
    [null, "63963", "500", "WGD221", "ACPM/DIESEL", 14.144, 162656],
  ])], maestro, HOY);
  assert.equal(r.tanqueos[0].fecha, "2026-03-16");
  assert.equal(r.tanqueos[0].hora, null);
  assert.deepEqual(r.tanqueos[0].alertas, ["sin_hora"]);
  assert.equal(r.tanqueos[0].llave, "63963|2026-03-16||500");
});

test("rechaza filas sin factura, sin galones, con fecha futura o sin fecha legible", () => {
  const r = interpretarArchivo("SIN FECHA.xlsx", [hoja("Hoja1", [
    CABECERA,
    [serial("2026-10-01", "08:00:00"), null, "500", "WGD221", "ACPM", 10, 115000],
    [serial("2026-10-01", "08:00:00"), "2", "500", "WGD221", "ACPM", 0, 0],
    [serial("2026-10-20", "08:00:00"), "3", "500", "WGD221", "ACPM", 10, 115000],
    [null, "4", "500", "WGD221", "ACPM", 10, 115000],
    [serial("2026-10-15", "08:00:00"), "5", "500", "WGD221", "ACPM", 10, 115000],
  ])], maestro, HOY);
  assert.deepEqual(r.rechazadas.map((x) => x.motivo), [
    "Sin número de factura.",
    "Sin galones o en cero.",
    "Fecha fuera de rango: 2026-10-20.",
    "Fecha no válida: «».",
  ]);
  assert.equal(r.tanqueos.length, 1, "un día después de hoy se acepta");
});

test("un archivo sin la cabecera de tanqueos se rechaza entero", () => {
  const r = interpretarArchivo("x.xlsx", [hoja("Hoja1", [["Nombre", "Cédula"], ["Ana", "1"]])], maestro, HOY);
  assert.match(r.errorArchivo ?? "", /cabecera/);
  assert.equal(r.tanqueos.length, 0);
});

test("lee un .xlsx real escrito con la librería, con fecha como fecha de Excel", () => {
  const ws = XLSX.utils.aoa_to_sheet([...TITULO, CABECERA, [serial("2026-10-13", "14:05:06"), "198115", "500", "WGD221", "ACPM/DIESEL", 17.075, 196363]]);
  ws["A7"].t = "n";
  ws["A7"].z = "dd/mm/yyyy hh:mm:ss";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Hoja2");
  const datos = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const r = interpretarArchivo("13 DE OCTUBRE DEL 2026 CARO COMBUST.xlsx", leerLibro(datos), maestro, HOY);
  assert.equal(r.errorArchivo, null);
  assert.deepEqual(r.avisos, [], "la hoja vacía no genera aviso");
  assert.equal(r.tanqueos[0].llave, llaveTanqueo({ factura: "198115", fecha: "2026-10-13", hora: "14:05:06", vehiculoCodigo: "500" }));
});

test("resume y detecta cambios contra lo que ya está en la base", () => {
  const r = interpretarArchivo("x.xlsx", [hoja("Hoja1", [
    CABECERA,
    [serial("2026-10-01", "08:00:00"), "1", "500", "WGD221", "ACPM", 10, 115000],
    [serial("2026-10-02", "08:00:00"), "2", "501", "WGD222", "ACPM", 5.5, 63250],
  ])], maestro, HOY);
  assert.deepEqual(resumirTanqueos(r.tanqueos), { tanqueos: 2, galones: 15.5, valor: 178250, buses: 2, desde: "2026-10-01", hasta: "2026-10-02", alertas: {} });
  const t = r.tanqueos[0];
  const igual = { galones: "10.000", valor: "115000.00", placa: "WGD221", producto: "ACPM", alertas: [] };
  assert.equal(tanqueoCambio(t, igual), false);
  assert.equal(tanqueoCambio(t, { ...igual, valor: "116000" }), true);
  assert.equal(tanqueoCambio(t, { ...igual, alertas: ["placa_distinta"] }), true);
});

test("deduce las columnas cuando pegaron el export del surtidor debajo de la cabecera habitual", () => {
  const r = interpretarArchivo("24 DE MARZO 2026 CARO COMBUSTIBLE.xlsx", [hoja("Hoja1", [
    ...TITULO, CABECERA,
    [serial("2026-03-24", "13:19:08"), "177662", 11320, 19.013, 215227, "CAROLINA", "WGD221", 500],
    [serial("2026-03-24", "11:12:40"), "177628", 11320, 20.402, 230951, "CAROLINA", "WGD222", 501],
    [serial("2026-03-24", "12:28:13"), "177648", 11320, 10.288, 116460, "CAROLINA", "QXM197", 1030],
    [null, null, null, 49.703, 562638, null, null, null],
  ])], maestro, HOY);
  assert.equal(r.rechazadas.length, 0);
  assert.deepEqual(r.tanqueos.map((t) => [t.vehiculoCodigo, t.placa, t.galones, t.valor, t.producto]), [
    ["501", "WGD222", 20.402, 230951, null],
    ["1030", "QXM197", 10.288, 116460, null],
    ["500", "WGD221", 19.013, 215227, null],
  ]);
  assert.match(r.avisos[0], /se dedujeron por el contenido/);
});

test("no deduce nada cuando los datos sí corresponden a la cabecera", () => {
  const r = interpretarArchivo("x.xlsx", [hoja("Hoja1", [
    CABECERA,
    [serial("2026-10-01", "07:06:41"), "196811", "500", "WGD221", "ACPM/DIESEL", 20.663, 237625],
    [serial("2026-10-01", "08:06:41"), "196812", "501", "WGD-222", "ACPM/DIESEL", 12, 138000],
  ])], maestro, HOY);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.tanqueos[0].producto, "ACPM/DIESEL");
});

test("la placa manda: si es de otro bus en el maestro se usa ese bus", () => {
  const r = interpretarArchivo("x.xlsx", [hoja("Hoja1", [
    CABECERA,
    [serial("2026-05-20", "08:00:00"), "180001", "501", "WGD221", "ACPM", 10, 115000],
    [serial("2026-05-20", "09:00:00"), "180002", "903", "WGD222", "ACPM", 10, 115000],
    [serial("2026-05-20", "10:00:00"), "180003", "500", "WOX905", "ACPM", 10, 115000],
  ])], maestro, HOY);
  assert.deepEqual(r.tanqueos.map((t) => [t.factura, t.vehiculoCodigo, t.alertas]), [
    ["180001", "500", ["interno_por_placa"]],
    ["180002", "501", ["interno_por_placa"]],
    ["180003", "500", ["placa_distinta"]],
  ]);
  assert.equal(r.tanqueos[0].llave, "180001|2026-05-20|08:00:00|500");
  assert.match(r.avisos[0], /2 tanqueos traían un número interno/);
});

test("si el bus de la placa ya tanqueó ese día con esa placa, la placa es la equivocada y se conserva el interno", () => {
  const r = interpretarArchivo("x.xlsx", [hoja("Hoja1", [
    CABECERA,
    [serial("2026-05-25", "11:24:00"), "183930", "500", "WGD221", "ACPM", 9.962, 114563],
    [serial("2026-05-25", "11:30:00"), "183935", "501", "WGD221", "ACPM", 13.184, 151616],
  ])], maestro, HOY);
  assert.deepEqual(r.tanqueos.map((t) => [t.factura, t.vehiculoCodigo, t.alertas]), [
    ["183930", "500", []],
    ["183935", "501", ["placa_distinta"]],
  ]);
  assert.deepEqual(r.avisos, []);
});
