"use client";

import { BotonesExportar } from "@/components/ui/botones-exportar";
import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla } from "@/lib/exportar/pdf-tabla";
import type { FormatoExport } from "@/lib/exportar/formatos";
import { textoCelda, type InformeFlota } from "@/lib/financiera/exportar";

/**
 * Descargas de lo que se ve, con los filtros aplicados. El informe lo arma el
 * servidor (src/lib/financiera/exportar.ts) con los valores en crudo; aquí
 * solo se baja a cada formato en el navegador.
 *
 * PDF y CSV llevan el valor ya formateado (pesos enteros, dos decimales);
 * Excel lleva el número limpio con su formato de celda, para poder sumar y
 * filtrar sin limpiar nada.
 */
export function ExportarFlota({ informe }: { informe: InformeFlota }) {
  async function exportar(formato: FormatoExport) {
    if (formato === "csv") return csv(informe);
    if (formato === "xlsx") return excel(informe);
    return pdf(informe);
  }
  return <BotonesExportar sinDatos={informe.filas.length === 0} onExportar={exportar} formatos={["pdf", "xlsx", "csv"]} />;
}

function csv(inf: InformeFlota) {
  const filas: CeldaCsv[][] = [
    [inf.modulo],
    [inf.titulo],
    ...inf.contexto.map((c) => [c]),
    ...(inf.resumen.length ? [[inf.resumen.join(" · ")]] : []),
    [],
    inf.columnas.map((c) => c.titulo),
    ...inf.filas.map((f) => f.map((v, i) => textoCelda(v, inf.columnas[i].tipo))),
    [],
    ...inf.notas.map((n) => [n]),
  ];
  descargarCsv(`${inf.archivo}.csv`, filas);
}

/**
 * La fuente del PDF (Helvetica con WinAnsi) no tiene los símbolos ≤, ≥, ≈ ni
 * Σ: jsPDF los dibuja como un hueco y la advertencia de «es un techo» se
 * pierde justo donde más importa. Se cambian por su equivalente en letras.
 */
function sanearPdf(t: string): string {
  return t
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≈/g, "~")
    .replace(/Σ/g, "suma de")
    .replace(/−/g, "-");
}

async function pdf(inf: InformeFlota) {
  await descargarPdfTabla({
    archivo: inf.archivo,
    modulo: inf.modulo,
    titulo: inf.titulo,
    contexto: inf.contexto.map(sanearPdf),
    resumen: inf.resumen.map(sanearPdf),
    columnas: inf.columnas.map((c) => ({
      titulo: sanearPdf(c.titulo),
      ancho: c.ancho,
      alinear: c.tipo === "texto" ? "left" : "right",
    })),
    filas: inf.filas.map((f) => f.map((v, i) => sanearPdf(textoCelda(v, inf.columnas[i].tipo)))),
    notas: inf.notas.map(sanearPdf),
    orientacion: inf.orientacion ?? "landscape",
    vacio: "No hay vehículos con movimiento en el rango elegido.",
  });
}

/** Formato de celda de Excel por tipo de columna. */
const NUM_FMT: Record<string, string | undefined> = {
  cop: '"$" #,##0',
  entero: "#,##0",
  decimal: "#,##0.0",
  pct: '#,##0.00 "%"',
  texto: undefined,
};

/**
 * Decimales con los que se guarda cada tipo. Las sumas de la base arrastran
 * ruido de coma flotante (1.391.693.817,6000001) que la pantalla no muestra
 * pero Excel sí en cuanto alguien quita el formato o suma una columna.
 */
const DECIMALES: Record<string, number | undefined> = {
  cop: 2,
  pct: 2,
  decimal: 1,
  entero: 0,
  texto: undefined,
};

function redondear(v: number, tipo: string): number {
  const d = DECIMALES[tipo];
  if (d == null) return v;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

async function excel(inf: InformeFlota) {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  libro.creator = "Gestivo · Financiera";
  libro.created = new Date();

  const hoja = libro.addWorksheet("Detalle", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = inf.columnas.map((c) => ({
    header: c.titulo,
    width: Math.max(12, Math.min(34, c.titulo.length + (c.tipo === "cop" ? 10 : 4))),
  }));
  const cabecera = hoja.getRow(1);
  cabecera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecera.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  cabecera.alignment = { vertical: "middle" };

  for (const f of inf.filas) {
    const fila = hoja.addRow(
      f.map((v, i) => (v == null ? "" : typeof v === "number" ? redondear(v, inf.columnas[i].tipo) : v))
    );
    f.forEach((v, i) => {
      const celda = fila.getCell(i + 1);
      const fmt = NUM_FMT[inf.columnas[i].tipo];
      if (fmt && typeof v === "number") {
        celda.numFmt = fmt;
        if (v < 0) celda.font = { color: { argb: "FFDC2626" } };
      }
      if (inf.columnas[i].tipo !== "texto") celda.alignment = { horizontal: "right" };
    });
  }
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: inf.columnas.length } };

  // Hoja aparte con el contexto: qué filtros, qué totales y las advertencias.
  const info = libro.addWorksheet("Informe");
  info.columns = [{ width: 22 }, { width: 110 }];
  info.addRow(["Módulo", inf.modulo]);
  info.addRow(["Informe", inf.titulo]);
  info.addRow(["Generado", new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })]);
  info.addRow([]);
  info.addRow(["Filtros", ""]).font = { bold: true };
  for (const c of inf.contexto) info.addRow(["", c]);
  if (inf.resumen.length) {
    info.addRow([]);
    info.addRow(["Totales", ""]).font = { bold: true };
    for (const r of inf.resumen) info.addRow(["", r]);
  }
  if (inf.notas.length) {
    info.addRow([]);
    info.addRow(["Advertencias", ""]).font = { bold: true };
    for (const n of inf.notas) {
      const fila = info.addRow(["", n]);
      fila.getCell(2).alignment = { wrapText: true, vertical: "top" };
      fila.height = Math.max(15, Math.ceil(n.length / 95) * 14);
    }
  }
  info.getColumn(1).font = { bold: true };

  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${inf.archivo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
