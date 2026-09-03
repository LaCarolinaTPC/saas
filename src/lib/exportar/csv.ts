// Descarga de CSV desde el navegador.
//
// Punto y coma como separador y BOM al inicio: así Excel en español abre el
// archivo en UTF-8 y respeta las columnas sin pedir un asistente de importación.

export type CeldaCsv = string | number | null | undefined;

/** Campo entrecomillado con las comillas dobles duplicadas, según RFC 4180. */
function celda(valor: CeldaCsv) {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

export function descargarCsv(nombre: string, filas: CeldaCsv[][]) {
  const contenido = "\uFEFF" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
