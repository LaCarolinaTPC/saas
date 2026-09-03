// Informe tabular en PDF, generado en el navegador con jsPDF + autotable.
//
// Encabezado con logo, módulo y título, líneas de contexto (los filtros con
// los que se sacó el informe) y la marca de generación. La tabla repite sus
// encabezados en cada página y el pie lleva "Página N de M". Sirve para
// cualquier listado del sistema: Ausentismo lo usa para sus tres vistas.

import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

export type CeldaPdf = string | number | null | undefined;

export type ColumnaPdf = {
  titulo: string;
  /** Ancho en mm; sin ancho la columna se reparte el espacio restante. */
  ancho?: number;
  alinear?: "left" | "center" | "right";
};

export type InformePdf = {
  /** Nombre del archivo sin extensión. */
  archivo: string;
  modulo: string;
  titulo: string;
  /** Líneas bajo el título: rango, filtros, criterio. */
  contexto: string[];
  columnas: ColumnaPdf[];
  filas: CeldaPdf[][];
  /** Totales o fichas que van antes de la tabla, en una sola línea. */
  resumen?: string[];
  /** Advertencias al final del documento. */
  notas?: string[];
  orientacion?: "portrait" | "landscape";
  /** Texto de la fila única cuando no hay datos. */
  vacio?: string;
};

export type DocConAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

/** Lo que necesita el encabezado de página; `InformePdf` lo cumple. */
export type EncabezadoPdf = Pick<InformePdf, "modulo" | "titulo" | "contexto" | "resumen">;

export const LOGO = "/sgc/logo-formato.png";
const LOGO_RATIO = 166 / 300;
export const MARGEN = 10;
export const PIE_ALTO = 12;
/** Marcador que jsPDF reemplaza por el total de páginas al cerrar. */
export const TOTAL_PAGINAS = "{total_pages_count_string}";

/** "#2a78d6" → [42, 120, 214], para setFillColor. */
export function hexARgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Devuelve el logo como dataURL, o null si no carga: el encabezado cae a texto. */
export async function cargarLogo(ruta: string = LOGO): Promise<string | null> {
  try {
    const resp = await fetch(ruta);
    if (!resp.ok) throw new Error(String(resp.status));
    const blob = await resp.blob();
    return await new Promise<string>((ok, fail) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.onerror = fail;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Las fuentes estándar de jsPDF usan WinAnsi: acentos y eñes salen bien, pero
 * flechas, comillas tipográficas, guiones largos y emojis no. Se normalizan.
 */
export function saneaWinAnsi(txt: CeldaPdf): string {
  if (txt === null || txt === undefined) return "";
  return String(txt)
    .replace(/[–—]/g, "-")
    .replace(/→/g, "a")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x20-\xFF]/g, "")
    .trim();
}

export function ahoraBogota(): string {
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

/** Dibuja el encabezado y devuelve la Y donde termina. */
export function dibujarEncabezado(doc: jsPDF, inf: EncabezadoPdf, logo: string | null, generado: string): number {
  const ancho = doc.internal.pageSize.getWidth();
  const anchoUtil = ancho - 2 * MARGEN;
  let y = MARGEN;

  const logoW = 26;
  const logoH = logoW * LOGO_RATIO;
  if (logo) doc.addImage(logo, "PNG", MARGEN, y, logoW, logoH);
  else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("LA CAROLINA", MARGEN, y + 6);
  }

  const xTexto = MARGEN + logoW + 5;
  doc.setTextColor(100);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(saneaWinAnsi(inf.modulo), xTexto, y + 4);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(saneaWinAnsi(inf.titulo), xTexto, y + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Generado: ${generado}`, ancho - MARGEN, y + 4, { align: "right" });
  doc.setTextColor(0);

  y += Math.max(logoH, 12) + 3;

  doc.setFontSize(8.5);
  doc.setTextColor(60);
  for (const linea of inf.contexto) {
    const partes = doc.splitTextToSize(saneaWinAnsi(linea), anchoUtil) as string[];
    doc.text(partes, MARGEN, y);
    y += partes.length * 3.8;
  }
  doc.setTextColor(0);

  if (inf.resumen && inf.resumen.length > 0) {
    y += 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const partes = doc.splitTextToSize(saneaWinAnsi(inf.resumen.join("   ·   ")), anchoUtil) as string[];
    doc.text(partes, MARGEN, y);
    y += partes.length * 3.8;
    doc.setFont("helvetica", "normal");
  }

  y += 1;
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, y, ancho - MARGEN, y);
  return y + 3;
}

export function dibujarPie(doc: jsPDF, pagina: number, totalMarcador: string = TOTAL_PAGINAS) {
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(`Página ${pagina} de ${totalMarcador}`, ancho - MARGEN, alto - 6, { align: "right" });
  doc.text("La Carolina De Transporte", MARGEN, alto - 6);
  doc.setTextColor(0);
}

export async function descargarPdfTabla(inf: InformePdf): Promise<void> {
  // Se cargan en el navegador y solo al pedir el PDF: no entran al bundle.
  const [{ jsPDF: JsPDF }, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable").then((m) => m.default),
  ]);
  const logo = await cargarLogo(LOGO);
  const doc = new JsPDF({
    orientation: inf.orientacion ?? "portrait",
    unit: "mm",
    format: "letter",
  }) as DocConAutoTable;
  const generado = ahoraBogota();
  const totalMarcador = "{total_pages_count_string}";

  doc.setProperties({
    title: `${inf.modulo} - ${inf.titulo}`,
    subject: inf.contexto.join(" | "),
    author: "La Carolina De Transporte",
    creator: "Gestivo",
  });

  // El encabezado se mide en la primera página para reservar el margen
  // superior; en las siguientes se vuelve a dibujar desde didDrawPage.
  const finEncabezado = dibujarEncabezado(doc, inf, logo, generado);

  const columnStyles: NonNullable<UserOptions["columnStyles"]> = {};
  inf.columnas.forEach((c, i) => {
    columnStyles[i] = { ...(c.ancho ? { cellWidth: c.ancho } : {}), ...(c.alinear ? { halign: c.alinear } : {}) };
  });

  const cuerpo = inf.filas.length > 0
    ? inf.filas.map((f) => f.map(saneaWinAnsi))
    : [[{ content: saneaWinAnsi(inf.vacio ?? "Sin datos para los filtros elegidos."), colSpan: inf.columnas.length, styles: { halign: "center" as const, textColor: 120 } }]];

  autoTable(doc, {
    startY: finEncabezado,
    margin: { top: finEncabezado, left: MARGEN, right: MARGEN, bottom: PIE_ALTO },
    head: [inf.columnas.map((c) => saneaWinAnsi(c.titulo))],
    body: cuerpo,
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.4, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    showHead: "everyPage",
    rowPageBreak: "avoid",
    didDrawPage: (data) => {
      if (data.pageNumber > 1) dibujarEncabezado(doc, inf, logo, generado);
      dibujarPie(doc, data.pageNumber, totalMarcador);
    },
  });

  if (inf.notas && inf.notas.length > 0) {
    let y = (doc.lastAutoTable?.finalY ?? finEncabezado) + 5;
    const alto = doc.internal.pageSize.getHeight();
    const anchoUtil = doc.internal.pageSize.getWidth() - 2 * MARGEN;
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    for (const nota of inf.notas) {
      const partes = doc.splitTextToSize(saneaWinAnsi(nota), anchoUtil) as string[];
      if (y + partes.length * 3.5 > alto - PIE_ALTO) {
        doc.addPage();
        y = dibujarEncabezado(doc, inf, logo, generado);
        dibujarPie(doc, doc.getNumberOfPages(), totalMarcador);
      }
      doc.text(partes, MARGEN, y);
      y += partes.length * 3.5 + 1;
    }
    doc.setTextColor(0);
  }

  doc.putTotalPages(totalMarcador);
  doc.save(`${inf.archivo}.pdf`);
}
