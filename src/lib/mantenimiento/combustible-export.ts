// Excel del historial de combustible, generado en el navegador con las filas
// que muestra la pantalla. Va con exceljs (no con `xlsx`, que no escribe
// estilos): encabezado de color, filtros y totales por bus y por día.
import type { TanqueoFila } from "./combustible-data";
import { ALERTA_COMBUSTIBLE_LABEL, type AlertaCombustible } from "./combustible-alertas";

const argb = (hex: string) => `FF${hex.replace("#", "")}`;

export interface TotalAgrupado {
  clave: string;
  placa: string | null;
  tanqueos: number;
  galones: number;
  valor: number;
  dias: number;
  buses: number;
}

/** Totales por una clave (bus o día). La placa es la más reciente del grupo. */
export function agrupar(tanqueos: TanqueoFila[], clave: (t: TanqueoFila) => string): TotalAgrupado[] {
  const mapa = new Map<string, TotalAgrupado & { fechas: Set<string>; codigos: Set<string> }>();
  for (const t of tanqueos) {
    const k = clave(t);
    let g = mapa.get(k);
    if (!g) {
      g = { clave: k, placa: t.placa, tanqueos: 0, galones: 0, valor: 0, dias: 0, buses: 0, fechas: new Set(), codigos: new Set() };
      mapa.set(k, g);
    }
    g.tanqueos++;
    g.galones += t.galones;
    g.valor += t.valor;
    g.fechas.add(t.fecha);
    g.codigos.add(t.vehiculo_codigo);
  }
  return [...mapa.values()].map(({ fechas, codigos, ...g }) => ({ ...g, dias: fechas.size, buses: codigos.size }));
}

export const etiquetasAlertas = (alertas: string[]) =>
  alertas.map((a) => ALERTA_COMBUSTIBLE_LABEL[a as AlertaCombustible] ?? a).join(", ");

export async function descargarExcelCombustible(tanqueos: TanqueoFila[], desde: string, hasta: string) {
  const Excel = (await import("exceljs")).default;
  const libro = new Excel.Workbook();
  libro.creator = "Gestivo";

  const estilar = (hoja: import("exceljs").Worksheet, columnas: { titulo: string; ancho: number; formato?: string }[]) => {
    hoja.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho, style: c.formato ? { numFmt: c.formato } : {} }));
    const encabezado = hoja.getRow(1);
    encabezado.font = { bold: true, color: { argb: argb("#FFFFFF") } };
    encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#4F46E5") } };
    hoja.views = [{ state: "frozen", ySplit: 1 }];
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  };
  const PESOS = '"$" #,##0';
  const GAL = "#,##0.000";

  const detalle = libro.addWorksheet("Tanqueos");
  estilar(detalle, [
    { titulo: "Fecha", ancho: 11 }, { titulo: "Hora", ancho: 9 }, { titulo: "Bus", ancho: 7 }, { titulo: "Placa", ancho: 9 },
    { titulo: "Factura", ancho: 10 }, { titulo: "Producto", ancho: 13 }, { titulo: "Galones", ancho: 10, formato: GAL },
    { titulo: "Valor", ancho: 12, formato: PESOS }, { titulo: "$ por galón", ancho: 11, formato: PESOS },
    { titulo: "Alertas", ancho: 40 }, { titulo: "Archivo", ancho: 40 },
  ]);
  for (const t of tanqueos) {
    const fila = detalle.addRow([
      t.fecha, t.hora ?? "", t.vehiculo_codigo, t.placa ?? "", t.factura, t.producto ?? "", t.galones, t.valor, t.precio_galon,
      etiquetasAlertas(t.alertas), t.archivo_nombre ?? "",
    ]);
    if (t.alertas.length) fila.getCell(10).font = { color: { argb: argb("#B45309") } };
  }

  const resumen = (nombre: string, titulo: string, grupos: TotalAgrupado[], conPlaca: boolean) => {
    const hoja = libro.addWorksheet(nombre);
    estilar(hoja, [
      { titulo, ancho: 11 }, ...(conPlaca ? [{ titulo: "Placa", ancho: 9 }] : []), { titulo: "Tanqueos", ancho: 9 },
      { titulo: conPlaca ? "Días con tanqueo" : "Buses", ancho: 10 }, { titulo: "Galones", ancho: 11, formato: GAL },
      { titulo: "Valor", ancho: 14, formato: PESOS }, { titulo: "$ por galón", ancho: 11, formato: PESOS },
    ]);
    for (const g of grupos) {
      hoja.addRow([g.clave, ...(conPlaca ? [g.placa ?? ""] : []), g.tanqueos, conPlaca ? g.dias : g.buses, g.galones, g.valor, g.galones ? g.valor / g.galones : null]);
    }
  };
  resumen(
    "Por bus", "Bus",
    agrupar(tanqueos, (t) => t.vehiculo_codigo).sort((a, b) => b.galones - a.galones),
    true,
  );
  resumen("Por día", "Fecha", agrupar(tanqueos, (t) => t.fecha).sort((a, b) => a.clave.localeCompare(b.clave)), false);

  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `combustible_${desde}_a_${hasta}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
