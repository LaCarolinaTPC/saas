// Excel de hitos del Plan Padrino para nómina (solo servidor, exceljs).
// Columnas de la spec RQ-06: cédula y nombre del padrino, cédula y nombre
// del referido, esquema, hito, valor bruto y fecha de causación.

import ExcelJS from "exceljs";
import { estadoHito, type HitoFila } from "./hitos";

const INDIGO = "FF4F46E5";
const GRIS_FILA = "FFF8FAFC";

export async function construirExcelHitos(hitos: HitoFila[], titulo: string): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Gestivo · La Carolina De Transporte";
  libro.created = new Date();
  const hoja = libro.addWorksheet("Hitos Plan Padrino");

  hoja.getCell("A1").value = "Plan Padrino · hitos para nómina";
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A2").value = titulo;
  hoja.getCell("A2").font = { color: { argb: "FF64748B" } };
  hoja.getCell("A3").value = `Generado: ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date())} · Valores brutos`;
  hoja.getCell("A3").font = { color: { argb: "FF64748B" } };

  const cols = [
    "Cédula padrino", "Nombre padrino", "Cédula referido", "Nombre referido", "Esquema", "Hito", "Descripción",
    "Valor bruto", "Fecha de causación", "Estado", "Aprobó", "Fecha de pago", "Referencia de pago",
  ];
  const cab = hoja.getRow(5);
  cols.forEach((t, i) => {
    const c = cab.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  hitos.forEach((h, i) => {
    const r = hoja.addRow([
      h.referido.cedula_padrino,
      h.referido.nombre_padrino ?? "",
      h.referido.cedula_referido,
      h.referido.nombre_referido ?? "",
      h.referido.esquema,
      h.numero,
      h.descripcion,
      h.valor,
      h.fecha_causacion,
      estadoHito(h.estado)?.label ?? h.estado,
      h.aprobado_por_email ?? "",
      h.fecha_pago ?? "",
      h.referencia_pago ?? "",
    ]);
    r.getCell(8).numFmt = '"$" #,##0';
    if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_FILA } }; });
  });
  const total = hoja.addRow(["", "", "", "", "", "", "Total", hitos.reduce((s, h) => s + h.valor, 0)]);
  total.font = { bold: true };
  total.getCell(8).numFmt = '"$" #,##0';

  hoja.columns = [
    { width: 14 }, { width: 32 }, { width: 14 }, { width: 32 }, { width: 9 }, { width: 6 }, { width: 44 },
    { width: 13 }, { width: 14 }, { width: 13 }, { width: 28 }, { width: 13 }, { width: 24 },
  ];
  hoja.views = [{ state: "frozen", ySplit: 5 }];
  hoja.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: cols.length } };
  return Buffer.from(await libro.xlsx.writeBuffer());
}
