// Informe PDF de los indicadores de ausentismo, generado en el navegador.
//
// Portada con filtros, indicadores globales, análisis y el corte mensual;
// luego una página por corte con el gráfico y la tabla. Los gráficos se dibujan
// con primitivas de jsPDF a partir de los mismos agregados de la pantalla:
// salen en vector, nítidos al imprimir, y no dependen de capturar el navegador.

import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import {
  cargarLogo, dibujarEncabezado, dibujarPie, ahoraBogota, hexARgb, saneaWinAnsi,
  MARGEN, PIE_ALTO, TOTAL_PAGINAS, type DocConAutoTable, type EncabezadoPdf,
} from "@/lib/exportar/pdf-tabla";
import {
  CORTES, topN, ordenarPor, SIN_DATO,
  type Indicadores, type Grupo, type GrupoMensual, type CorteId,
} from "./indicadores";

const MODULO = "Recursos Humanos · Ausentismo";
const AZUL = "#2a78d6";
const NARANJA = "#eb6834";
const GRIS = "#94a3b8";
const TINTA = 15;
const TINTA_SUAVE = 100;
const REJILLA = 226;

const fmt = (n: number) => n.toLocaleString("es-CO");

export interface FiltrosInformeIndicadores {
  desde: string;
  hasta: string;
  origen?: string | null;
  eps?: string | null;
  tipo?: string | null;
  estado?: string | null;
}

/** Líneas de contexto del encabezado a partir de los filtros aplicados. */
export function describirFiltros(f: FiltrosInformeIndicadores): string[] {
  const partes = [
    `Fecha de inicio: ${f.desde} a ${f.hasta}`,
    `Origen: ${f.origen || "todos"}`,
    `EPS / ARL: ${f.eps || "todas"}`,
    `Tipo de trabajador: ${f.tipo || "todos"}`,
    `Registros: ${f.estado === "cerrado" ? "cerrados" : f.estado === "pendiente" ? "pendientes" : "todos"}`,
  ];
  return [partes.join("   ·   ")];
}

/** Nombre de archivo con la segmentación, sin tildes ni espacios. */
export function nombreArchivoIndicadores(f: FiltrosInformeIndicadores): string {
  const limpio = (t: string) =>
    t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  const sufijos = [f.origen, f.eps, f.tipo, f.estado].filter((x): x is string => Boolean(x)).map(limpio);
  return ["indicadores_ausentismo", `${f.desde}_a_${f.hasta}`, ...sufijos].join("_");
}

function esNeutro(g: Grupo) {
  return g.clave === SIN_DATO || g.clave === "__otros__";
}

/**
 * Ranking horizontal: etiqueta a la izquierda, barra y valor a la derecha.
 * Devuelve la Y donde termina.
 */
function barrasHorizontales(
  doc: jsPDF, x: number, y: number, ancho: number, grupos: Grupo[], medida: "dias" | "eventos", color: string
): number {
  const filaAlto = 6.2;
  const anchoEtiqueta = 62;
  const anchoValor = 14;
  const xBarra = x + anchoEtiqueta + 2;
  const anchoBarra = ancho - anchoEtiqueta - anchoValor - 4;
  const max = Math.max(...grupos.map((g) => g[medida]), 1);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  let yy = y;
  for (const g of grupos) {
    const [r, gg, b] = hexARgb(esNeutro(g) ? GRIS : color);
    const etiqueta = saneaWinAnsi(g.etiqueta);
    const partes = doc.splitTextToSize(etiqueta, anchoEtiqueta) as string[];
    doc.setTextColor(TINTA);
    doc.text(partes[0] + (partes.length > 1 ? "…" : ""), x + anchoEtiqueta, yy + 3.2, { align: "right" });
    const w = Math.max(0.6, (g[medida] / max) * anchoBarra);
    doc.setFillColor(r, gg, b);
    doc.roundedRect(xBarra, yy + 0.9, w, 3.4, 0.8, 0.8, "F");
    doc.setTextColor(TINTA);
    doc.text(fmt(g[medida]), xBarra + w + 1.5, yy + 3.2);
    yy += filaAlto;
  }
  doc.setTextColor(0);
  return yy;
}

/** Barras verticales por mes con el valor sobre cada una. Devuelve la Y final. */
function barrasMensuales(
  doc: jsPDF, x: number, y: number, ancho: number, alto: number, meses: GrupoMensual[], medida: "dias" | "eventos", color: string
): number {
  const max = Math.max(...meses.map((m) => m[medida]), 1);
  const areaAlto = alto - 10;
  const paso = ancho / Math.max(meses.length, 1);
  const anchoBarra = Math.min(12, paso * 0.6);
  const base = y + areaAlto;
  const [r, g, b] = hexARgb(color);

  doc.setDrawColor(REJILLA);
  doc.setLineWidth(0.2);
  doc.line(x, base, x + ancho, base);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  meses.forEach((m, i) => {
    const cx = x + paso * i + paso / 2;
    const h = (m[medida] / max) * (areaAlto - 6);
    doc.setFillColor(r, g, b);
    if (h > 0) doc.roundedRect(cx - anchoBarra / 2, base - h, anchoBarra, h, 0.8, 0.8, "F");
    doc.setTextColor(TINTA);
    doc.text(fmt(m[medida]), cx, base - h - 1.2, { align: "center" });
    doc.setTextColor(TINTA_SUAVE);
    const [mes, anio] = m.etiqueta.replace(" (parcial)", "").split(" ");
    doc.text(`${mes} ${(anio ?? "").slice(2)}${m.parcial ? "*" : ""}`, cx, base + 3.5, { align: "center" });
  });
  doc.setTextColor(0);
  return base + 6;
}

function tituloSeccion(doc: jsPDF, texto: string, y: number, sub?: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(TINTA);
  doc.text(saneaWinAnsi(texto), MARGEN, y + 4);
  let yy = y + 7;
  if (sub) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(TINTA_SUAVE);
    doc.text(saneaWinAnsi(sub), MARGEN, yy + 2.5);
    yy += 5;
  }
  doc.setTextColor(0);
  return yy;
}

function leyenda(doc: jsPDF, x: number, y: number, color: string, texto: string) {
  const [r, g, b] = hexARgb(color);
  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y - 2.2, 2.6, 2.6, 0.5, 0.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(TINTA_SUAVE);
  doc.text(texto, x + 4, y);
  doc.setTextColor(0);
}

const ESTILO_TABLA: Partial<UserOptions> = {
  styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.3, overflow: "linebreak", valign: "top" },
  headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
  alternateRowStyles: { fillColor: [248, 250, 252] },
  showHead: "everyPage",
  rowPageBreak: "avoid",
};

export async function exportarIndicadoresPdf({ indicadores, filtros, top }: {
  indicadores: Indicadores;
  filtros: FiltrosInformeIndicadores;
  /** Filas por corte en el informe; null = todas. */
  top: number | null;
}): Promise<void> {
  const [{ jsPDF: JsPDF }, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable").then((m) => m.default),
  ]);
  const logo = await cargarLogo();
  const generado = ahoraBogota();
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "letter" }) as DocConAutoTable;
  const anchoUtil = doc.internal.pageSize.getWidth() - 2 * MARGEN;
  const altoPagina = doc.internal.pageSize.getHeight();
  const ind = indicadores;
  const t = ind.totales;

  const encabezado: EncabezadoPdf = {
    modulo: MODULO,
    titulo: "Indicadores de ausentismo",
    contexto: describirFiltros(filtros),
  };
  doc.setProperties({
    title: `${MODULO} - Indicadores de ausentismo`,
    subject: encabezado.contexto.join(" | "),
    author: "La Carolina De Transporte",
    creator: "Gestivo",
  });

  let primera = true;
  function nuevaPagina(): number {
    if (!primera) doc.addPage();
    primera = false;
    const fin = dibujarEncabezado(doc, encabezado, logo, generado);
    dibujarPie(doc, doc.getNumberOfPages());
    return fin;
  }
  // Las tablas largas saltan de página por su cuenta: encabezado y pie van ahí.
  const enSaltoDeTabla: UserOptions["didDrawPage"] = (data) => {
    if (data.pageNumber > 1) {
      dibujarEncabezado(doc, encabezado, logo, generado);
      dibujarPie(doc, doc.getNumberOfPages());
    }
  };
  function asegurarEspacio(y: number, alto: number): number {
    return y + alto > altoPagina - PIE_ALTO ? nuevaPagina() : y;
  }

  // ── Portada: indicadores globales, análisis y mensual ────────────────────
  let y = nuevaPagina();

  const kpis: [string, string, string?][] = [
    ["Incapacidades", fmt(t.eventos)],
    ["Días perdidos", fmt(t.dias)],
    ["Días por incapacidad", String(t.promedio)],
    ["Trabajadores afectados", fmt(t.trabajadores), t.pctAfectados != null ? `${t.pctAfectados}% de ${fmt(t.activos!)} activos` : t.activos ? `${fmt(t.activos)} activos hoy` : undefined],
    ["Prórrogas", fmt(t.prorrogas), `${t.pctProrrogas}% de las incapacidades`],
  ];
  const kpiAncho = (anchoUtil - 4 * 3) / 5;
  kpis.forEach(([label, valor, nota], i) => {
    const x = MARGEN + i * (kpiAncho + 3);
    doc.setFillColor(i === 1 ? 238 : 248, i === 1 ? 242 : 250, i === 1 ? 255 : 252);
    doc.setDrawColor(i === 1 ? 199 : 226, i === 1 ? 210 : 232, i === 1 ? 254 : 240);
    doc.roundedRect(x, y, kpiAncho, 17, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(TINTA_SUAVE);
    doc.text(saneaWinAnsi(label).toUpperCase(), x + 2.5, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(TINTA);
    doc.text(valor, x + 2.5, y + 11);
    if (nota) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(TINTA_SUAVE);
      doc.text(saneaWinAnsi(nota), x + 2.5, y + 15);
    }
  });
  doc.setTextColor(0);
  y += 22;

  y = tituloSeccion(doc, "Análisis", y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(40);
  for (const frase of ind.analisis) {
    const partes = doc.splitTextToSize(saneaWinAnsi(frase), anchoUtil - 5) as string[];
    y = asegurarEspacio(y, partes.length * 3.9 + 1);
    doc.text("•", MARGEN + 0.5, y + 3);
    doc.text(partes, MARGEN + 4.5, y + 3);
    y += partes.length * 3.9 + 1.2;
  }
  doc.setTextColor(0);
  y += 3;

  // Mensual: dos gráficos lado a lado (una medida cada uno) y la tabla.
  y = asegurarEspacio(y, 60);
  y = tituloSeccion(doc, CORTES[0].titulo, y, "* mes en curso, cifras parciales");
  const mitad = (anchoUtil - 6) / 2;
  leyenda(doc, MARGEN, y + 2, AZUL, "Días perdidos");
  leyenda(doc, MARGEN + mitad + 6, y + 2, NARANJA, "Incapacidades");
  y += 4;
  const finA = barrasMensuales(doc, MARGEN, y, mitad, 42, ind.mensual, "dias", AZUL);
  barrasMensuales(doc, MARGEN + mitad + 6, y, mitad, 42, ind.mensual, "eventos", NARANJA);
  y = finA + 3;

  const conTasa = t.activos != null;
  autoTable(doc, {
    ...ESTILO_TABLA,
    startY: y,
    margin: { top: 40, left: MARGEN, right: MARGEN, bottom: PIE_ALTO },
    head: [["Mes", "Incapacidades", "Prórrogas", "Días perdidos", "Días / incap.", "% días", "Trabajadores", ...(conTasa ? ["Tasa"] : [])]],
    body: ind.mensual.map((m) => [
      saneaWinAnsi(m.etiqueta), fmt(m.eventos), fmt(m.prorrogas), fmt(m.dias), String(m.promedio), `${m.pctDias}%`, fmt(m.trabajadores),
      ...(conTasa ? [`${m.tasa ?? "—"}%`] : []),
    ]),
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [i, { halign: "right" as const }])),
    didDrawPage: enSaltoDeTabla,
  });

  // ── Una página por corte ─────────────────────────────────────────────────
  for (const corte of CORTES.filter((c) => c.id !== "mensual")) {
    const id = corte.id as Exclude<CorteId, "mensual">;
    const todos = ind[id];
    const grupos = topN(ordenarPor(todos, "dias"), top);
    const reales = todos.filter((g) => g.clave !== SIN_DATO).length;
    const mostrados = grupos.filter((g) => !esNeutro(g)).length;
    const esTrabajador = id === "trabajador";

    y = nuevaPagina();
    y = tituloSeccion(
      doc, corte.titulo, y,
      `${mostrados < reales ? `Top ${mostrados} de ${fmt(reales)}` : `${fmt(reales)} en total`}, ordenado por días perdidos`
    );
    leyenda(doc, MARGEN, y + 2, AZUL, "Días perdidos");
    y += 4;
    const alturaGrafico = grupos.length * 6.2 + 2;
    if (y + alturaGrafico > altoPagina - PIE_ALTO - 20) {
      // Con "todos" el ranking puede no caber: se grafica lo que cabe y la tabla lleva el resto.
      const caben = Math.max(5, Math.floor((altoPagina - PIE_ALTO - 20 - y) / 6.2));
      y = barrasHorizontales(doc, MARGEN, y, anchoUtil, grupos.slice(0, caben), "dias", AZUL);
      doc.setFontSize(7);
      doc.setTextColor(TINTA_SUAVE);
      doc.text(`Gráfico limitado a ${caben} filas; la tabla trae las ${grupos.length}.`, MARGEN, y + 2.5);
      doc.setTextColor(0);
      y += 5;
    } else {
      y = barrasHorizontales(doc, MARGEN, y, anchoUtil, grupos, "dias", AZUL);
    }
    y += 3;

    const cabecera = [corte.dimension, "Incap.", "Prórr.", "Días", "Días / incap.", "% días", ...(esTrabajador ? [] : ["Trabaj."])];
    autoTable(doc, {
      ...ESTILO_TABLA,
      startY: y,
      margin: { top: 40, left: MARGEN, right: MARGEN, bottom: PIE_ALTO },
      head: [cabecera],
      body: grupos.map((g) => [
        saneaWinAnsi(g.detalle ? `${g.etiqueta}\n${g.detalle}` : g.etiqueta),
        fmt(g.eventos), fmt(g.prorrogas), fmt(g.dias), String(g.promedio), `${g.pctDias}%`,
        ...(esTrabajador ? [] : [g.clave === "__otros__" ? "—" : fmt(g.trabajadores)]),
      ]),
      columnStyles: {
        0: { cellWidth: esTrabajador ? 96 : 84 },
        ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, { halign: "right" as const }])),
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          const g = grupos[data.row.index];
          if (g && esNeutro(g)) data.cell.styles.textColor = 120;
        }
      },
      didDrawPage: enSaltoDeTabla,
    });
  }

  doc.putTotalPages(TOTAL_PAGINAS);
  doc.save(`${nombreArchivoIndicadores(filtros)}.pdf`);
}
