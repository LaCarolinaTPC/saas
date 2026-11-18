import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { caracterizar } from "./reglas";
import {
  prepararCaracterizacion, hojasCaracterizacion, filasCsvCaracterizacion,
  descargarCaracterizacionHoja, textoSeguroHoja,
} from "./caracterizacion-exportar";
import { crearPdfCaracterizacion } from "./caracterizacion-pdf";

const caso = {
  fechaAt: "2026-03-12", cedula: "123456789", nombre: 'María; "Pérez"',
  cargo: "Conducción", sexo: "F" as const, tipoLesion: "golpe_contusion" as const,
  parteCuerpoGrupo: "manos" as const, mecanismo: "atrapamiento" as const,
  agente: "medios_transporte" as const, accidenteTransito: true, diasIncapacidad: 5,
};
const preparar = () => prepararCaracterizacion(caracterizar([
  caso, { ...caso, fechaAt: "2026-03-13", diasIncapacidad: 2 },
  { ...caso, cedula: "987654321", nombre: "José", sexo: "M", accidenteTransito: false },
]), "Año 2026 · Marzo · Manos", "18/11/2026 10:00");

test("exportación SST: conserva todos los agregados y omite cédulas", () => {
  const inf = preparar();
  assert.equal(inf.total, 3);
  assert.deepEqual(inf.resumen.map((r) => r.valor), [3, 2, 12, 4, 2, 1]);
  assert.equal(inf.resumen[4].detalle, "67% de los accidentes");
  assert.deepEqual(inf.repetidos, [{ nombre: caso.nombre, n: 2 }]);
  assert.equal(inf.distribuciones.length, 8);
  for (const d of inf.distribuciones) assert.equal(d.datos.reduce((s, r) => s + r.n, 0), 3);
  assert.equal(inf.distribuciones[0].datos.find((r) => r.key === "manos")?.pct, 100);
  assert.equal(inf.distribuciones[1].datos[0].n, 0);
  assert.equal(JSON.stringify(inf).includes(caso.cedula), false);
});

test("exportación SST: solo exporta el subconjunto consultado", () => {
  const inf = prepararCaracterizacion(caracterizar([caso]), "Marzo · María · Tránsito", "hoy");
  assert.equal(inf.total, 1);
  assert.equal(inf.resumen[2].valor, 5);
  assert.equal(inf.repetidos.length, 0);
  assert.ok(filasCsvCaracterizacion(inf).some((f) => f.includes(inf.filtros)));
});

test("exportación SST: sin resultados conserva ceros, sin NaN ni porcentajes falsos", () => {
  const inf = prepararCaracterizacion(caracterizar([]), "Sin coincidencias", "hoy");
  assert.ok(inf.resumen.every((r) => r.valor === 0));
  const totales = filasCsvCaracterizacion(inf).filter((f) => f[1] === "TOTAL");
  assert.equal(totales.length, 8);
  assert.ok(totales.every((f) => f[2] === 0 && f[3] === 0));
  assert.doesNotMatch(JSON.stringify(hojasCaracterizacion(inf)), /NaN|Infinity/);
});

test("exportación SST: protege fórmulas, preserva cifras y acentos", () => {
  for (const s of ["=1+1", "+SUM(A1)", "-2", "@SUM(A1)", "\t=HYPERLINK()", "\r\n+1"]) {
    assert.equal(textoSeguroHoja(s), `'${s}`);
  }
  assert.equal(textoSeguroHoja(12.5), 12.5);
  assert.equal(textoSeguroHoja(caso.nombre), caso.nombre);
  const inf = preparar();
  inf.repetidos[0].nombre = "=1+1";
  inf.distribuciones[6].datos[0].label = "@cargo";
  assert.ok(filasCsvCaracterizacion(inf).some((f) => f.includes("'=1+1")));
  assert.ok(hojasCaracterizacion(inf)[1].filas.some((f) => f.includes("'@cargo")));
});

test("Excel SST: libro legible con tres hojas, valores numéricos y porcentajes", () => {
  const libro = XLSX.utils.book_new();
  for (const h of hojasCaracterizacion(preparar())) XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(h.filas), h.nombre);
  const leido = XLSX.read(XLSX.write(libro, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  assert.deepEqual(leido.SheetNames, ["Resumen", "Distribuciones", "Reincidencia"]);
  const resumen = XLSX.utils.sheet_to_json<(string | number)[]>(leido.Sheets.Resumen, { header: 1 });
  assert.ok(resumen.some((f) => f[0] === "Días de incapacidad" && f[1] === 12));
  const filas = XLSX.utils.sheet_to_json<(string | number)[]>(leido.Sheets.Distribuciones, { header: 1 });
  assert.ok(filas.some((f) => f[0] === "Sexo" && f[1] === "Femenino" && f[2] === 2 && f[3] === 66.7));
});

test("CSV SST: descarga con BOM, separador español y escape de comillas", async (t) => {
  let blob: Blob | undefined;
  let nombre = "";
  let clicks = 0;
  let revocada = false;
  t.mock.method(URL, "createObjectURL", (b: Blob) => { blob = b; return "blob:prueba"; });
  t.mock.method(URL, "revokeObjectURL", () => { revocada = true; });
  const anterior = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ href: "", set download(v: string) { nombre = v; }, click: () => { clicks++; } }),
  } });
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, "document", anterior);
    else Reflect.deleteProperty(globalThis, "document");
  });
  await descargarCaracterizacionHoja(preparar(), "csv", "caracterizacion");
  assert.equal(nombre, "caracterizacion.csv");
  assert.equal(clicks, 1);
  assert.equal(revocada, true);
  assert.ok(blob);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
  const texto = await blob.text();
  assert.match(texto, /"Sección";"Categoría \/ indicador"/);
  assert.ok(texto.includes('"María; ""Pérez"""'));
  assert.ok(texto.includes("Año 2026 · Marzo · Manos"));
});

test("PDF SST: genera páginas, encabezado, tablas completas y pie numerado", async () => {
  const inf = preparar();
  // Fuerza continuación de gráficos y tablas con etiquetas largas.
  inf.distribuciones[6].datos = Array.from({ length: 70 }, (_, i) => ({
    key: String(i), label: `Cargo ${i} con descripción extensa para verificar saltos de página y ajuste de etiquetas`,
    n: 1, pct: 1.4,
  }));
  const doc = await crearPdfCaracterizacion(inf, null, null);
  assert.ok(doc.getNumberOfPages() > 10);
  const pdf = doc.output();
  assert.match(pdf, /^%PDF-/);
  assert.match(pdf, /Cargo 69/);
  assert.match(pdf, /TOTAL/);
  assert.match(pdf, /18\/11\/2026 10:00/);
  assert.equal(pdf.includes("{total_pages_count_string}"), false);
});
