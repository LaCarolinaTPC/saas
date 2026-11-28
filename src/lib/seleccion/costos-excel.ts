// Libro Excel del costo de la selección (24-nov-2026, solo servidor, exceljs).
//
// Resumen (IA, Croma, WhatsApp y cada concepto con su costo por unidad), por
// modelo, Croma por fuente, por día, y el detalle: cada llamada al modelo y
// cada consulta a Croma, con el aspirante.

import ExcelJS from "exceljs";
import { CONCEPTOS_COSTO, etiquetaModelo, type ConsultaCosto, type ConsumoCosto, type DetalleCostos } from "./costos";
import { consultaCobrada, origenConsulta } from "./indicadores";

const INDIGO = "FF4F46E5";
const GRIS = "FFF1F5F9";
const PESOS = '"$"#,##0';
const PESOS_DEC = '"$"#,##0.00';
const USD = '"US$"#,##0.0000';
const ENTERO = "#,##0";

function cabecera(hoja: ExcelJS.Worksheet, titulos: string[]) {
  const r = hoja.addRow(titulos);
  r.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  r.height = 20;
  return r.number;
}

function formatos(hoja: ExcelJS.Worksheet, porColumna: Record<number, string>) {
  for (const [col, fmt] of Object.entries(porColumna)) hoja.getColumn(Number(col)).numFmt = fmt;
}

function tabla(hoja: ExcelJS.Worksheet, filaCabecera: number, columnas: number) {
  hoja.views = [{ state: "frozen", ySplit: filaCabecera }];
  hoja.autoFilter = { from: { row: filaCabecera, column: 1 }, to: { row: filaCabecera, column: columnas } };
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export async function construirExcelCostos({
  detalle: d,
  consumos,
  consultas,
  aspirantes,
}: {
  detalle: DetalleCostos;
  consumos: ConsumoCosto[];
  consultas: ConsultaCosto[];
  aspirantes: Map<string, { nombre: string | null; cedula: string | null }>;
}): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Gestivo · La Carolina De Transporte";
  libro.created = new Date();

  // ── Resumen ────────────────────────────────────────────────────────────────
  const r = libro.addWorksheet("Resumen");
  r.addRow(["Costo de la selección de conductores"]).font = { bold: true, size: 14 };
  r.addRow([`Del ${d.rango.desde} al ${d.rango.hasta}`]);
  r.addRow([`TRM: $${d.trm.toLocaleString("es-CO")} por dólar · Valor de una consulta a Croma: $${d.cromaCostoCop.toLocaleString("es-CO")}`]);
  if (d.croma.sinValor) r.addRow(["El valor de la consulta a Croma está en 0 en Tiempos y reglas: las consultas se cuentan pero no suman al costo."]).font = { italic: true, color: { argb: "FFB45309" } };
  r.addRow([]);
  cabecera(r, ["Total", "Pesos", "Dólares", "Detalle"]);
  const tot = (et: string, cop: number, usd: number, det: string, negrita = false) => {
    const f = r.addRow([et, cop, usd, det]);
    f.getCell(2).numFmt = PESOS;
    f.getCell(3).numFmt = USD;
    if (negrita) f.font = { bold: true };
  };
  tot("Inteligencia artificial", d.ia.cop, d.ia.usd, `${d.ia.llamadas.toLocaleString("es-CO")} llamadas al modelo`);
  tot("Croma", d.croma.cop, d.croma.usd, `${d.croma.cobradas} cobradas · ${d.croma.reutilizadas} reutilizadas (sin costo) · ${d.croma.conError} con error (no se cuentan)`);
  tot("WhatsApp", d.whatsapp.cop, d.whatsapp.usd, "");
  tot("Total", d.total.cop, d.total.usd, "", true);
  const pa = r.addRow(["Por aspirante", d.porAspiranteCop ?? "—", "", `${d.aspirantes} aspirantes en el periodo`]);
  pa.getCell(2).numFmt = PESOS;
  const pc = r.addRow(["Por contratado", d.porContratadoCop ?? "—", "", `${d.contratados} contratados en el periodo`]);
  pc.getCell(2).numFmt = PESOS;
  r.addRow([]);
  cabecera(r, ["Concepto", "Tipo", "Unidades", "Unidad", "Pesos", "Dólares", "Pesos por unidad", "Dólares por unidad", "Llamadas", "Tokens de entrada", "Tokens de salida", "Nota"]);
  for (const c of d.conceptos) {
    const f = r.addRow([
      c.etiqueta,
      c.grupo === "ia" ? "IA" : c.grupo === "croma" ? "Croma" : "WhatsApp",
      c.unidades,
      c.unidad[1],
      c.cop,
      c.usd,
      c.porUnidadCop ?? "—",
      c.porUnidadUsd ?? "—",
      c.llamadas,
      c.tokensEntrada,
      c.tokensSalida,
      c.nota ?? "",
    ]);
    f.getCell(3).numFmt = ENTERO;
    f.getCell(5).numFmt = PESOS;
    f.getCell(6).numFmt = USD;
    f.getCell(7).numFmt = PESOS_DEC;
    f.getCell(8).numFmt = USD;
    f.getCell(9).numFmt = ENTERO;
    f.getCell(10).numFmt = ENTERO;
    f.getCell(11).numFmt = ENTERO;
  }
  r.columns = [{ width: 30 }, { width: 16 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 70 }];

  // ── Por modelo ─────────────────────────────────────────────────────────────
  const m = libro.addWorksheet("Por modelo");
  const cm = cabecera(m, ["Concepto", "Proveedor", "Modelo", "Llamadas", "Tokens de entrada", "Tokens de salida", "Pesos", "Dólares", "Pesos por llamada", "Dólares por llamada"]);
  for (const f of d.modelos) {
    m.addRow([f.etiquetaConcepto, f.proveedor, f.etiquetaModelo, f.llamadas, f.tokensEntrada, f.tokensSalida, f.cop, f.usd, f.porLlamadaCop, f.porLlamadaUsd]);
  }
  formatos(m, { 4: ENTERO, 5: ENTERO, 6: ENTERO, 7: PESOS, 8: USD, 9: PESOS_DEC, 10: USD });
  m.columns = [{ width: 28 }, { width: 13 }, { width: 30 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 16 }];
  tabla(m, cm, 10);

  // ── Croma por fuente ───────────────────────────────────────────────────────
  const fz = libro.addWorksheet("Croma por fuente");
  const cf = cabecera(fz, ["Fuente", "Cobradas", "Reutilizadas (sin costo)", "Con error", "Pesos"]);
  for (const f of d.fuentes) fz.addRow([f.etiqueta, f.cobradas, f.reutilizadas, f.conError, f.cop]);
  formatos(fz, { 2: ENTERO, 3: ENTERO, 4: ENTERO, 5: PESOS });
  fz.columns = [{ width: 28 }, { width: 11 }, { width: 22 }, { width: 11 }, { width: 13 }];
  tabla(fz, cf, 5);

  // ── Por día ────────────────────────────────────────────────────────────────
  const pd = libro.addWorksheet("Por día");
  const cd = cabecera(pd, ["Día", "IA (pesos)", "Croma (pesos)", "Total (pesos)"]);
  for (const f of d.porDia) pd.addRow([f.fecha, f.iaCop, f.cromaCop, f.iaCop + f.cromaCop]);
  formatos(pd, { 2: PESOS, 3: PESOS, 4: PESOS });
  pd.columns = [{ width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }];
  tabla(pd, cd, 4);

  // ── Detalle de IA ──────────────────────────────────────────────────────────
  const di = libro.addWorksheet("Detalle IA");
  const cdi = cabecera(di, ["Fecha y hora", "Concepto", "Proveedor", "Modelo", "Tokens de entrada", "Tokens de salida", "Dólares", "Pesos", "Aspirante", "Cédula"]);
  [...consumos]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((c, i) => {
      const a = c.proceso_id ? aspirantes.get(c.proceso_id) : undefined;
      const usd = Number(c.costo_usd) || 0;
      const f = di.addRow([
        fechaHora(c.created_at),
        CONCEPTOS_COSTO[c.concepto]?.etiqueta ?? c.concepto,
        c.proveedor ?? "",
        etiquetaModelo(c.modelo),
        Number(c.tokens_entrada) || 0,
        Number(c.tokens_salida) || 0,
        usd,
        usd * d.trm,
        a?.nombre ?? (c.proceso_id ? "" : "Sin aspirante (prueba o laboratorio)"),
        a?.cedula ?? "",
      ]);
      if (i % 2 === 1) f.eachCell((x) => (x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } }));
    });
  formatos(di, { 5: ENTERO, 6: ENTERO, 7: USD, 8: PESOS_DEC });
  di.columns = [{ width: 17 }, { width: 26 }, { width: 12 }, { width: 28 }, { width: 15 }, { width: 15 }, { width: 13 }, { width: 12 }, { width: 32 }, { width: 14 }];
  tabla(di, cdi, 10);

  // ── Detalle de Croma ───────────────────────────────────────────────────────
  const dc = libro.addWorksheet("Detalle Croma");
  const cdc = cabecera(dc, ["Fecha y hora", "Fuente", "Estado", "Cómo se lanzó", "¿Se cobra?", "Pesos", "Cédula consultada", "Aspirante"]);
  const ORIGEN: Record<string, string> = { automatica: "Automática", persona: "Una persona", reutilizada: "Reutilizada", manual: "A mano", simulada: "Simulada" };
  [...consultas]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((v) => {
      const cobra = consultaCobrada(v);
      const a = v.proceso_id ? aspirantes.get(v.proceso_id) : undefined;
      dc.addRow([fechaHora(v.created_at), d.fuentes.find((f) => f.fuente === v.fuente)?.etiqueta ?? v.fuente ?? "", v.estado ?? "", ORIGEN[origenConsulta(v)] ?? "", cobra ? "Sí" : "No", cobra ? d.cromaCostoCop : 0, v.cedula ?? "", a?.nombre ?? ""]);
    });
  formatos(dc, { 6: PESOS });
  dc.columns = [{ width: 17 }, { width: 26 }, { width: 12 }, { width: 15 }, { width: 11 }, { width: 11 }, { width: 18 }, { width: 32 }];
  tabla(dc, cdc, 8);

  return Buffer.from(await libro.xlsx.writeBuffer());
}
