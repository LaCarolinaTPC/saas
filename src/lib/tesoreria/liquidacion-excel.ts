/**
 * Libros Excel de la liquidación de afiliados (solo servidor). El de un
 * afiliado lo usan Tesorería y el portal de afiliados: mismo archivo.
 */
import ExcelJS from "exceljs";
import { fechaCorta } from "./calendario-pago";
import { COLUMNAS_DIA, lineasDeducciones, liquidar, prefijoCierre, type FilaTercero } from "./liquidacion-afiliados";
import { getFilasAfiliados, getPropietarios } from "./liquidacion-afiliados-data";

export const PESOS = '"$"#,##0;"$"-#,##0';
export const NOTA = "Pago de obligaciones = «descuentos otros» de GEMA. Los días sincronizados antes de guardar ese campo no lo traen: ahí el valor final es el líquido antes de obligaciones.";

export /** Hoja con el detalle diario, una fila por cierre, con las columnas del GAF-R-12. */
function hojaDetalle(wb: ExcelJS.Workbook, nombre: string, filas: FilaTercero[], conPropietario: boolean) {
  const ws = wb.addWorksheet(nombre.slice(0, 31));
  const cols: Partial<ExcelJS.Column>[] = [
    ...(conPropietario ? [{ header: "Cédula propietario", key: "cedula", width: 16 }, { header: "Propietario", key: "prop", width: 32 }] : []),
    { header: "Vehículo", key: "veh", width: 9 },
    { header: "Placa", key: "placa", width: 9 },
    { header: "Fecha", key: "fecha", width: 11 },
    { header: "Cierre", key: "cierre", width: 9 },
    { header: "Ruta", key: "ruta", width: 20 },
    { header: "Conductor", key: "conduc", width: 9 },
    { header: "Nombre conductor", key: "nconduc", width: 30 },
    ...COLUMNAS_DIA.map((c) => ({ header: c.titulo, key: c.campo, width: c.formato === "pesos" ? 13 : 9 })),
    { header: "Descuentos otros", key: "descuentos_otros", width: 14 },
  ];
  ws.columns = cols;
  for (const f of filas) {
    ws.addRow({
      cedula: f.cedula_propietario, prop: f.propietario_nombre, veh: f.codigo_vehiculo, placa: f.placa,
      fecha: f.fecha, cierre: prefijoCierre(f.tipo_cierre), ruta: f.ruta, conduc: f.codigo_conductor, nconduc: f.conductor_nombre,
      ...Object.fromEntries(COLUMNAS_DIA.map((c) => [c.campo, Number(f[c.campo] ?? 0)])),
      // Vacío = día sin el dato (sincronizado antes de la columna), distinto de cero.
      descuentos_otros: f.descuentos_otros,
    });
  }
  for (const c of COLUMNAS_DIA) if (c.formato === "pesos") ws.getColumn(c.campo).numFmt = PESOS;
  ws.getColumn("descuentos_otros").numFmt = PESOS;
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

/** Libro de UN afiliado: hoja de resumen por vehículo y una hoja diaria por vehículo. */
export async function libroAfiliado(cedula: string, desde: string, hasta: string): Promise<{ buffer: ArrayBuffer; archivo: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestivo";
  const [filas, fichas] = await Promise.all([getFilasAfiliados({ desde, hasta, cedula }), getPropietarios([cedula])]);
  const l = liquidar(cedula, filas);
  const ficha = fichas.get(cedula);
  const res = wb.addWorksheet("Resumen");
  res.columns = [{ width: 34 }, ...l.vehiculos.map(() => ({ width: 16 })), { width: 16 }];
  res.addRow([`Liquidación de ${l.nombre ?? ficha?.nombre ?? cedula}`]).font = { bold: true, size: 13 };
  res.addRow([`CC ${cedula}${ficha?.codigo ? ` · ${ficha.codigo}` : ""} · del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`]);
  res.addRow([NOTA]).font = { italic: true, color: { argb: "FF1E40AF" } };
  res.addRow([]);
  res.addRow(["Concepto", ...l.vehiculos.map((v) => `Vehículo ${v.codigo}`), "Total"]).font = { bold: true };
  type R = typeof l.resumen;
  const filasResumen: [string, (r: R) => number][] = [
    ["Base liquidación (bruto)", (r) => r.base],
    ...lineasDeducciones(l.resumen).map((x, i) => [x.etiqueta, (r: R) => lineasDeducciones(r)[i].valor] as [string, (r: R) => number]),
    ["Pago obligaciones (descuentos otros)", (r) => r.obligaciones ?? 0],
    ["Total deducciones", (r) => r.totalDeducciones],
    ["Líquido antes de obligaciones", (r) => r.liquido],
    ["Producido neto", (r) => r.producidoNeto ?? r.liquido],
  ];
  for (const [etiqueta, valor] of filasResumen) {
    const row = res.addRow([etiqueta, ...l.vehiculos.map((v) => valor(v.resumen)), valor(l.resumen)]);
    row.eachCell((c, n) => { if (n > 1) c.numFmt = PESOS; });
    if (etiqueta.startsWith("Producido") || etiqueta.startsWith("Total")) row.font = { bold: true };
  }
  for (const v of l.vehiculos) hojaDetalle(wb, `Vehículo ${v.codigo}`, v.filas, false);
  return {
    buffer: (await wb.xlsx.writeBuffer()) as ArrayBuffer,
    archivo: `liquidacion_${ficha?.codigo ?? cedula}_${desde}_a_${hasta}`,
  };
}

export function respuestaExcel(buffer: ArrayBuffer, archivo: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
