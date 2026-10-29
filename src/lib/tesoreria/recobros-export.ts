// Excel de la página de Recobros, generado en el navegador con las filas que
// se ven (con los filtros aplicados). Va con exceljs, no con `xlsx`, para que
// el semáforo y los días sin registro del cajero salgan con su color, igual
// que en pantalla (modelo: src/lib/operativo/velocidad-export.ts).
//
// Hojas: «Bandeja» (una fila por solicitud) y «Gestiones» (el historial
// completo de cada recobro, con los días hábiles sin registro del cajero), que
// es el que Tesorería pidió exportar por conductor o por periodo.

import type ExcelJS from "exceljs";
import { ESTADO_LABEL, type Semaforo } from "./recobros";
import type { FilaBandeja } from "./recobros-vista";

const argb = (hex: string) => `FF${hex.replace("#", "")}`;
const COLOR = {
  indigo: argb("#4F46E5"), blanco: argb("#FFFFFF"), rojoTexto: argb("#B91C1C"), rojoFondo: argb("#FEE2E2"),
};
const SEMAFORO: Record<Semaforo, { fondo: string; texto: string; label: string }> = {
  verde: { fondo: argb("#D1FAE5"), texto: argb("#065F46"), label: "Verde" },
  ambar: { fondo: argb("#FEF3C7"), texto: argb("#92400E"), label: "Ámbar" },
  rojo: { fondo: argb("#FEE2E2"), texto: argb("#991B1B"), label: "Rojo" },
  gris: { fondo: argb("#F1F5F9"), texto: argb("#334155"), label: "Cerrado" },
};
const relleno = (color: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: color } });
const TIPO = { camara: "Cámara", cartulina: "Cartulina" } as const;

export async function exportarRecobrosExcel({
  filas, titulo, contexto, nombreArchivo, nombreResultado,
}: {
  filas: FilaBandeja[];
  titulo: string;
  contexto: string[];
  nombreArchivo: string;
  nombreResultado: (clave: string) => string;
}) {
  const Excel = (await import("exceljs")).default;
  const libro = new Excel.Workbook();
  libro.creator = "Gestivo · La Carolina De Transporte";
  libro.created = new Date();

  const cabecera = (fila: ExcelJS.Row) => {
    fila.eachCell((c) => {
      c.font = { bold: true, color: { argb: COLOR.blanco } };
      c.fill = relleno(COLOR.indigo);
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    fila.height = 30;
  };
  const encabezado = (hoja: ExcelJS.Worksheet) => {
    hoja.addRow([titulo]).font = { bold: true, size: 13 };
    for (const c of contexto) hoja.addRow([c]);
    hoja.addRow([]);
    return 2 + contexto.length + 1;
  };

  // ── Bandeja ──
  const bandeja = libro.addWorksheet("Bandeja");
  const filaCab = encabezado(bandeja);
  cabecera(bandeja.addRow([
    "Semáforo", "Despacho", "Fecha viaje", "Tipo", "Buseta", "Placa", "Conductor", "Cédula", "Ruta",
    "Registradora", "Cámara", "Diferencia", "Valor", "Recibido", "Saldo", "Estado", "Días en el estado",
    "Días sin pagar", "Días sin registro del cajero", "Última gestión", "Cajero", "Resultado", "Compromiso",
  ]));
  for (const f of filas) {
    const r = bandeja.addRow([
      SEMAFORO[f.semaforo].label, f.numero, f.fechaViaje, TIPO[f.tipo], f.vehiculoCodigo ?? "", f.placa ?? "",
      f.conductorNombre ?? "", f.conductorCedula ?? "", f.ruta ?? "",
      f.registradora, f.tipo === "camara" ? f.conteo ?? "sin conteo" : "", f.diferencia, f.valorRecobro, f.recibido, f.saldo,
      f.textoEstado, f.diasEnEstado, f.diasSinPagar ?? "", f.diasSinRegistro.length || "",
      f.ultimaGestion?.fecha ?? "", f.ultimaGestion?.usuario ?? "", f.ultimaGestion?.resultado ?? "", f.ultimaGestion?.compromiso ?? "",
    ]);
    const s = SEMAFORO[f.semaforo];
    r.getCell(1).fill = relleno(s.fondo);
    r.getCell(1).font = { bold: true, color: { argb: s.texto } };
    if ((f.diferencia ?? 0) > 0) r.getCell(12).font = { bold: true, color: { argb: COLOR.rojoTexto } };
    if (f.diasSinRegistro.length) r.getCell(19).font = { bold: true, color: { argb: COLOR.rojoTexto } };
    for (const c of [13, 14, 15]) r.getCell(c).numFmt = '"$"#,##0';
  }
  bandeja.columns = [10, 11, 11, 10, 8, 9, 30, 13, 22, 11, 9, 10, 12, 12, 12, 34, 9, 9, 12, 12, 26, 26, 12].map((w) => ({ width: w }));
  bandeja.views = [{ state: "frozen", ySplit: filaCab }];
  bandeja.autoFilter = { from: { row: filaCab, column: 1 }, to: { row: filaCab, column: 23 } };

  // ── Gestiones (historial permanente, con los días sin registro) ──
  const hist = libro.addWorksheet("Gestiones");
  const cabHist = encabezado(hist);
  cabecera(hist.addRow([
    "Despacho", "Fecha viaje", "Conductor", "Cédula", "Buseta", "Fecha gestión", "Registrada", "Quién", "Rol",
    "Resultado", "Compromiso", "Valor recibido", "Autorizó", "Observación", "Estado actual del recobro",
  ]));
  for (const f of filas) {
    const items: { fecha: string; fila: (string | number | null)[]; sinRegistro: boolean }[] = [
      ...f.gestiones.map((g) => ({
        fecha: g.fecha,
        sinRegistro: false,
        fila: [
          g.fecha, new Date(g.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }), g.usuarioEmail ?? "", g.rol,
          nombreResultado(String(g.resultado)), g.compromisoFecha ?? "", g.valorRecibido, g.autorizadoPor ?? "", g.observacion ?? "",
        ],
      })),
      ...f.diasSinRegistro.map((d) => ({ fecha: d, sinRegistro: true, fila: [d, "", "", "", "Sin registro del cajero", "", null, "", ""] })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (const it of items) {
      const r = hist.addRow([
        f.numero, f.fechaViaje, f.conductorNombre ?? "", f.conductorCedula ?? "", f.vehiculoCodigo ?? "",
        ...it.fila, ESTADO_LABEL[f.estado.estado],
      ]);
      r.getCell(12).numFmt = '"$"#,##0';
      if (it.sinRegistro) {
        for (const c of [6, 10]) {
          r.getCell(c).fill = relleno(COLOR.rojoFondo);
          r.getCell(c).font = { bold: true, color: { argb: COLOR.rojoTexto } };
        }
      }
    }
  }
  hist.columns = [11, 11, 30, 13, 8, 12, 20, 26, 10, 28, 12, 13, 22, 50, 26].map((w) => ({ width: w }));
  hist.views = [{ state: "frozen", ySplit: cabHist }];
  hist.autoFilter = { from: { row: cabHist, column: 1 }, to: { row: cabHist, column: 15 } };

  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
