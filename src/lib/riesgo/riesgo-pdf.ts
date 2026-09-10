/**
 * Informe PDF del módulo Riesgo, con los mismos gráficos que traía el informe
 * HTML: los pesos de cada modelo y los retiros observados por mes.
 *
 * Los gráficos se dibujan con primitivas de jsPDF a partir de los mismos
 * agregados que ya guardó la corrida, igual que en los indicadores de
 * Ausentismo: salen en vector, nítidos al imprimir, y no dependen de capturar
 * el navegador ni de que Chart.js cargue desde un CDN — que es justo lo que
 * hacía frágil al HTML.
 *
 * Una diferencia deliberada con el HTML: el gráfico de retiros por mes tenía
 * dos escalas (barras de retiros y línea de tasa). Las reglas de visualización
 * del proyecto prohíben la doble escala, así que aquí el gráfico muestra la
 * tasa mensual y el conteo va como etiqueta sobre cada barra y en la tabla.
 */
import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import {
  MARGEN,
  PIE_ALTO,
  ahoraBogota,
  cargarLogo,
  dibujarEncabezado,
  dibujarPie,
  hexARgb,
  saneaWinAnsi,
  type CeldaPdf,
  type DocConAutoTable,
  type EncabezadoPdf,
} from "@/lib/exportar/pdf-tabla";
import type { Coeficiente, ConductorPuntuado, MetricasModelo } from "./corrida";
import type { CorridaGuardada } from "./persistir";

const TINTA = "#1F2937";
const TINTA_SUAVE = "#64748B";
const REJILLA = "#E2E8F0";
const MAS_RIESGO = "#DC2626";
const MENOS_RIESGO = "#059669";
const MARCA = "#4F46E5";
const NIVEL_COLOR: Record<string, string> = {
  Alto: "#DC2626",
  Medio: "#D97706",
  Bajo: "#059669",
};

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const nDec = (x: number, d = 1) => x.toFixed(d).replace(".", ",");

/** Cuántos pesos se dibujan por modelo: más allá de diez el gráfico no se lee. */
const COEFS_EN_GRAFICO = 10;

const ESTILO_TABLA: Partial<UserOptions> = {
  styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.3, overflow: "linebreak", valign: "top" },
  headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
  alternateRowStyles: { fillColor: [248, 250, 252] },
  showHead: "everyPage",
  rowPageBreak: "avoid",
};

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

function leyenda(doc: jsPDF, x: number, y: number, color: string, texto: string): number {
  const [r, g, b] = hexARgb(color);
  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y - 2.2, 2.6, 2.6, 0.5, 0.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(TINTA_SUAVE);
  doc.text(saneaWinAnsi(texto), x + 4, y);
  doc.setTextColor(0);
  return x + 4 + doc.getTextWidth(texto) + 6;
}

/**
 * Pesos estandarizados como barras divergentes desde una línea de cero: a la
 * derecha en rojo lo que suma riesgo, a la izquierda en verde lo que lo resta.
 * El HTML pintaba las barras desde el borde y el signo solo se veía en el
 * color; con la línea de cero la dirección se lee sin leyenda.
 */
function barrasCoeficientes(
  doc: jsPDF,
  x: number,
  y: number,
  ancho: number,
  coefs: Coeficiente[]
): number {
  const filaAlto = 5.6;
  const anchoEtiqueta = Math.min(58, ancho * 0.46);
  // El valor va en columna propia al final. Con la etiqueta pegada al extremo
  // de la barra, una barra negativa larga escribía su valor encima del nombre
  // de la variable.
  const anchoValor = 14;
  const zonaX = x + anchoEtiqueta + 2;
  const zonaAncho = ancho - anchoEtiqueta - anchoValor - 4;
  const cero = zonaX + zonaAncho / 2;
  const max = Math.max(...coefs.map((c) => Math.abs(c.peso)), 0.01);
  const semi = zonaAncho / 2;

  // Línea de cero, de arriba a abajo del gráfico.
  doc.setDrawColor(REJILLA);
  doc.setLineWidth(0.2);
  doc.line(cero, y, cero, y + coefs.length * filaAlto);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  let yy = y;
  for (const c of coefs) {
    const [r, g, b] = hexARgb(c.peso > 0 ? MAS_RIESGO : MENOS_RIESGO);
    const partes = doc.splitTextToSize(saneaWinAnsi(c.etiqueta), anchoEtiqueta) as string[];
    doc.setTextColor(TINTA);
    doc.text(partes[0] + (partes.length > 1 ? "…" : ""), x + anchoEtiqueta, yy + 3, {
      align: "right",
    });
    const w = Math.max(0.6, (Math.abs(c.peso) / max) * semi);
    doc.setFillColor(r, g, b);
    doc.roundedRect(c.peso > 0 ? cero : cero - w, yy + 0.8, w, 3, 0.7, 0.7, "F");
    doc.setTextColor(c.peso > 0 ? MAS_RIESGO : MENOS_RIESGO);
    const texto = `${c.peso > 0 ? "+" : "-"}${nDec(Math.abs(c.peso), 2)}`;
    doc.text(saneaWinAnsi(texto), x + ancho, yy + 3, { align: "right" });
    yy += filaAlto;
  }
  doc.setTextColor(0);
  return yy;
}

/** Tasa mensual de retiro en barras, con el conteo sobre cada una. */
function barrasRetirosMes(
  doc: jsPDF,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  meses: { mes: string; plantilla: number; retiros: number; tasa: number }[]
): number {
  const max = Math.max(...meses.map((m) => m.tasa), 0.01);
  const areaAlto = alto - 10;
  const paso = ancho / Math.max(meses.length, 1);
  const anchoBarra = Math.min(14, paso * 0.55);
  const base = y + areaAlto;
  const [r, g, b] = hexARgb(MARCA);

  doc.setDrawColor(REJILLA);
  doc.setLineWidth(0.2);
  doc.line(x, base, x + ancho, base);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  meses.forEach((m, i) => {
    const cx = x + paso * i + paso / 2;
    const h = (m.tasa / max) * (areaAlto - 7);
    doc.setFillColor(r, g, b);
    if (h > 0) doc.roundedRect(cx - anchoBarra / 2, base - h, anchoBarra, h, 0.8, 0.8, "F");
    doc.setTextColor(TINTA);
    doc.text(saneaWinAnsi(pct(m.tasa)), cx, base - h - 1.2, { align: "center" });
    doc.setTextColor(TINTA_SUAVE);
    doc.text(`${m.retiros} de ${m.plantilla}`, cx, base + 3.2, { align: "center" });
    doc.text(m.mes, cx, base + 6.4, { align: "center" });
  });
  doc.setTextColor(0);
  return base + 9;
}

/** Tasa observada por tramo: barra proporcional dentro de la celda. */
function barrasTramo(
  doc: jsPDF,
  x: number,
  y: number,
  ancho: number,
  datos: { etiqueta: string; n: number; tasa: number }[]
): number {
  const filaAlto = 5.2;
  const anchoEtiqueta = Math.min(46, ancho * 0.42);
  const anchoN = 16;
  const xBarra = x + anchoEtiqueta + anchoN + 2;
  const anchoBarra = ancho - anchoEtiqueta - anchoN - 22;
  const max = Math.max(...datos.map((d) => d.tasa), 0.01);
  const [r, g, b] = hexARgb(MARCA);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  let yy = y;
  for (const d of datos) {
    doc.setTextColor(TINTA);
    doc.text(saneaWinAnsi(d.etiqueta), x, yy + 3);
    doc.setTextColor(TINTA_SUAVE);
    doc.text(String(d.n), x + anchoEtiqueta + anchoN - 2, yy + 3, { align: "right" });
    const w = Math.max(0.5, (d.tasa / max) * anchoBarra);
    doc.setFillColor(r, g, b);
    doc.roundedRect(xBarra, yy + 0.9, w, 2.6, 0.6, 0.6, "F");
    doc.setTextColor(TINTA);
    doc.text(saneaWinAnsi(pct(d.tasa)), xBarra + anchoBarra + 2, yy + 3);
    yy += filaAlto;
  }
  doc.setTextColor(0);
  return yy;
}

export interface InformeRiesgo {
  archivo: string;
  modulo: string;
  titulo: string;
  contexto: string[];
  resumen: string[];
  notas: string[];
  corrida: CorridaGuardada;
  objetivo: "retiro" | "novedad";
  filas: ConductorPuntuado[];
  /** Columnas y celdas de la tabla de conductores, ya armadas por el llamador. */
  columnas: { titulo: string; ancho?: number; alinear?: "left" | "center" | "right" }[];
  celdas: CeldaPdf[][];
  vacio: string;
}

export async function descargarInformeRiesgo(inf: InformeRiesgo): Promise<void> {
  const [{ jsPDF: JsPDF }, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable").then((m) => m.default),
  ]);
  const logo = await cargarLogo();
  const generado = ahoraBogota();
  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "letter" }) as DocConAutoTable;
  const anchoUtil = doc.internal.pageSize.getWidth() - 2 * MARGEN;
  const altoPagina = doc.internal.pageSize.getHeight();

  const encabezado: EncabezadoPdf = {
    modulo: inf.modulo,
    titulo: inf.titulo,
    contexto: inf.contexto,
    resumen: inf.resumen,
  };
  doc.setProperties({
    title: `${inf.modulo} - ${inf.titulo}`,
    subject: inf.contexto.join(" | "),
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
  const enSaltoDeTabla: UserOptions["didDrawPage"] = (data) => {
    if (data.pageNumber > 1) {
      dibujarEncabezado(doc, encabezado, logo, generado);
      dibujarPie(doc, doc.getNumberOfPages());
    }
  };
  function asegurarEspacio(y: number, alto: number): number {
    return y + alto > altoPagina - PIE_ALTO ? nuevaPagina() : y;
  }

  let y = nuevaPagina();

  // ── Qué mueve el riesgo: un gráfico por modelo, lado a lado ───────────────
  const modelos: [string, MetricasModelo | undefined][] = [
    ["Retiro en 60 días", inf.corrida.modelos?.retiro],
    ["Falta no justificada en 30 días", inf.corrida.modelos?.novedad],
  ];
  if (modelos.some(([, m]) => m)) {
    y = tituloSeccion(
      doc,
      "Qué mueve el riesgo",
      y,
      "Peso estandarizado: cuánto cambia el riesgo cuando la variable sube una desviación estándar, con las demás fijas."
    );
    let xLeyenda = MARGEN;
    xLeyenda = leyenda(doc, xLeyenda, y + 2, MAS_RIESGO, "A más valor, más riesgo");
    leyenda(doc, xLeyenda, y + 2, MENOS_RIESGO, "A más valor, menos riesgo");
    y += 6;

    const anchoCol = (anchoUtil - 8) / 2;
    const alto = COEFS_EN_GRAFICO * 5.6 + 8;
    y = asegurarEspacio(y, alto + 6);
    let yFin = y;
    modelos.forEach(([nombre, m], i) => {
      if (!m) return;
      const x = MARGEN + i * (anchoCol + 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(TINTA);
      doc.text(saneaWinAnsi(nombre), x, y + 3);
      doc.setTextColor(0);
      const fin = barrasCoeficientes(
        doc,
        x,
        y + 6,
        anchoCol,
        m.coeficientes.slice(0, COEFS_EN_GRAFICO)
      );
      yFin = Math.max(yFin, fin);
    });
    y = yFin + 6;
  }

  // ── Retiros observados por mes ────────────────────────────────────────────
  if (inf.corrida.retirosMes.length > 0) {
    y = asegurarEspacio(y, 52);
    y = tituloSeccion(
      doc,
      "Retiros observados por mes",
      y,
      "Tasa mensual sobre los conductores en plantilla del corte; encima de cada barra, retiros y plantilla."
    );
    y = barrasRetirosMes(doc, MARGEN, y + 2, anchoUtil, 42, inf.corrida.retirosMes) + 4;
  }

  // ── Tasas observadas por tramo ────────────────────────────────────────────
  // Dos por fila, y la fila avanza por la más alta de las dos: si se avanzara
  // por la segunda, una tabla de cinco tramos al lado de una de dos se
  // solapaba con el título de la fila siguiente.
  if (inf.corrida.descriptivos.length > 0) {
    y = asegurarEspacio(y, 30);
    y = tituloSeccion(doc, "Tasas observadas por tramo", y);
    const anchoCol = (anchoUtil - 10) / 2;
    const alto = (d: (typeof inf.corrida.descriptivos)[number]) => d.datos.length * 5.2 + 9;

    for (let i = 0; i < inf.corrida.descriptivos.length; i += 2) {
      const pareja = inf.corrida.descriptivos.slice(i, i + 2);
      y = asegurarEspacio(y, Math.max(...pareja.map(alto)) + 4);
      let finFila = y;
      pareja.forEach((d, col) => {
        const x = MARGEN + col * (anchoCol + 10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(TINTA);
        const titulo = doc.splitTextToSize(saneaWinAnsi(d.titulo), anchoCol) as string[];
        doc.text(titulo[0] + (titulo.length > 1 ? "..." : ""), x, y + 3);
        doc.setTextColor(0);
        finFila = Math.max(finFila, barrasTramo(doc, x, y + 6, anchoCol, d.datos));
      });
      y = finFila + 4;
    }
  }

  // ── La tabla de conductores ───────────────────────────────────────────────
  // Solo salta de página si no cabe el encabezado con unas filas: forzar el
  // salto dejaba una página con una sola tabla de tramos y el resto en blanco.
  y = asegurarEspacio(y, 46) + 2;
  y = tituloSeccion(doc, inf.titulo, y, `${inf.filas.length} conductor(es)`);
  autoTable(doc, {
    ...ESTILO_TABLA,
    startY: y + 2,
    margin: { left: MARGEN, right: MARGEN, bottom: PIE_ALTO },
    head: [inf.columnas.map((c) => saneaWinAnsi(c.titulo))],
    body:
      inf.celdas.length > 0
        ? inf.celdas.map((f) =>
            f.map((c) =>
              c && typeof c === "object" && "texto" in c
                ? {
                    content: saneaWinAnsi(c.texto),
                    styles: {
                      fillColor: c.fondo ? hexARgb(c.fondo) : undefined,
                      textColor: c.color ? hexARgb(c.color) : undefined,
                      fontStyle: c.negrita ? ("bold" as const) : undefined,
                      halign: "center" as const,
                    },
                  }
                : saneaWinAnsi(c)
            )
          )
        : [[{ content: inf.vacio, colSpan: inf.columnas.length }]],
    columnStyles: Object.fromEntries(
      inf.columnas.map((c, i) => [
        i,
        { cellWidth: c.ancho ?? "auto", halign: c.alinear ?? "left" },
      ])
    ),
    didDrawPage: enSaltoDeTabla,
  });

  // ── Notas ─────────────────────────────────────────────────────────────────
  let yy = (doc.lastAutoTable?.finalY ?? y) + 6;
  yy = asegurarEspacio(yy, inf.notas.length * 8 + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(TINTA);
  doc.text("Cómo leer esto", MARGEN, yy);
  yy += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(TINTA_SUAVE);
  for (const n of inf.notas) {
    const partes = doc.splitTextToSize(saneaWinAnsi(`• ${n}`), anchoUtil) as string[];
    yy = asegurarEspacio(yy, partes.length * 3.2 + 2);
    doc.text(partes, MARGEN, yy);
    yy += partes.length * 3.2 + 1.5;
  }
  doc.setTextColor(0);

  doc.putTotalPages("{total_pages_count_string}");
  doc.save(`${inf.archivo}.pdf`);
}

export { NIVEL_COLOR };
