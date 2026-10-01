// Excel de la revisión de timbradas de un día, con las hojas del informe que
// Tesorería generaba por fuera (Resumen, Detalle, Por revisar, Alertas) más
// el resultado de la revisión registrado en Gestivo. Colores de fila por
// estado iguales a los del informe original (FILL_ESTADO del script) y las
// columnas informativas de puntos virtuales en gris.

import ExcelJS from "exceljs";
import type { MarcaRevision, RevisionDia } from "./revision-timbradas-data";
import {
  ACCION_REQUERIDA, ESTADOS, FECHA_CAMBIO_TABLA, conteoPorEstado, esAlertaExcel, ordenarAlertas, ordenarFilas,
  requiereRevision, tablasDelDia, textoTramo, totalesSubidasBajadas,
  type EstadoTimbrada, type FilaRevision,
} from "./revision-timbradas-reglas";

const argb = (hex: string) => `FF${hex}`;
const FILL_ESTADO: Record<EstadoTimbrada, string> = {
  "Diferencia Por Revisar": "FFD9D9",
  "Sin Recaudo - Con Timbradas": "CFE2F3",
  "Revisar - Cartulina Con PV": "FFF2CC",
  "Revisar - Sin Datos PV": "F2F2F2",
  "Revisar - Datos Incompletos": "FCE4D6",
  OK: "E2EFDA",
  "N/A - No Despachado": "D9D9D9",
};
const FILL_INFORMATIVA = "D9D9D9";
const FILL_SENSOR_VIEJO = "F8CBAD";
const relleno = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });

interface Columna {
  titulo: string;
  ancho: number;
  valor: (f: FilaRevision, m: MarcaRevision | undefined) => string | number | null;
  informativa?: boolean;
}

function columnas(politicaNueva: boolean): Columna[] {
  const c: Columna[] = [
    { titulo: "Placa", ancho: 9, valor: (f) => f.placa },
    { titulo: "Veh.", ancho: 6, valor: (f) => f.vehiculo },
    { titulo: "Conductor", ancho: 28, valor: (f) => f.conductor },
    { titulo: "Cód.", ancho: 7, valor: (f) => f.codConductor },
    { titulo: "Viaje", ancho: 6, valor: (f) => f.viaje },
    { titulo: "Ruta", ancho: 24, valor: (f) => f.ruta },
    { titulo: "H. Sal.", ancho: 9, valor: (f) => f.horaSalida },
    { titulo: "H. Lle.", ancho: 9, valor: (f) => f.horaLlegada },
    { titulo: "Reg. Sal.", ancho: 9, valor: (f) => f.regSalida, informativa: true },
    { titulo: "Reg. Lle.", ancho: 9, valor: (f) => f.regLlegada, informativa: true },
    { titulo: "Ac. Reg.", ancho: 8, valor: (f) => f.acReg, informativa: true },
    { titulo: "Ac. Sub.", ancho: 8, valor: (f) => f.acSub, informativa: true },
    { titulo: "Ac. Baj.", ancho: 8, valor: (f) => f.acBaj, informativa: true },
    { titulo: "Dif.(S-R)", ancho: 9, valor: (f) => f.difSR, informativa: true },
    { titulo: "Dif.(S-B)", ancho: 9, valor: (f) => f.difSB, informativa: true },
    { titulo: "Tim R", ancho: 7, valor: (f) => f.timR },
    { titulo: "Dcto VR", ancho: 8, valor: (f) => f.dctoVr },
    { titulo: "TD Dcto", ancho: 8, valor: (f) => f.tdDcto },
    { titulo: "Tim Neto", ancho: 9, valor: (f) => f.timNeto },
  ];
  if (!politicaNueva) c.push({ titulo: "Sensor", ancho: 9, valor: (f) => f.sensor });
  c.push(
    { titulo: "Est.Desp.", ancho: 14, valor: (f) => f.estadoDespacho },
    { titulo: "Estado", ancho: 28, valor: (f) => f.estado },
    { titulo: "Observación", ancho: 70, valor: (f) => f.observacion },
    { titulo: "Revisado", ancho: 9, valor: (_f, m) => (m ? "Sí" : null) },
    { titulo: "Resultado revisión", ancho: 30, valor: (_f, m) => m?.resultado ?? null },
    { titulo: "Nota", ancho: 40, valor: (_f, m) => m?.nota ?? null },
    { titulo: "Revisado por", ancho: 28, valor: (_f, m) => m?.revisadoPorEmail ?? null },
    { titulo: "Revisado el", ancho: 18, valor: (_f, m) => (m ? new Date(m.revisadoAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : null) },
  );
  return c;
}

function hojaDetalle(
  wb: ExcelJS.Workbook, nombre: string, titulo: string, filas: FilaRevision[], marcas: Map<number, MarcaRevision>, politicaNueva: boolean,
) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 2 }] });
  const cols = columnas(politicaNueva);
  ws.columns = cols.map((c) => ({ width: c.ancho }));
  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  t.fill = relleno("1F4E79");
  const enc = ws.getRow(2);
  cols.forEach((c, i) => {
    const cell = enc.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = relleno(c.informativa ? "808080" : "2E75B6");
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  for (const f of filas) {
    const m = marcas.get(f.numero);
    const row = ws.addRow(cols.map((c) => c.valor(f, m)));
    const fondo = f.sensor === "VIEJO" ? FILL_SENSOR_VIEJO : FILL_ESTADO[f.estado];
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.fill = relleno(c.informativa && f.sensor !== "VIEJO" ? FILL_INFORMATIVA : fondo);
      cell.font = { size: 10 };
      if (c.titulo === "Observación" || c.titulo === "Nota") cell.alignment = { wrapText: true, vertical: "top" };
    });
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
}

export async function libroRevisionTimbradas(
  rev: RevisionDia, marcasLista: MarcaRevision[], generado: string,
): Promise<{ buffer: ArrayBuffer; archivo: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestivo";
  const marcas = new Map(marcasLista.map((m) => [m.numero, m]));
  const ordenadas = ordenarFilas(rev.filas);
  const conteo = conteoPorEstado(rev.filas);
  const total = rev.filas.length;
  const alertas = ordenarAlertas(ordenadas.filter(esAlertaExcel));
  const porRevisar = ordenadas.filter(requiereRevision);
  const revisadas = porRevisar.filter((f) => marcas.has(f.numero)).length;

  // ── Resumen ──
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 34 }, { width: 12 }, { width: 10 }, { width: 44 }];
  const fila = (vals: (string | number | null)[], opts: { negrita?: boolean; fondo?: string; color?: string } = {}) => {
    const r = ws.addRow(vals);
    r.eachCell((c) => {
      c.font = { bold: !!opts.negrita, size: 10, color: opts.color ? { argb: argb(opts.color) } : undefined };
      if (opts.fondo) c.fill = relleno(opts.fondo);
    });
    return r;
  };
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = `REVISIÓN DE TIMBRADAS — ${rev.fecha}`;
  ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  ws.getCell("A1").fill = relleno("1F4E79");
  fila([`Generado en Gestivo el ${generado}`]);
  fila([
    rev.politicaNueva
      ? `Plan del día: ${rev.festivo ? "Domingo / festivo" : "Lunes a sábado"} (política vigente desde ${FECHA_CAMBIO_TABLA})`
      : "Política anterior al 13/08/2026: tablas de sensores nuevos y viejos",
  ]);
  fila([]);
  fila(["Estado", "Viajes", "%", "Acción requerida"], { negrita: true, fondo: "DEEBF7" });
  for (const e of ESTADOS) {
    fila([e, conteo[e], total ? Number(((100 * conteo[e]) / total).toFixed(1)) : 0, ACCION_REQUERIDA[e]], { fondo: FILL_ESTADO[e] });
  }
  fila(["Total", total, 100, ""], { negrita: true, fondo: "FFF2CC" });
  fila([]);
  fila(["Por revisar", porRevisar.length], { negrita: true });
  fila(["Revisados en Gestivo", revisadas], { negrita: true });
  fila(["Alertas (sin recaudo + diferencias + |Dif.(S-R)|>10)", alertas.length], { negrita: true });
  const sb = totalesSubidasBajadas(rev.filas);
  fila(["Subidas − bajadas (viajes con PV)", sb.dif], { negrita: true });
  fila(["Viajes con |subidas − bajadas| > 10", sb.viajesAltos], { negrita: true });
  fila([]);
  fila(["TABLA DE DESCUENTOS AUTORIZADOS"], { negrita: true, fondo: "2E75B6", color: "FFFFFF" });
  for (const { titulo, tabla } of tablasDelDia(rev.fecha)) {
    fila([titulo, "Descuentos"], { negrita: true, fondo: "DEEBF7" });
    for (const tramo of tabla) fila([`${textoTramo(tramo)} timbradas`, tramo[2]]);
  }
  if (!rev.politicaNueva && rev.placasSensorViejo.length) {
    fila([]);
    fila(["Placas con sensor viejo detectado"], { negrita: true, fondo: FILL_SENSOR_VIEJO });
    fila([rev.placasSensorViejo.join(", ")]);
  }
  if (rev.cobertura.avisos.length) {
    fila([]);
    fila(["Avisos de cobertura de datos"], { negrita: true });
    for (const a of rev.cobertura.avisos) fila([a]);
  }

  hojaDetalle(wb, "Detalle", `Detalle de viajes — ${rev.fecha} (${total})`, ordenadas, marcas, rev.politicaNueva);
  hojaDetalle(wb, "Por revisar", `Por revisar — ${rev.fecha} (${porRevisar.length})`, porRevisar, marcas, rev.politicaNueva);
  hojaDetalle(wb, "Alertas", `Alertas — ${rev.fecha} (${alertas.length}): sin recaudo + diferencias + |Dif.(S-R)|>10`, alertas, marcas, rev.politicaNueva);

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, archivo: `Revision_Timbradas_${rev.fecha}` };
}
