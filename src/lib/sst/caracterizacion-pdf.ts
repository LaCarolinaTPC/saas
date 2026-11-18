import type { UserOptions } from "jspdf-autotable";
import type { InformeCaracterizacion } from "./caracterizacion-exportar";
import {
  cargarLogo, dibujarEncabezado, dibujarPie, saneaWinAnsi,
  MARGEN, PIE_ALTO, TOTAL_PAGINAS, type DocConAutoTable,
} from "@/lib/exportar/pdf-tabla";

/** Rasteriza solo el SVG de la silueta, no la página ni información oculta. */
export async function imagenSilueta(svg: SVGSVGElement): Promise<string> {
  const copia = svg.cloneNode(true) as SVGSVGElement;
  copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copia.setAttribute("width", "920");
  copia.setAttribute("height", "940");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const imagen = new Image();
    await new Promise<void>((resolve, reject) => {
      imagen.onload = () => resolve();
      imagen.onerror = () => reject(new Error("No se pudo generar la silueta del informe."));
      imagen.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 920;
    canvas.height = 940;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no permite generar la imagen del informe.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Constructor separado de la descarga para verificar el documento sin navegador. */
export async function crearPdfCaracterizacion(inf: InformeCaracterizacion, silueta: string | null, logo: string | null): Promise<DocConAutoTable> {
  const [{ jsPDF: JsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new JsPDF({ unit: "mm", format: "letter" }) as DocConAutoTable;
  const encabezado = {
    modulo: "Recursos Humanos - SST",
    titulo: "Caracterización de la accidentalidad",
    contexto: [inf.filtros],
  };
  doc.setProperties({ title: encabezado.titulo, subject: inf.filtros, author: "La Carolina De Transporte", creator: "Gestivo" });
  const ancho = doc.internal.pageSize.getWidth() - MARGEN * 2;
  const limite = doc.internal.pageSize.getHeight() - PIE_ALTO;
  let inicio = 0;
  let primera = true;
  function pagina(titulo: string): number {
    if (!primera) doc.addPage();
    primera = false;
    inicio = dibujarEncabezado(doc, encabezado, logo, inf.generado);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(saneaWinAnsi(titulo), MARGEN, inicio + 5);
    return inicio + 10;
  }
  function tabla(cabecera: string[], filas: (string | number)[][], y: number) {
    if (y > limite - 18) {
      doc.addPage();
      inicio = dibujarEncabezado(doc, encabezado, logo, inf.generado);
      y = inicio;
    }
    autoTable(doc, {
      startY: y,
      margin: { top: inicio, left: MARGEN, right: MARGEN, bottom: PIE_ALTO },
      head: [cabecera.map(saneaWinAnsi)],
      body: filas.map((f) => f.map(saneaWinAnsi)),
      styles: { font: "helvetica", fontSize: 8, cellPadding: 1.7, overflow: "linebreak" },
      headStyles: { fillColor: [79, 70, 229] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      rowPageBreak: "avoid",
      showHead: "everyPage",
      didDrawPage: ((data) => {
        if (data.pageNumber > 1) dibujarEncabezado(doc, encabezado, logo, inf.generado);
      }) satisfies UserOptions["didDrawPage"],
    });
  }

  let y = pagina("Resumen de la consulta");
  tabla(["Indicador", "Valor", "Detalle"], inf.resumen.map((r) => [r.indicador, r.valor, r.detalle]), y);
  y = (doc.lastAutoTable?.finalY ?? y) + 8;
  tabla(["Sexo", "Accidentes", "%"], (inf.distribuciones.find((d) => d.titulo === "Sexo")?.datos ?? []).map((r) => [r.label, r.n, r.pct]), y);

  if (silueta) {
    y = pagina("Partes del cuerpo afectadas");
    const alto = Math.min(180, limite - y - 12);
    const w = alto * 460 / 470;
    doc.addImage(silueta, "PNG", MARGEN + (ancho - w) / 2, y, w, alto);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Menos a más accidentes: naranja claro a oscuro. Sin casos: gris.", MARGEN, y + alto + 5);
    // Las categorías sin zona anatómica también están en la tabla siguiente.
  }

  for (const distribucion of inf.distribuciones) {
    y = pagina(distribucion.titulo);
    const visibles = distribucion.datos.filter((r) => r.n > 0);
    const max = Math.max(...visibles.map((r) => r.n), 1);
    doc.setFontSize(8);
    for (const r of visibles) {
      const lineas = doc.splitTextToSize(saneaWinAnsi(r.label), 78) as string[];
      const alto = Math.max(8, lineas.length * 3.5 + 3);
      if (y + alto > limite - 8) y = pagina(`${distribucion.titulo} (continuación)`);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(15);
      doc.text(lineas, MARGEN, y + 3);
      const w = (ancho - 112) * r.n / max;
      doc.setFillColor(235, 104, 52);
      doc.roundedRect(MARGEN + 80, y, Math.max(w, 0.5), 4, 0.5, 0.5, "F");
      doc.text(`${r.n} (${r.pct}%)`, MARGEN + 82 + w, y + 3);
      y += alto;
    }
    tabla(
      ["Categoría", "Accidentes", "%"],
      [...distribucion.datos.map((r) => [r.label, r.n, r.pct]), ["TOTAL", inf.total, inf.total ? 100 : 0]],
      y + 4,
    );
  }
  y = pagina("Trabajadores con más de un accidente");
  tabla(["Trabajador", "Accidentes"], inf.repetidos.length ? inf.repetidos.map((r) => [r.nombre, r.n]) : [["Ningún trabajador repite", 0]], y);
  // Se dibuja al final para cubrir también las páginas creadas por las tablas.
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    dibujarPie(doc, p);
  }
  doc.putTotalPages(TOTAL_PAGINAS);
  return doc;
}

export async function descargarCaracterizacionPdf(inf: InformeCaracterizacion, svg: SVGSVGElement | null, archivo: string): Promise<void> {
  if (!svg) throw new Error("No se encontró la silueta corporal. Vuelva a intentar la descarga.");
  const [silueta, logo] = await Promise.all([imagenSilueta(svg), cargarLogo()]);
  const doc = await crearPdfCaracterizacion(inf, silueta, logo);
  doc.save(`${archivo}.pdf`);
}
