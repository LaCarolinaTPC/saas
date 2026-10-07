// Excel del historial de cámaras y sensores, generado en el navegador con las
// filas que muestra la pantalla. Va con exceljs (no con `xlsx`, que no escribe
// colores) para que el semáforo DFS / caja frente al aforo salga como en pantalla.
import type { RevisionCamaras } from "./camaras-data";
import {
  CONDUCTOR_ORIGEN_LABEL, ELEMENTO_LABEL, NIVEL_COLOR, NIVEL_LABEL, compararConAforo, type TipoNovedad,
} from "./camaras-reglas";

const argb = (hex: string) => `FF${hex.replace("#", "")}`;

export async function descargarExcelCamaras(
  revisiones: RevisionCamaras[],
  tipos: TipoNovedad[],
  recaudo: Record<number, number | null>,
  desde: string,
  hasta: string,
) {
  const Excel = (await import("exceljs")).default;
  const libro = new Excel.Workbook();
  libro.creator = "Gestivo";
  const nombreTipo = new Map(tipos.map((t) => [t.clave, t.nombre]));

  const hoja = libro.addWorksheet("Revisiones");
  const columnas = [
    { titulo: "Fecha viaje", ancho: 11 }, { titulo: "Vehículo", ancho: 9 }, { titulo: "Viaje", ancho: 6 },
    { titulo: "Conductor", ancho: 34 }, { titulo: "Cédula", ancho: 13 }, { titulo: "Origen conductor", ancho: 15 },
    { titulo: "Elemento", ancho: 9 }, { titulo: "Resultado", ancho: 22 }, { titulo: "Falla", ancho: 6 },
    { titulo: "DFS Optocontrol", ancho: 10 }, { titulo: "Aforo", ancho: 8 }, { titulo: "DFS − aforo", ancho: 10 },
    { titulo: "Semáforo DFS", ancho: 12 }, { titulo: "Caja (GEMA)", ancho: 10 }, { titulo: "Caja − aforo", ancho: 10 },
    { titulo: "Semáforo caja", ancho: 12 }, { titulo: "Repetida", ancho: 9 }, { titulo: "Observaciones", ancho: 40 },
    { titulo: "Alertas", ancho: 30 }, { titulo: "Origen", ancho: 11 }, { titulo: "Técnico", ancho: 30 },
  ];
  hoja.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho }));
  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: argb("#FFFFFF") } };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#4F46E5") } };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

  const pintar = (celda: import("exceljs").Cell, nivel: keyof typeof NIVEL_COLOR) => {
    const c = NIVEL_COLOR[nivel];
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(c.suave) } };
    celda.font = { bold: true, color: { argb: argb(c.texto) } };
  };

  for (const r of revisiones) {
    const caja = r.despacho_numero != null ? (recaudo[r.despacho_numero] ?? null) : null;
    const dfs = compararConAforo(r.dfs_optocontrol, r.aforo);
    const cj = compararConAforo(caja, r.aforo);
    const fila = hoja.addRow([
      r.fecha_viaje, r.vehiculo_codigo, r.viaje, r.conductor_nombre ?? "", r.conductor_cedula ?? "",
      CONDUCTOR_ORIGEN_LABEL[r.conductor_origen], ELEMENTO_LABEL[r.elemento], nombreTipo.get(r.tipo_novedad) ?? r.tipo_novedad,
      r.con_falla ? "Sí" : "No", r.dfs_optocontrol ?? "", r.aforo ?? "", dfs.diferencia ?? "", NIVEL_LABEL[dfs.nivel],
      caja ?? "", cj.diferencia ?? "", NIVEL_LABEL[cj.nivel], r.revision_repetida ? "Sí" : "No", r.observaciones ?? "",
      r.alertas.join(", "), r.origen === "migracion" ? "Forms" : "Gestivo", r.tecnico_email ?? "",
    ]);
    if (dfs.nivel !== "sin_dato") pintar(fila.getCell(13), dfs.nivel);
    if (cj.nivel !== "sin_dato") pintar(fila.getCell(16), cj.nivel);
    if (r.con_falla) fila.getCell(9).font = { bold: true, color: { argb: argb(NIVEL_COLOR.critico.texto) } };
  }

  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `camaras_sensores_${desde}_a_${hasta}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
