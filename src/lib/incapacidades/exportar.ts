/**
 * Exportación de los listados del módulo a CSV, Excel y PDF (fase 6). Todo se
 * genera en el navegador con las filas ya cargadas, como en Riesgo y en el
 * informe de cobro de la matriz. El archivo sale de la aplicación y pierde el
 * permiso del módulo: lleva siempre el contexto, la fecha y el aviso.
 */
import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type CeldaPdf, type ColumnaPdf } from "@/lib/exportar/pdf-tabla";
import type { FormatoExport } from "@/lib/exportar/formatos";

export const MODULO_EXPORT = "Recursos Humanos · Recuperación de incapacidades";

export const NOTAS_EXPORT = [
  "Contiene datos personales y de salud de los trabajadores. Úselo dentro de RRHH y Gerencia; no lo reenvíe por correo ni lo suba a la wiki.",
  "Los valores salen de la liquidación vigente de cada expediente con la regla operativa de GESTIVO; «cobrada» significa radicada con código ante la entidad; el saldo es reclamado − abonos aplicados − ajustes que extinguen.",
];

export interface SeccionExport {
  titulo: string;
  color?: string;
  filas: CeldaCsv[][];
}

/** Todo lo que hace falta para generar un archivo; serializable, para pasarlo del servidor al botón. */
export interface DatosExport {
  /** Nombre del archivo sin extensión. */
  archivo: string;
  titulo: string;
  contexto: string[];
  columnas: { titulo: string; ancho?: number; alinear?: "left" | "center" | "right" }[];
  /** Filas planas (CSV/Excel y PDF sin secciones). */
  filas: CeldaCsv[][];
  /** Si viene, el PDF agrupa por sección y el Excel añade una hoja por sección. */
  secciones?: SeccionExport[];
  resumen?: string[];
  notas?: string[];
}

function nombreHoja(titulo: string, usados: Set<string>): string {
  let nombre = titulo.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Hoja";
  let n = 2;
  while (usados.has(nombre)) nombre = `${nombre.slice(0, 25)} ${n++}`;
  usados.add(nombre);
  return nombre;
}

export async function exportarListado(formato: FormatoExport, d: DatosExport): Promise<void> {
  const cabecera = d.columnas.map((c) => c.titulo);
  const notas = d.notas ?? NOTAS_EXPORT;
  const filasPlanas = d.secciones ? d.secciones.flatMap((s) => s.filas) : d.filas;

  if (formato === "csv") {
    return descargarCsv(`${d.archivo}.csv`, [cabecera, ...filasPlanas]);
  }

  if (formato === "xlsx") {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const usados = new Set<string>();
    const anchos = d.columnas.map((c) => ({ wch: Math.max(10, Math.round((c.ancho ?? 24) * 0.6)) }));
    const hoja = XLSX.utils.aoa_to_sheet([[d.titulo], ...d.contexto.map((c) => [c]), [], cabecera, ...filasPlanas, [], ...notas.map((n) => [n])]);
    hoja["!cols"] = anchos;
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja("Listado", usados));
    for (const s of d.secciones ?? []) {
      const h = XLSX.utils.aoa_to_sheet([[s.titulo], cabecera, ...s.filas]);
      h["!cols"] = anchos;
      XLSX.utils.book_append_sheet(libro, h, nombreHoja(s.titulo, usados));
    }
    XLSX.writeFile(libro, `${d.archivo}.xlsx`);
    return;
  }

  const columnas: ColumnaPdf[] = d.columnas.map((c) => ({ titulo: c.titulo, ancho: c.ancho, alinear: c.alinear }));
  await descargarPdfTabla({
    archivo: d.archivo,
    modulo: MODULO_EXPORT,
    titulo: d.titulo,
    contexto: d.contexto,
    resumen: d.resumen,
    columnas,
    filas: d.secciones ? [] : (d.filas as CeldaPdf[][]),
    secciones: d.secciones?.map((s) => ({ titulo: s.titulo, color: s.color, filas: s.filas as CeldaPdf[][] })),
    notas,
    orientacion: "landscape",
    vacio: "Sin filas con estos filtros.",
  });
}

export function sufijoArchivo(texto: string | null | undefined): string {
  const limpio = (texto ?? "")
    .normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  return limpio ? `_${limpio}` : "";
}

export function hoyArchivo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}
