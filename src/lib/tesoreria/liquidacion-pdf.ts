// Liquidación de un afiliado en PDF con la forma del reporte GEMA GAF-R-12:
// una página por vehículo con la tabla diaria, la fila TOTAL, el recuadro de
// deducciones, base, total y líquido, y la línea de "Recibido". Se genera en
// el navegador con jsPDF + autotable, como los demás informes del sistema.

import type { UserOptions } from "jspdf-autotable";
import {
  LOGO, MARGEN, PIE_ALTO, TOTAL_PAGINAS, ahoraBogota, cargarLogo, dibujarEncabezado, dibujarPie, saneaWinAnsi,
  type DocConAutoTable,
} from "@/lib/exportar/pdf-tabla";
import {
  COLUMNAS_DIA, detalleObligaciones, etiquetaNeto, lineasDeducciones, prefijoCierre, valorNeto, type LiquidacionAfiliado,
} from "./liquidacion-afiliados";
import { cifra, pesos } from "./formato-liquidacion";

export interface ContextoLiquidacionPdf {
  liquidacion: LiquidacionAfiliado;
  codigo: string | null;
  plazo: string;
  desde: string;
  hasta: string;
  /** "Semana del 21 al 27 sep 2026 · pago mar 29 sep 2026", si el rango es un periodo. */
  periodo: string | null;
}

export function nombreArchivoLiquidacion(c: ContextoLiquidacionPdf): string {
  return `liquidacion_${c.codigo ?? c.liquidacion.cedula}_${c.desde}_a_${c.hasta}`;
}

export async function exportarLiquidacionPdf(c: ContextoLiquidacionPdf): Promise<void> {
  const [{ jsPDF: JsPDF }, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable").then((m) => m.default),
  ]);
  const logo = await cargarLogo(LOGO);
  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "letter" }) as DocConAutoTable;
  const generado = ahoraBogota();
  const l = c.liquidacion;
  const encabezado = {
    modulo: "Tesorería · GAF-R-12",
    titulo: `Reporte de liquidación tercero ${c.desde} - ${c.hasta}`,
    contexto: [
      `Propietario: ${l.cedula} ${l.nombre ?? ""}${c.codigo ? ` (${c.codigo})` : ""} · Plazo: ${c.plazo}`,
      ...(c.periodo ? [c.periodo] : []),
    ],
  };
  doc.setProperties({ title: `Liquidación ${l.nombre ?? l.cedula} ${c.desde} a ${c.hasta}`, author: "La Carolina De Transporte", creator: "Gestivo" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  const vehiculos = l.vehiculos;
  if (vehiculos.length === 0) {
    const y = dibujarEncabezado(doc, encabezado, logo, generado);
    doc.setFontSize(10);
    doc.text("Sin cierres de afiliado en el rango.", MARGEN, y + 6);
  }

  vehiculos.forEach((v, i) => {
    if (i > 0) doc.addPage();
    let y = dibujarEncabezado(doc, encabezado, logo, generado);
    // En las páginas siguientes la tabla arranca bajo el mismo encabezado.
    const finEncabezado = y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(saneaWinAnsi(`Vehículo: ${v.codigo}${v.placa ? `   ·   ${v.placa}` : ""}`), MARGEN, y + 4);
    y += 8;

    const cabeza = ["Fecha", "Conduc", ...COLUMNAS_DIA.map((c) => c.titulo)].map(saneaWinAnsi);
    const cuerpo = v.filas.map((f) => [
      `${prefijoCierre(f.tipo_cierre)} - ${f.fecha}`,
      f.codigo_conductor ?? "",
      ...COLUMNAS_DIA.map((c) => cifra(f[c.campo] as number | null, c.formato)),
    ].map(saneaWinAnsi));
    const total = ["", "TOTAL:", ...COLUMNAS_DIA.map((c) => cifra(v.total[c.campo], c.formato))].map(saneaWinAnsi);
    const columnStyles: NonNullable<UserOptions["columnStyles"]> = { 0: { cellWidth: 30 }, 1: { cellWidth: 12 } };
    COLUMNAS_DIA.forEach((_, k) => { columnStyles[k + 2] = { halign: "right" }; });
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEN, right: MARGEN, bottom: PIE_ALTO, top: finEncabezado },
      head: [cabeza],
      body: cuerpo,
      foot: [total],
      styles: { font: "helvetica", fontSize: 6.3, cellPadding: 0.8 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", halign: "right" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      showHead: "everyPage",
      showFoot: "lastPage",
      // columnStyles no alcanza al encabezado: las cifras se alinean igual que su columna.
      didParseCell: (d) => {
        if (d.section === "head" && d.column.index >= 2) d.cell.styles.halign = "right";
      },
      didDrawPage: (d) => {
        if (d.pageNumber > 1) dibujarEncabezado(doc, encabezado, logo, generado);
      },
    });

    // Recuadros de resumen, como en el reporte de GEMA.
    let yr = (doc.lastAutoTable?.finalY ?? y) + 6;
    if (yr > alto - PIE_ALTO - 62) { doc.addPage(); yr = dibujarEncabezado(doc, encabezado, logo, generado); }
    const lineas = lineasDeducciones(v.resumen);
    const r = v.resumen;
    const sinObligaciones = r.obligaciones === null;
    const marca = sinObligaciones || r.obligacionesParciales ? " *" : "";
    autoTable(doc, {
      startY: yr,
      margin: { left: MARGEN },
      tableWidth: 90,
      head: [["DETALLES DEDUCCIONES", "VALOR"]],
      body: [
        ...lineas.map((x) => [saneaWinAnsi(x.etiqueta.toUpperCase()), pesos(x.valor)]),
        sinObligaciones
          ? [{ content: "PAGO OBLIGACIONES", styles: { textColor: 130 } }, { content: "sin dato", styles: { textColor: 130 } }]
          : [`PAGO OBLIGACIONES${marca}`, pesos(r.obligaciones!)],
      ],
      foot: [[`TOTAL DEDUCCIONES${marca}`, pesos(r.totalDeducciones)]],
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 0.9 },
      headStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" } },
    });
    const x0 = MARGEN + 100;
    const caja = (x: number, yy: number, w: number, titulo: string, valor: string) => {
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.rect(x, yy, w, 16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(saneaWinAnsi(titulo), x + w / 2, yy + 5, { align: "center" });
      doc.setFontSize(12);
      doc.text(saneaWinAnsi(valor), x + w / 2, yy + 12.5, { align: "center" });
    };
    caja(x0, yr, 55, "BASE LIQUIDACION", pesos(v.resumen.base));
    caja(x0 + 60, yr, 55, `TOTAL DEDUCCIONES${marca}`, pesos(r.totalDeducciones));
    caja(x0 + 30, yr + 22, 55, etiquetaNeto(r).toUpperCase(), pesos(valorNeto(r)));
    // "Detalle descuentos otros": el pago de obligaciones por fecha.
    const detalle = detalleObligaciones(v.filas);
    // Va debajo de los recuadros, con el ancho de los dos de arriba.
    let yNota = yr + 44;
    if (detalle.length) {
      autoTable(doc, {
        startY: yr + 44,
        margin: { left: x0 },
        tableWidth: 115,
        head: [["FECHA", "DESCUENTOS OTROS"]],
        body: detalle.map((d) => [d.fecha, pesos(d.valor)]),
        styles: { font: "helvetica", fontSize: 7.5, cellPadding: 0.9 },
        headStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" } },
      });
      yNota = (doc.lastAutoTable?.finalY ?? yNota) + 4;
    }
    if (marca) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(90);
      const nota = doc.splitTextToSize(
        saneaWinAnsi(sinObligaciones
          ? "* Sin pago de obligaciones (descuentos otros): estos días se sincronizaron antes de que Gestivo guardara ese campo. Producido neto = líquido - pago de obligaciones."
          : "* Parte de los días no trae el pago de obligaciones (descuentos otros): el total puede quedarse corto."),
        ancho - x0 - MARGEN,
      ) as string[];
      doc.text(nota, x0, yNota);
      doc.setTextColor(0);
    }
    doc.setFontSize(8);
    doc.text(
      saneaWinAnsi(`Buseta: ${v.codigo}    Propietario: ${l.cedula} ${l.nombre ?? ""}    Periodo: ${c.desde} - ${c.hasta}    Recibido: ______________________________`),
      MARGEN, alto - PIE_ALTO - 2,
    );
  });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    dibujarPie(doc, p, TOTAL_PAGINAS);
  }
  doc.putTotalPages(TOTAL_PAGINAS);
  doc.save(`${nombreArchivoLiquidacion(c)}.pdf`);
}
