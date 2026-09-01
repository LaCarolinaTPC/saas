// Generador del PDF del formato controlado CPA-R-31 "Graduación de Frenos".
//
// Réplica del .xlsx del SGC: encabezado de tres bloques (logo · título ·
// código/versión/fecha) repetido en cada página, y una fila por vehículo activo
// de la flota — en blanco si no tuvo registro en el periodo, como el formato en
// papel listo para llenar a mano.
//
// Los títulos van SIN TILDES a propósito: así están en el documento controlado.
//
// dibujarEncabezado está parametrizada porque en la misma carpeta del SGC hay
// una veintena de formatos hermanos (CPA-R-03 … CPA-R-30) con este encabezado.

import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

type DocConAutoTable = jsPDF & {
  autoTable: (options: UserOptions) => void;
  lastAutoTable?: { finalY: number };
};

export type FormatoControlado = {
  codigo: string;
  version: string;
  fecha: string;
  titulo: string[];
  logo: string;
  logoRatio: number;
};

export const FORMATO_CPA_R_31: FormatoControlado = {
  codigo: "CPA-R-31",
  version: "1",
  fecha: "1-08-2016",
  // El .xlsx trae el título en una sola celda y deja que Excel lo parta. Aquí
  // se declara el salto para no terminar en "...QUE LE / APLICA".
  titulo: ["FORMATO GRADUACION DE FRENOS", "A VEHICULOS QUE LE APLICA"],
  logo: "/sgc/logo-formato.png",
  logoRatio: 166 / 300, // proporción del PNG incrustado en el .xlsx
};

// ── Geometría, en mm sobre carta vertical (215.9 × 279.4) ────────────────────
const MARGEN = 10;
const ENC_ALTO = 20;
const ENC_LOGO_W = 28;
const ENC_CONTROL_W = 45;
const TRAZA_ALTO = 7; // línea de periodo bajo el encabezado
const PIE_ALTO = 16; // espacio reservado para "Pagina N de M"

export type FilaFrenos = {
  fecha: string;
  codigo_vehiculo: string;
  graduacion: boolean;
  observacion: string | null;
};

export type VehiculoFlota = { codigo: string; placa: string | null };

/** Devuelve el logo como dataURL, o null si no carga: el encabezado cae a texto. */
async function cargarLogo(ruta: string): Promise<string | null> {
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
 * comillas tipográficas, guiones largos y emojis no. Se normalizan antes.
 */
function saneaWinAnsi(txt: string | null | undefined): string {
  if (txt === null || txt === undefined) return "";
  return String(txt)
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\x09\x20-\xFF]/g, "")
    .trim();
}

function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Tres celdas con borde, réplica de B2:H4 del .xlsx. */
function dibujarEncabezado(doc: jsPDF, cfg: FormatoControlado, logo: string | null) {
  const anchoUtil = doc.internal.pageSize.getWidth() - 2 * MARGEN;
  const y = MARGEN;
  const wTitulo = anchoUtil - ENC_LOGO_W - ENC_CONTROL_W;
  const xTitulo = MARGEN + ENC_LOGO_W;
  const xControl = xTitulo + wTitulo;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(MARGEN, y, ENC_LOGO_W, ENC_ALTO);
  doc.rect(xTitulo, y, wTitulo, ENC_ALTO);
  doc.rect(xControl, y, ENC_CONTROL_W, ENC_ALTO);

  if (logo) {
    const w = ENC_LOGO_W - 5;
    const h = w * cfg.logoRatio;
    doc.addImage(logo, "PNG", MARGEN + 2.5, y + (ENC_ALTO - h) / 2, w, h);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("LA CAROLINA", MARGEN + ENC_LOGO_W / 2, y + ENC_ALTO / 2 + 1, { align: "center" });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const altoLinea = 4.4;
  let yTitulo = y + (ENC_ALTO - cfg.titulo.length * altoLinea) / 2 + 3.2;
  for (const linea of cfg.titulo) {
    doc.text(linea, xTitulo + wTitulo / 2, yTitulo, { align: "center" });
    yTitulo += altoLinea;
  }

  // Código / versión / fecha en tres renglones con separadores (G2:H4 del .xlsx)
  const alto3 = ENC_ALTO / 3;
  doc.setLineWidth(0.2);
  doc.line(xControl, y + alto3, xControl + ENC_CONTROL_W, y + alto3);
  doc.line(xControl, y + alto3 * 2, xControl + ENC_CONTROL_W, y + alto3 * 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  [`Codigo: ${cfg.codigo}`, `Version: ${cfg.version}`, `Fecha: ${cfg.fecha}`].forEach((txt, i) => {
    doc.text(txt, xControl + 2.5, y + alto3 * i + alto3 / 2 + 1.2);
  });
}

/** Línea de trazabilidad. No existe en el formato original: va fuera del marco. */
function dibujarTrazabilidad(doc: jsPDF, texto: string) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90);
  doc.text(texto, MARGEN, MARGEN + ENC_ALTO + 4.5);
  doc.setTextColor(0);
}

function dibujarPies(doc: jsPDF) {
  const total = doc.internal.pages.length - 1;
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text(`Pagina ${i} de ${total}`, w - MARGEN, h - 8, { align: "right" });
    doc.setTextColor(0);
  }
}

/**
 * Una fila por vehículo activo. Si tuvo varias graduaciones en el periodo se
 * repite, una fila por registro; si no tuvo ninguna, la fila va en blanco.
 */
function filasFormato(flota: VehiculoFlota[], registros: FilaFrenos[]): string[][] {
  const porVehiculo = new Map<string, FilaFrenos[]>();
  for (const r of registros) {
    if (!porVehiculo.has(r.codigo_vehiculo)) porVehiculo.set(r.codigo_vehiculo, []);
    porVehiculo.get(r.codigo_vehiculo)!.push(r);
  }

  // Orden numérico por código, que es el número interno del formato en papel.
  const ordenada = [...flota].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, "es", { numeric: true })
  );

  const filas: string[][] = [];
  for (const v of ordenada) {
    const regs = porVehiculo.get(v.codigo) ?? [];
    if (regs.length === 0) {
      filas.push(["", v.codigo, "", ""]);
      continue;
    }
    for (const r of [...regs].sort((x, y) => x.fecha.localeCompare(y.fecha))) {
      filas.push([fmtFecha(r.fecha), v.codigo, r.graduacion ? "X" : "NO", saneaWinAnsi(r.observacion)]);
    }
  }
  return filas;
}

export async function generarPdfCpaR31({ flota, registros, desde, hasta, usuario }: {
  flota: VehiculoFlota[];
  registros: FilaFrenos[];
  desde: string;
  hasta: string;
  usuario: string | null;
}): Promise<number> {
  // Se cargan en el navegador y solo cuando se pide el PDF: no entran al
  // bundle de la página.
  const [{ jsPDF: JsPDF }, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable").then((m) => m.default),
  ]);

  const cfg = FORMATO_CPA_R_31;
  const logo = await cargarLogo(cfg.logo);
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "letter" }) as DocConAutoTable;

  doc.setProperties({
    title: `${cfg.codigo} v${cfg.version} — ${cfg.titulo.join(" ")}`,
    subject: `Periodo ${desde} a ${hasta}`,
    author: usuario ?? "La Carolina De Transporte",
    creator: "Gestivo — Mantenimiento",
  });

  const filas = filasFormato(flota, registros);
  const ahora = new Date();
  const hhmm = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const traza = saneaWinAnsi(
    `Periodo: ${fmtFecha(desde)} a ${fmtFecha(hasta)}  ·  Generado: ${fmtFecha(hasta)} ${hhmm}` +
    (usuario ? ` por ${usuario}` : "")
  );

  const topTabla = MARGEN + ENC_ALTO + TRAZA_ALTO;

  autoTable(doc, {
    head: [["FECHA", "VEHICULO", "GRADUACION DE FRENOS", "OBSERVACION ASOCIADAS AL SISTEMA DE FRENOS"]],
    body: filas,
    startY: topTabla,
    margin: { top: topTabla, left: MARGEN, right: MARGEN, bottom: PIE_ALTO },
    theme: "grid",
    showHead: "everyPage",
    styles: {
      font: "helvetica", fontSize: 8, cellPadding: 1.6,
      lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
      overflow: "linebreak", valign: "middle", minCellHeight: 6,
    },
    headStyles: {
      fillColor: [255, 255, 255], textColor: [0, 0, 0],
      fontStyle: "bold", fontSize: 7.5, halign: "center",
      lineWidth: 0.3, valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 22, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 35, halign: "center", fontStyle: "bold" },
      3: { cellWidth: "auto" },
    },
    didDrawPage: () => {
      dibujarEncabezado(doc, cfg, logo);
      dibujarTrazabilidad(doc, traza);
    },
  });

  dibujarPies(doc);
  doc.save(`${cfg.codigo}_graduacion_frenos_${desde}_a_${hasta}.pdf`);
  return filas.length;
}
