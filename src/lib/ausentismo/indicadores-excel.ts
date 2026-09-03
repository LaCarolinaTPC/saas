// Libro Excel de los indicadores de ausentismo (solo servidor, exceljs).
//
// Una hoja de resumen con filtros, indicadores globales y análisis; una hoja
// por corte con la lista completa (el "Top" es cosa de la pantalla y del PDF,
// el Excel es para analizar); y una hoja de detalle con las filas filtradas.
// Las librerías instaladas no crean gráficos nativos de Excel: van tablas.

import ExcelJS from "exceljs";
import {
  CORTES, type Indicadores, type Grupo, type FilaIndicador, type CorteId,
} from "./indicadores";
import { describirFiltros, type FiltrosInformeIndicadores } from "./indicadores-pdf";

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

function hojaCorte(libro: ExcelJS.Workbook, nombre: string, dimension: string, grupos: Grupo[], conTrabajadores: boolean) {
  const hoja = libro.addWorksheet(nombre.slice(0, 31));
  const cols = [dimension, "Detalle", "Incapacidades", "Prórrogas", "Días perdidos", "Días por incapacidad", "% días", ...(conTrabajadores ? ["Trabajadores"] : [])];
  cabecera(hoja, 1, cols);
  grupos.forEach((g, i) => {
    const r = hoja.addRow([
      g.etiqueta, g.detalle ?? "", g.eventos, g.prorrogas, g.dias, g.promedio, g.pctDias / 100,
      ...(conTrabajadores ? [g.trabajadores] : []),
    ]);
    r.getCell(7).numFmt = "0.0%";
    if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_FILA } }; });
  });
  hoja.columns = [
    { width: 36 }, { width: 40 }, { width: 14 }, { width: 11 }, { width: 14 }, { width: 18 }, { width: 9 },
    ...(conTrabajadores ? [{ width: 13 }] : []),
  ];
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

export async function construirExcelIndicadores({ indicadores, filtros, filas }: {
  indicadores: Indicadores;
  filtros: FiltrosInformeIndicadores;
  filas: FilaIndicador[];
}): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Gestivo · La Carolina De Transporte";
  libro.created = new Date();
  const ind = indicadores;
  const t = ind.totales;

  // ── Resumen ──────────────────────────────────────────────────────────────
  const res = libro.addWorksheet("Resumen");
  res.columns = [{ width: 34 }, { width: 22 }, { width: 90 }];
  res.getCell("A1").value = "Indicadores de ausentismo · Recursos Humanos";
  res.getCell("A1").font = { bold: true, size: 14 };
  res.getCell("A2").value = describirFiltros(filtros)[0].replace(/\s+·\s+/g, " · ");
  res.getCell("A2").font = { color: { argb: "FF64748B" } };
  res.getCell("A3").value = `Generado: ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date())}`;
  res.getCell("A3").font = { color: { argb: "FF64748B" } };

  cabecera(res, 5, ["Indicador", "Valor"]);
  const kpis: [string, number | string][] = [
    ["Incapacidades", t.eventos],
    ["Días perdidos", t.dias],
    ["Días por incapacidad", t.promedio],
    ["Trabajadores afectados", t.trabajadores],
    ["Trabajadores activos hoy", t.activos ?? "—"],
    ["% afectados sobre activos", t.pctAfectados != null ? `${t.pctAfectados}%` : "—"],
    ["Prórrogas", t.prorrogas],
    ["% prórrogas", `${t.pctProrrogas}%`],
  ];
  kpis.forEach(([k, v]) => res.addRow([k, v]));

  const filaAnalisis = 5 + kpis.length + 2;
  res.getCell(filaAnalisis, 1).value = "Análisis";
  res.getCell(filaAnalisis, 1).font = { bold: true, size: 12 };
  ind.analisis.forEach((a, i) => {
    const c = res.getCell(filaAnalisis + 1 + i, 1);
    c.value = `• ${a}`;
    c.alignment = { wrapText: true, vertical: "top" };
    res.mergeCells(filaAnalisis + 1 + i, 1, filaAnalisis + 1 + i, 3);
    res.getRow(filaAnalisis + 1 + i).height = Math.max(15, Math.ceil(a.length / 110) * 15);
  });

  // ── Mensual ──────────────────────────────────────────────────────────────
  const conTasa = t.activos != null;
  const mensual = libro.addWorksheet("Mensual");
  cabecera(mensual, 1, ["Mes", "Incapacidades", "Prórrogas", "Días perdidos", "Días por incapacidad", "% días", "Trabajadores", ...(conTasa ? ["Tasa de ausentismo"] : [])]);
  ind.mensual.forEach((m) => {
    const r = mensual.addRow([m.mes, m.eventos, m.prorrogas, m.dias, m.promedio, m.pctDias / 100, m.trabajadores, ...(conTasa ? [(m.tasa ?? 0) / 100] : [])]);
    r.getCell(6).numFmt = "0.0%";
    if (conTasa) r.getCell(8).numFmt = "0.00%";
    if (m.parcial) r.getCell(1).value = `${m.mes} (parcial)`;
  });
  mensual.columns = [{ width: 16 }, { width: 14 }, { width: 11 }, { width: 14 }, { width: 18 }, { width: 9 }, { width: 13 }, ...(conTasa ? [{ width: 18 }] : [])];
  mensual.views = [{ state: "frozen", ySplit: 1 }];

  // ── Un corte por hoja ────────────────────────────────────────────────────
  for (const c of CORTES.filter((x) => x.id !== "mensual")) {
    const id = c.id as Exclude<CorteId, "mensual">;
    hojaCorte(libro, c.titulo.replace("Ausentismo por ", "Por "), c.dimension, ind[id], id !== "trabajador");
  }

  // ── Detalle: las filas filtradas ─────────────────────────────────────────
  const det = libro.addWorksheet("Detalle");
  cabecera(det, 1, [
    "Fecha inicio", "Días", "Indicador", "Origen", "EPS", "ARL", "IPS", "Profesional", "CIE10", "Diagnóstico", "GRD",
    "Cédula", "Nombre", "Cargo", "Tipo",
  ]);
  for (const f of filas) {
    det.addRow([
      f.fecha_inicio ? new Date(`${f.fecha_inicio}T00:00:00`) : null, f.dias_it_pagados, f.indicador_prorroga, f.origen,
      f.eps, f.arl, f.ips, f.profesional_responsable, f.cie10, f.diagnostico, f.grd, f.cedula, f.nombre, f.cargo, f.tipo_conductor,
    ]);
  }
  det.getColumn(1).numFmt = "yyyy-mm-dd";
  det.columns = [
    { width: 12 }, { width: 6 }, { width: 11 }, { width: 8 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 30 },
    { width: 8 }, { width: 40 }, { width: 24 }, { width: 13 }, { width: 32 }, { width: 18 }, { width: 14 },
  ];
  det.views = [{ state: "frozen", ySplit: 1 }];
  det.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 15 } };

  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
