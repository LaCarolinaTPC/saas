// Excel del historial de revisiones preoperacionales, generado en el navegador
// con las filas que muestra la pantalla. Va con exceljs (no con `xlsx`, que no
// escribe colores) para que el resultado salga con el semáforo de la pantalla.
// Dos hojas: una fila por revisión y una fila por punto que falló.
import type { RevisionPreop } from "./preoperacional-data";
import { nombrePunto, PUNTO_POR_KEY, GRUPOS_PREOP } from "./preoperacional-lista";
import { RESULTADO_COLOR, RESULTADO_LABEL } from "./preoperacional-reglas";

const argb = (hex: string) => `FF${hex.replace("#", "")}`;

function horaBogota(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
}

const nombreGrupo = (key: string) => GRUPOS_PREOP.find((g) => g.key === PUNTO_POR_KEY.get(key)?.grupo)?.nombre ?? "";

export async function descargarExcelPreoperacional(revisiones: RevisionPreop[], desde: string, hasta: string) {
  const Excel = (await import("exceljs")).default;
  const libro = new Excel.Workbook();
  libro.creator = "Gestivo";

  const encabezar = (hoja: import("exceljs").Worksheet, columnas: { titulo: string; ancho: number }[]) => {
    hoja.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho }));
    const fila = hoja.getRow(1);
    fila.font = { bold: true, color: { argb: argb("#FFFFFF") } };
    fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#4F46E5") } };
    hoja.views = [{ state: "frozen", ySplit: 1 }];
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  };

  const hojaRev = libro.addWorksheet("Revisiones");
  encabezar(hojaRev, [
    { titulo: "Fecha", ancho: 11 }, { titulo: "Hora", ancho: 8 }, { titulo: "Vehículo", ancho: 9 }, { titulo: "Placa", ancho: 9 },
    { titulo: "Resultado", ancho: 20 }, { titulo: "Fallas", ancho: 7 }, { titulo: "Críticas", ancho: 8 },
    { titulo: "Doc. vencidos", ancho: 12 }, { titulo: "Puntos que fallaron", ancho: 60 }, { titulo: "Conductor", ancho: 32 },
    { titulo: "Cédula", ancho: 13 }, { titulo: "Observaciones", ancho: 40 }, { titulo: "Inspector", ancho: 30 },
    { titulo: "Duración (s)", ancho: 11 },
  ]);
  for (const r of revisiones) {
    const fila = hojaRev.addRow([
      r.fecha, horaBogota(r.created_at), r.codigo_vehiculo, r.placa ?? "", RESULTADO_LABEL[r.resultado], r.fallas,
      r.fallas_criticas, r.documentos_vencidos, r.detalle.map((f) => nombrePunto(f.item_key)).join(", "),
      r.conductor_nombre ?? "", r.cedula_conductor ?? "", r.observaciones ?? "", r.inspector_email ?? "", r.duracion_seg ?? "",
    ]);
    const c = RESULTADO_COLOR[r.resultado];
    const celda = fila.getCell(5);
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(c.suave) } };
    celda.font = { bold: true, color: { argb: argb(c.texto) } };
  }

  const hojaFallas = libro.addWorksheet("Fallas");
  encabezar(hojaFallas, [
    { titulo: "Fecha", ancho: 11 }, { titulo: "Vehículo", ancho: 9 }, { titulo: "Grupo", ancho: 20 }, { titulo: "Punto", ancho: 42 },
    { titulo: "Crítico", ancho: 8 }, { titulo: "Nota", ancho: 40 }, { titulo: "Concepto Mantenimiento", ancho: 22 },
    { titulo: "Reporte en Mantenimiento", ancho: 22 },
  ]);
  for (const r of revisiones) {
    for (const f of r.detalle) {
      const fila = hojaFallas.addRow([
        r.fecha, r.codigo_vehiculo, nombreGrupo(f.item_key), nombrePunto(f.item_key), f.critico ? "Sí" : "No",
        f.nota ?? "", f.concepto ?? "", f.mantenimiento_reporte_id ? "Sí" : f.concepto ? "No" : "No aplica",
      ]);
      if (f.critico) fila.getCell(5).font = { bold: true, color: { argb: argb(RESULTADO_COLOR.no_apto.texto) } };
    }
  }

  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `preoperacional_${desde}_a_${hasta}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
