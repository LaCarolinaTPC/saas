/**
 * Conductores · descarga a Excel del listado (con causas de retiro).
 *
 * La parte pura (filas, días laborados, resumen) se prueba sin exceljs; el
 * libro se arma en el navegador con los conductores ya filtrados en pantalla.
 */

import { TIPO_RETIRO_LABEL, causaLabel, causaRetiro, type RetiroRegistrado } from "./retiro";

export interface ConductorExport {
  cedula: string;
  nombre: string;
  codigo: string | null;
  tipo_conductor: string | null;
  estado: string | null;
  fecha_ingreso: string | null;
  fecha_retiro: string | null;
  celular: string | null;
  correo: string | null;
}

export interface FilaRetiro {
  nombre: string;
  cedula: string;
  codigo: string;
  cargo: string;
  estado: string;
  celular: string;
  correo: string;
  fechaIngreso: Date | null;
  fechaRetiro: Date | null;
  /** "2026-08": mes del retiro, para filtrar o agrupar en Excel. */
  mesRetiro: string;
  diasLaborados: number | null;
  tipoCausa: string;
  causa: string;
  nota: string;
  registradoPor: string;
  registradoEl: Date | null;
}

const esRetirado = (estado: string | null) => (estado ?? "").toUpperCase() === "RETIRADO";

/** "2026-08-10" → fecha en UTC a medianoche (Excel la muestra tal cual, sin correr un día). */
export function fechaExcel(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/** Días calendario entre ingreso y retiro; null si falta alguna fecha o están al revés. */
export function diasLaborados(ingreso: string | null, retiro: string | null): number | null {
  const a = fechaExcel(ingreso);
  const b = fechaExcel(retiro);
  if (!a || !b) return null;
  const dias = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return dias >= 0 ? dias : null;
}

/**
 * Una fila por conductor. `retiroDe` devuelve la causa vigente del retirado
 * (la misma que se ve en la tabla); los activos quedan sin causa.
 */
export function filasExport<C extends ConductorExport>(
  conductores: C[],
  retiroDe: (c: C) => RetiroRegistrado | null
): FilaRetiro[] {
  return conductores.map((c) => {
    const retirado = esRetirado(c.estado);
    const r = retirado ? retiroDe(c) : null;
    const causa = causaRetiro(r?.causa);
    return {
      nombre: c.nombre,
      cedula: c.cedula,
      codigo: c.codigo ?? "",
      cargo: c.tipo_conductor ?? "",
      estado: c.estado ?? "",
      celular: c.celular ?? "",
      correo: c.correo ?? "",
      fechaIngreso: fechaExcel(c.fecha_ingreso),
      fechaRetiro: retirado ? fechaExcel(c.fecha_retiro) : null,
      mesRetiro: retirado ? (c.fecha_retiro?.slice(0, 7) ?? "") : "",
      diasLaborados: retirado ? diasLaborados(c.fecha_ingreso, c.fecha_retiro) : null,
      tipoCausa: causa ? TIPO_RETIRO_LABEL[causa.tipo] : "",
      causa: retirado ? (r ? causaLabel(r.causa) : "Sin registrar") : "",
      nota: r?.nota ?? "",
      registradoPor: r ? (r.actualizadoPor ?? r.registradoPor ?? "") : "",
      registradoEl: r ? new Date(r.actualizadoAt) : null,
    };
  });
}

export interface ResumenCausa {
  tipo: string;
  causa: string;
  cantidad: number;
}

/** Retirados por causa, de mayor a menor; "Sin registrar" al final. */
export function resumenPorCausa(filas: FilaRetiro[]): ResumenCausa[] {
  const m = new Map<string, ResumenCausa>();
  for (const f of filas) {
    if (!f.causa) continue;
    const k = `${f.tipoCausa}|${f.causa}`;
    const x = m.get(k) ?? { tipo: f.tipoCausa, causa: f.causa, cantidad: 0 };
    x.cantidad++;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => {
    const sa = a.causa === "Sin registrar" ? 1 : 0;
    const sb = b.causa === "Sin registrar" ? 1 : 0;
    return sa - sb || b.cantidad - a.cantidad || a.causa.localeCompare(b.causa);
  });
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-08" → "agosto 2026". */
export function nombreMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  return m ? `${MESES[+m[2] - 1]} ${m[1]}` : mes;
}

export interface ResumenMes {
  mes: string;
  total: number;
  voluntario: number;
  empresa: number;
  otro: number;
  sinCausa: number;
}

/** Retirados por mes de retiro (más reciente primero), abiertos por tipo de causa. */
export function resumenPorMes(filas: FilaRetiro[]): ResumenMes[] {
  const m = new Map<string, ResumenMes>();
  for (const f of filas) {
    if (!f.causa) continue;
    const mes = f.mesRetiro || "Sin fecha";
    const x = m.get(mes) ?? { mes, total: 0, voluntario: 0, empresa: 0, otro: 0, sinCausa: 0 };
    x.total++;
    if (f.tipoCausa === TIPO_RETIRO_LABEL.voluntario) x.voluntario++;
    else if (f.tipoCausa === TIPO_RETIRO_LABEL.empresa) x.empresa++;
    else if (f.tipoCausa === TIPO_RETIRO_LABEL.otro) x.otro++;
    else x.sinCausa++;
    m.set(mes, x);
  }
  return [...m.values()].sort((a, b) =>
    a.mes === "Sin fecha" ? 1 : b.mes === "Sin fecha" ? -1 : b.mes.localeCompare(a.mes)
  );
}

const INDIGO = "FF4F46E5";
const GRIS_FILA = "FFF8FAFC";

/** Libro con el listado filtrado y, si hay retirados, el resumen por causa. */
export async function construirExcelConductores(filas: FilaRetiro[], filtros: string[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Conductores", { views: [{ state: "frozen", ySplit: 4 }] });

  const COLS: { titulo: string; ancho: number; fecha?: boolean; ajustar?: boolean }[] = [
    { titulo: "Nombre", ancho: 32 },
    { titulo: "Cédula", ancho: 13 },
    { titulo: "Código", ancho: 9 },
    { titulo: "Cargo", ancho: 16 },
    { titulo: "Estado", ancho: 11 },
    { titulo: "Celular", ancho: 13 },
    { titulo: "Correo", ancho: 26 },
    { titulo: "Fecha ingreso", ancho: 12, fecha: true },
    { titulo: "Fecha retiro", ancho: 12, fecha: true },
    { titulo: "Mes retiro", ancho: 15 },
    { titulo: "Días laborados", ancho: 10 },
    { titulo: "Tipo de causa", ancho: 22 },
    { titulo: "Causa de retiro", ancho: 34, ajustar: true },
    { titulo: "Nota", ancho: 48, ajustar: true },
    { titulo: "Causa registrada por", ancho: 26 },
    { titulo: "Fecha registro causa", ancho: 12, fecha: true },
  ];
  hoja.columns = COLS.map((c) => ({ width: c.ancho }));

  hoja.mergeCells(1, 1, 1, COLS.length);
  const titulo = hoja.getCell(1, 1);
  titulo.value = "GESTIVO · Listado de conductores";
  titulo.font = { bold: true, size: 14, color: { argb: "FF312E81" } };
  hoja.getRow(1).height = 24;
  hoja.mergeCells(2, 1, 2, COLS.length);
  const retirados = filas.filter((f) => f.causa).length;
  const sub = hoja.getCell(2, 1);
  sub.value =
    `${filas.length.toLocaleString("es-CO")} conductores` +
    (retirados ? ` (${retirados.toLocaleString("es-CO")} retirados)` : "") +
    ` · generado ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`;
  sub.font = { size: 9, color: { argb: "FF64748B" } };
  hoja.mergeCells(3, 1, 3, COLS.length);
  const fil = hoja.getCell(3, 1);
  fil.value = filtros.length ? `Filtros: ${filtros.join(" · ")}` : "Sin filtros";
  fil.font = { size: 9, italic: true, color: { argb: "FF64748B" } };

  const cab = hoja.getRow(4);
  COLS.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
    cel.alignment = { vertical: "middle", wrapText: true };
  });
  cab.height = 30;

  filas.forEach((f, idx) => {
    const valores = [
      f.nombre, f.cedula, f.codigo, f.cargo, f.estado, f.celular, f.correo,
      f.fechaIngreso, f.fechaRetiro, f.mesRetiro ? nombreMes(f.mesRetiro) : "", f.diasLaborados, f.tipoCausa, f.causa, f.nota,
      f.registradoPor, f.registradoEl,
    ];
    const row = hoja.getRow(idx + 5);
    valores.forEach((v, i) => {
      const cel = row.getCell(i + 1);
      cel.value = v === "" ? null : v;
      cel.font = { size: 10 };
      cel.alignment = { vertical: "top", wrapText: Boolean(COLS[i].ajustar) };
      if (COLS[i].fecha) cel.numFmt = "dd/mm/yyyy";
      if (idx % 2 === 1) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_FILA } };
    });
  });
  hoja.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS.length } };

  const porMes = resumenPorMes(filas);
  if (porMes.length) {
    const h = libro.addWorksheet("Retiros por mes");
    h.columns = [{ width: 18 }, { width: 11 }, { width: 22 }, { width: 22 }, { width: 14 }, { width: 14 }];
    const r = h.getRow(1);
    ["Mes de retiro", "Retirados", TIPO_RETIRO_LABEL.voluntario, TIPO_RETIRO_LABEL.empresa, TIPO_RETIRO_LABEL.otro, "Sin causa"].forEach((t, i) => {
      const c = r.getCell(i + 1);
      c.value = t;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
      c.alignment = { wrapText: true, vertical: "middle" };
    });
    r.height = 30;
    for (const x of porMes) h.addRow([nombreMes(x.mes), x.total, x.voluntario, x.empresa, x.otro, x.sinCausa]);
    const sum = (k: keyof Omit<ResumenMes, "mes">) => porMes.reduce((s, x) => s + x[k], 0);
    const t = h.addRow(["Total", sum("total"), sum("voluntario"), sum("empresa"), sum("otro"), sum("sinCausa")]);
    t.font = { bold: true };
  }

  const resumen = resumenPorCausa(filas);
  if (resumen.length) {
    const h = libro.addWorksheet("Resumen por causa");
    h.columns = [{ width: 24 }, { width: 40 }, { width: 12 }, { width: 10 }];
    const r = h.getRow(1);
    ["Tipo de causa", "Causa de retiro", "Retirados", "%"].forEach((t, i) => {
      const c = r.getCell(i + 1);
      c.value = t;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
    });
    const total = resumen.reduce((s, x) => s + x.cantidad, 0);
    resumen.forEach((x) => {
      const row = h.addRow([x.tipo, x.causa, x.cantidad, x.cantidad / total]);
      row.getCell(4).numFmt = "0.0%";
    });
    const t = h.addRow(["", "Total", total, 1]);
    t.font = { bold: true };
    t.getCell(4).numFmt = "0.0%";
  }

  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
