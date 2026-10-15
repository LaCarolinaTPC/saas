// Libro Excel del reporte de rechazos por fase (solo servidor, exceljs).
// Mismas cifras que la pantalla: salen de resumirRechazos.

import ExcelJS from "exceljs";
import { ORIGEN_LABEL, SIN_FASE, type Conteo, type FilaRechazo, type ResumenRechazos } from "./reporte";
import type { FiltrosRechazos } from "./datos";

const INDIGO = "FF4F46E5";
const GRIS_FILA = "FFF8FAFC";

function cabecera(hoja: ExcelJS.Worksheet, fila: number, titulos: string[]) {
  const r = hoja.getRow(fila);
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  r.height = 18;
}

function cebra(r: ExcelJS.Row, i: number) {
  if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_FILA } }; });
}

function hojaConteo(libro: ExcelJS.Workbook, nombre: string, dimension: string, conteos: Conteo[]) {
  const hoja = libro.addWorksheet(nombre);
  cabecera(hoja, 1, [dimension, "Rechazos", "% del total"]);
  conteos.forEach((c, i) => {
    const r = hoja.addRow([c.etiqueta, c.total, c.pct / 100]);
    r.getCell(3).numFmt = "0.0%";
    cebra(r, i);
  });
  hoja.columns = [{ width: 40 }, { width: 12 }, { width: 12 }];
  hoja.views = [{ state: "frozen", ySplit: 1 }];
}

const fmtFecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });
const fmtFechaHora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });

export function nombreArchivoRechazos(f: FiltrosRechazos) {
  return `rechazos-por-fase_${f.desde}_${f.hasta}`;
}

export async function construirExcelRechazos({ resumen, filas, filtros }: {
  resumen: ResumenRechazos;
  filas: FilaRechazo[];
  filtros: FiltrosRechazos;
}): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Gestivo · La Carolina De Transporte";
  libro.created = new Date();
  const r = resumen;

  // ── Resumen ──────────────────────────────────────────────────────────────
  const res = libro.addWorksheet("Resumen");
  res.columns = [{ width: 34 }, { width: 22 }, { width: 90 }];
  res.getCell("A1").value = "Rechazos de candidatos por fase · Reclutamiento";
  res.getCell("A1").font = { bold: true, size: 14 };
  res.getCell("A2").value = `Del ${filtros.desde} al ${filtros.hasta} · Vacante: ${filtros.vacante ?? "todas"}`;
  res.getCell("A2").font = { color: { argb: "FF64748B" } };
  res.getCell("A3").value = `Generado: ${fmtFechaHora.format(new Date())}`;
  res.getCell("A3").font = { color: { argb: "FF64748B" } };

  cabecera(res, 5, ["Indicador", "Valor"]);
  const kpis: [string, number][] = [
    ["Rechazos", r.total],
    ["Sin fase registrada", r.sinFase],
    ["Sin causa registrada", r.sinCausa],
    ["Reactivados (no cuentan)", r.revertidos],
  ];
  kpis.forEach(([k, v]) => res.addRow([k, v]));

  const filaAnalisis = 5 + kpis.length + 2;
  res.getCell(filaAnalisis, 1).value = "Análisis";
  res.getCell(filaAnalisis, 1).font = { bold: true, size: 12 };
  r.analisis.forEach((a, i) => {
    const fila = filaAnalisis + 1 + i;
    res.getCell(fila, 1).value = `• ${a}`;
    res.getCell(fila, 1).alignment = { wrapText: true, vertical: "top" };
    res.mergeCells(fila, 1, fila, 3);
    res.getRow(fila).height = Math.max(15, Math.ceil(a.length / 110) * 15);
  });

  hojaConteo(libro, "Por fase", "Fase", r.porFase);
  hojaConteo(libro, "Por causa", "Causa", r.porCausa);

  // ── Fase × causa ─────────────────────────────────────────────────────────
  const mat = libro.addWorksheet("Fase x causa");
  const { fases, causas, celdas } = r.matriz;
  cabecera(mat, 1, ["Fase", ...causas.map((c) => c.etiqueta), "Total"]);
  fases.forEach((f, i) => {
    const row = mat.addRow([f.etiqueta, ...celdas[i], f.total]);
    row.getCell(causas.length + 2).font = { bold: true };
    cebra(row, i);
  });
  mat.addRow(["Total", ...causas.map((c) => c.total), r.total]).font = { bold: true };
  mat.columns = [{ width: 30 }, ...causas.map(() => ({ width: 16 })), { width: 10 }];
  mat.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  // ── Mensual y por vacante ────────────────────────────────────────────────
  const men = libro.addWorksheet("Por mes");
  cabecera(men, 1, ["Mes", "Rechazos"]);
  r.mensual.forEach((m, i) => cebra(men.addRow([m.mes, m.total]), i));
  men.columns = [{ width: 12 }, { width: 12 }];

  hojaConteo(libro, "Por vacante", "Vacante", r.porVacante);

  // ── Detalle: todas las filas, también las reactivadas ────────────────────
  const det = libro.addWorksheet("Detalle");
  const cols = [
    "Fecha", "Nombre", "Cédula", "Vacante", "Fase", "Causa", "Detalle", "Origen", "Registró",
    "Estado", "Reactivado el", "Reactivado por", "Volvió a",
  ];
  cabecera(det, 1, cols);
  filas.forEach((f, i) => {
    const row = det.addRow([
      fmtFecha.format(new Date(f.registrado_at)),
      f.nombre ?? "",
      f.cedula ?? "",
      f.vacante ?? "",
      f.fase_origen_label ?? f.fase_origen ?? SIN_FASE,
      f.causa ?? "",
      f.nota ?? "",
      ORIGEN_LABEL[f.origen] ?? f.origen,
      f.registrado_por_email ?? "",
      f.revertido_at ? "Reactivado" : "Vigente",
      f.revertido_at ? fmtFecha.format(new Date(f.revertido_at)) : "",
      f.revertido_por_email ?? "",
      f.revertido_a_fase ?? "",
    ]);
    cebra(row, i);
  });
  det.columns = [
    { width: 12 }, { width: 32 }, { width: 14 }, { width: 24 }, { width: 22 }, { width: 28 }, { width: 50 },
    { width: 22 }, { width: 28 }, { width: 12 }, { width: 14 }, { width: 28 }, { width: 18 },
  ];
  det.views = [{ state: "frozen", ySplit: 1 }];
  det.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  return Buffer.from(await libro.xlsx.writeBuffer());
}
