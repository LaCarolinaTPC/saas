import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { letraPorNombre, marcasDePdf, rellenarPdf } from "./documento-pdf";

/** Una carta como la de Gestión Humana: membrete, fecha con marca, párrafo justificado con marcas y firma. */
async function cartaDePrueba(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const p = doc.addPage([612, 792]);
  const normal = await doc.embedFont(StandardFonts.TimesRoman);
  const cursiva = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const negrita = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
  p.drawText("Nit.800.129.395", { x: 128, y: 660, size: 14, font: normal });
  p.drawText("{fecha_larga}", { x: 128, y: 600, size: 10, font: normal });
  const renglones: [string, typeof cursiva][][] = [
    [["De la manera más atenta nos dirigimos a ustedes, para informarles", cursiva]],
    [["que el portador de la presente ", cursiva], ["{nombre}", negrita], [" identificado con cedula de", cursiva]],
    [["ciudadanía ", cursiva], ["{cedula},", negrita], [" se encuentra laborando en nuestra Empresa en", cursiva]],
    [["el cargo de ", cursiva], ["{cargo}.", negrita]],
  ];
  renglones.forEach((r, i) => {
    let x = 128;
    for (const [t, f] of r) {
      p.drawText(t, { x, y: 486 - i * 16, size: 14, font: f });
      x += f.widthOfTextAtSize(t, 14);
    }
  });
  p.drawText("código dispersor 7+1", { x: 128, y: 405, size: 14, font: cursiva });
  p.drawText("Atentamente,", { x: 128, y: 340, size: 14, font: cursiva });
  p.drawText("YEIMIS SARAVIA AVILA", { x: 128, y: 196, size: 14, font: negrita });
  return doc.save();
}

const texto = async (pdf: Uint8Array) =>
  String((await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true })).text).replace(/\s+/g, " ");

test("carta en PDF: encuentra las marcas", async () => {
  assert.deepEqual((await marcasDePdf(await cartaDePrueba())).sort(), ["cargo", "cedula", "fecha_larga", "nombre"]);
});

test("carta en PDF: reemplaza las marcas, aunque el valor sea largo, y deja el resto", async () => {
  const r = await rellenarPdf(await cartaDePrueba(), {
    nombre: "LUIS FERNANDO DE LA HOZ CASTAÑEDA",
    cedula: "1.043.126.891",
    cargo: "CONDUCTOR DE TRANSPORTE PÚBLICO COLECTIVO",
    fecha_larga: "23 de noviembre de 2026",
  });
  assert.deepEqual(r.faltan, []);
  const t = await texto(r.pdf);
  for (const esperado of ["LUIS FERNANDO DE LA HOZ CASTAÑEDA", "1.043.126.891", "CONDUCTOR DE TRANSPORTE PÚBLICO COLECTIVO", "23 de noviembre de 2026", "Nit.800.129.395", "código dispersor 7+1", "YEIMIS SARAVIA AVILA"]) {
    assert.ok(t.includes(esperado), `falta «${esperado}»`);
  }
});

test("carta en PDF: avisa las marcas sin valor", async () => {
  const r = await rellenarPdf(await cartaDePrueba(), { nombre: "JUAN PÉREZ", cedula: "72123456", fecha_larga: "23 de noviembre de 2026" });
  assert.deepEqual(r.faltan, ["cargo"]);
});

test("carta en PDF: la letra sale del nombre de la fuente", () => {
  assert.deepEqual(letraPorNombre("BCDHEE+TimesNewRomanPS-BoldItalicMT"), { familia: "times", negrita: true, cursiva: true });
  assert.deepEqual(letraPorNombre("ABCDEF+Arial-ItalicMT"), { familia: "helvetica", negrita: false, cursiva: true });
  assert.deepEqual(letraPorNombre("Calibri"), { familia: "helvetica", negrita: false, cursiva: false });
  assert.equal(letraPorNombre("Wingdings"), null);
});

test("carta en PDF, modo limpio: el archivo no guarda las marcas de la plantilla", async () => {
  const r = await rellenarPdf(await cartaDePrueba(), { nombre: "JUAN PÉREZ", cedula: "72123456", cargo: "CONDUCTOR", fecha_larga: "23 de noviembre de 2026" });
  assert.equal(r.modo, "limpio");
  const t = await texto(r.pdf);
  assert.ok(!/\{[a-z_]+\}/.test(t), `quedaron marcas: ${t}`);
  // Cada texto una sola vez (no queda el original debajo).
  assert.equal(t.split("Nit.800.129.395").length - 1, 1);
  assert.equal(t.split("YEIMIS SARAVIA AVILA").length - 1, 1);
  for (const esperado of ["JUAN PÉREZ", "72123456", "CONDUCTOR", "23 de noviembre de 2026", "código dispersor 7+1"]) assert.ok(t.includes(esperado), `falta «${esperado}»`);
});

test("carta en PDF, modo tapado (respaldo): el original queda debajo del blanco", async () => {
  const r = await rellenarPdf(await cartaDePrueba(), { nombre: "JUAN PÉREZ", cedula: "72123456", cargo: "CONDUCTOR", fecha_larga: "23 de noviembre de 2026" }, { modo: "tapado" });
  assert.equal(r.modo, "tapado");
  const t = await texto(r.pdf);
  assert.ok(t.includes("JUAN PÉREZ") && /\{nombre\}/.test(t));
});
