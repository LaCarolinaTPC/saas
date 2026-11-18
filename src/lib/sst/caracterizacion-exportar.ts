import type { Caracterizacion, Conteo } from "./reglas";
import { descargarCsv } from "@/lib/exportar/csv";

export type FilaCaracterizacion = (string | number)[];
export interface InformeCaracterizacion {
  filtros: string;
  generado: string;
  resumen: { indicador: string; valor: number; detalle: string }[];
  distribuciones: { titulo: string; datos: Conteo[] }[];
  repetidos: { nombre: string; n: number }[];
  total: number;
}

/** Recibe exactamente el agregado de la pantalla; no consulta ni amplía datos. */
export function prepararCaracterizacion(c: Caracterizacion, filtros: string, generado: string): InformeCaracterizacion {
  return {
    filtros, generado, total: c.total,
    resumen: [
      { indicador: "Accidentes de trabajo", valor: c.total, detalle: `${c.trabajadores} trabajadores` },
      { indicador: "Trabajadores afectados", valor: c.trabajadores, detalle: "" },
      { indicador: "Días de incapacidad", valor: c.diasIncapacidad, detalle: "" },
      { indicador: "Promedio de días por accidente", valor: c.promedioDias, detalle: "" },
      { indicador: "Accidentes de tránsito", valor: c.transito, detalle: `${c.total ? Math.round(c.transito * 100 / c.total) : 0}% de los accidentes` },
      { indicador: "Trabajadores con más de un accidente", valor: c.repetidos.length, detalle: c.repetidos.length ? "" : "Ningún trabajador repite" },
    ],
    distribuciones: [
      { titulo: "Parte del cuerpo", datos: c.porParteCuerpo },
      { titulo: "Mes", datos: c.porMes },
      { titulo: "Día de ocurrencia", datos: c.porDia },
      { titulo: "Tipo de lesión", datos: c.porTipoLesion },
      { titulo: "Mecanismo del accidente", datos: c.porMecanismo },
      { titulo: "Agente del accidente", datos: c.porAgente },
      { titulo: "Cargo del trabajador", datos: c.porCargo },
      { titulo: "Sexo", datos: c.porSexo },
    ].map((d) => ({ ...d, datos: d.datos.map((fila) => ({ ...fila })) })),
    repetidos: c.repetidos.map(({ nombre, n }) => ({ nombre, n })),
  };
}

/** Defensa para textos libres al abrir CSV/Excel; los números siguen numéricos. */
export function textoSeguroHoja(valor: string | number): string | number {
  return typeof valor === "string" && /^[\s\uFEFF]*[=+\-@]/u.test(valor) ? `'${valor}` : valor;
}

export function filasCsvCaracterizacion(inf: InformeCaracterizacion): FilaCaracterizacion[] {
  const filas: FilaCaracterizacion[] = [
    ["Sección", "Categoría / indicador", "Valor", "Porcentaje", "Detalle"],
    ["Consulta", "Filtros", "", "", inf.filtros],
    ["Consulta", "Generado", "", "", inf.generado],
    ...inf.resumen.map((r) => ["Resumen", r.indicador, r.valor, "", r.detalle]),
  ];
  for (const d of inf.distribuciones) {
    filas.push(...d.datos.map((r) => [d.titulo, r.label, r.n, r.pct, ""]));
    filas.push([d.titulo, "TOTAL", inf.total, inf.total ? 100 : 0, ""]);
  }
  filas.push(...inf.repetidos.map((r) => ["Reincidencia", r.nombre, r.n, "", "Accidentes"]));
  if (!inf.repetidos.length) filas.push(["Reincidencia", "Ningún trabajador repite", 0, "", ""]);
  return filas.map((fila) => fila.map(textoSeguroHoja));
}

export function hojasCaracterizacion(inf: InformeCaracterizacion): { nombre: string; filas: FilaCaracterizacion[] }[] {
  const contexto = [["Caracterización de la accidentalidad"], ["Filtros", inf.filtros], ["Generado", inf.generado], []];
  const distribuciones: FilaCaracterizacion[] = [...contexto, ["Distribución", "Categoría", "Número", "Porcentaje (0–100)"]];
  for (const d of inf.distribuciones) {
    distribuciones.push(...d.datos.map((r) => [d.titulo, r.label, r.n, r.pct]));
    distribuciones.push([d.titulo, "TOTAL", inf.total, inf.total ? 100 : 0]);
  }
  return [
    { nombre: "Resumen", filas: [...contexto, ["Indicador", "Valor", "Detalle"], ...inf.resumen.map((r) => [r.indicador, r.valor, r.detalle])] },
    { nombre: "Distribuciones", filas: distribuciones },
    { nombre: "Reincidencia", filas: [...contexto, ["Trabajador", "Accidentes"], ...(
      inf.repetidos.length ? inf.repetidos.map((r) => [r.nombre, r.n]) : [["Ningún trabajador repite", 0]]
    )] },
  ].map((h) => ({ ...h, filas: h.filas.map((fila) => fila.map(textoSeguroHoja)) }));
}

export async function descargarCaracterizacionHoja(inf: InformeCaracterizacion, formato: "xlsx" | "csv", archivo: string): Promise<void> {
  if (formato === "csv") return descargarCsv(`${archivo}.csv`, filasCsvCaracterizacion(inf));
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  for (const h of hojasCaracterizacion(inf)) {
    const hoja = XLSX.utils.aoa_to_sheet(h.filas);
    hoja["!cols"] = [{ wch: 44 }, { wch: 58 }, { wch: 32 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre);
  }
  XLSX.writeFile(libro, `${archivo}.xlsx`);
}
