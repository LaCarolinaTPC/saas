// Excel del consolidado de la revisión de timbradas: avance por día, por
// estado y por revisor del periodo, con el estado del día en color.

import ExcelJS from "exceljs";
import { ETIQUETA_ESTADO_DIA, type Consolidado, type EstadoDia } from "./revision-timbradas-consolidado";

const relleno = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const COLOR_DIA: Record<EstadoDia, string> = {
  cerrado: "C6EFCE", completo: "E2EFDA", sin_pendientes: "E2EFDA", reabierto: "FFE699",
  en_curso: "FFF2CC", sin_revisar: "FFD9D9", sin_calculo: "F2F2F2",
};
const fh = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : null;

function hoja(wb: ExcelJS.Workbook, nombre: string, titulo: string, encabezados: [string, number][], filas: (string | number | null)[][], color?: (i: number) => string | null) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 2 }] });
  ws.columns = encabezados.map(([, w]) => ({ width: w }));
  ws.mergeCells(1, 1, 1, encabezados.length);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  t.fill = relleno("1F4E79");
  const enc = ws.getRow(2);
  encabezados.forEach(([h], i) => {
    const c = enc.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = relleno("2E75B6");
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  filas.forEach((f, i) => {
    const r = ws.addRow(f);
    const hex = color?.(i);
    r.eachCell((c) => { c.font = { size: 10 }; if (hex) c.fill = relleno(hex); });
  });
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: encabezados.length } };
}

export async function libroConsolidadoTimbradas(c: Consolidado, generado: string): Promise<{ buffer: ArrayBuffer; archivo: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestivo";
  const t = c.totales;
  const periodo = `${c.desde} a ${c.hasta}`;

  hoja(wb, "Resumen", `Consolidado de revisión de timbradas — ${periodo}`, [["Indicador", 40], ["Valor", 14]], [
    ["Generado en Gestivo", generado],
    ["Días del periodo", t.dias],
    ["Viajes por revisar", t.porRevisar],
    ["Revisados (check)", t.revisados],
    ["Pendientes", t.pendientes],
    ["Nuevos tras cierre", t.nuevosTrasCierre],
    ["Avance %", t.avance],
    ["Días cerrados", t.diasCerrados],
    ["Días completos sin cerrar", t.diasCompletos],
    ["Días con pendientes", t.diasConPendientes],
    ["Días sin cálculo guardado", t.diasSinCalcular],
  ]);

  hoja(wb, "Avance por día", `Avance por día — ${periodo}`, [
    ["Fecha", 12], ["Estado del día", 16], ["Viajes", 9], ["Por revisar", 11], ["Revisados", 11], ["Pendientes", 11],
    ["Nuevos tras cierre", 12], ["Avance %", 10], ["Diferencias pend.", 12], ["Alertas", 9], ["Revisó", 36],
    ["Último check", 18], ["Cerrado por", 30], ["Cerrado el", 18], ["Calculado el", 18],
  ], c.dias.map((d) => [
    d.fecha, ETIQUETA_ESTADO_DIA[d.estadoDia], d.totalViajes, d.porRevisar, d.revisados, d.pendientes, d.nuevosTrasCierre,
    d.avance, d.pendientesPorEstado["Diferencia Por Revisar"] ?? 0, d.alertas, d.revisores.join(", "),
    fh(d.ultimoCheck), d.cierre?.cerradoPorEmail ?? null, fh(d.cierre?.cerradoAt), fh(d.calculadoAt),
  ]), (i) => COLOR_DIA[c.dias[i].estadoDia]);

  hoja(wb, "Por estado", `Por estado — ${periodo}`, [["Estado", 32], ["Por revisar", 12], ["Revisados", 12], ["Pendientes", 12], ["Avance %", 10]],
    c.porEstado.map((e) => [e.estado, e.porRevisar, e.revisados, e.pendientes, e.avance]));

  hoja(wb, "Por revisor", `Por revisor — ${periodo}`, [["Revisor", 34], ["Checks", 10], ["Días con checks", 14], ["Días cerrados", 13], ["Primer check", 18], ["Último check", 18]],
    c.porRevisor.map((r) => [r.email, r.checks, r.dias, r.diasCerrados, r.checks ? fh(r.primerCheck) : null, r.checks ? fh(r.ultimoCheck) : null]));

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, archivo: `Consolidado_Revision_Timbradas_${c.desde}_a_${c.hasta}` };
}
