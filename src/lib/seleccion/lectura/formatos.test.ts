import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { MIME_DOCX } from "./docx";
import { MIME_ODT, archivoParaModelo, esDocAntiguo, formatoDe, odtATexto, rtfATexto } from "./formatos";

test("formatos: por el tipo o, si es genérico, por la extensión", () => {
  assert.equal(formatoDe("application/pdf", "hv.pdf"), "pdf");
  assert.equal(formatoDe("application/octet-stream", "HOJA DE VIDA.PDF"), "pdf");
  assert.equal(formatoDe(MIME_DOCX, null), "docx");
  assert.equal(formatoDe("application/zip", "hv.docx"), "docx");
  assert.equal(formatoDe(MIME_ODT, null), "odt");
  assert.equal(formatoDe("", "hv.odt"), "odt");
  assert.equal(formatoDe("text/rtf", null), "rtf");
  assert.equal(formatoDe("application/msword", "hv.rtf"), "rtf");
  assert.equal(formatoDe("text/plain; charset=utf-8", "hv.txt"), "texto");
  assert.equal(formatoDe("image/jpeg", null), "imagen");
  assert.equal(formatoDe("application/octet-stream", "foto.PNG"), "imagen");
  assert.equal(formatoDe("application/msword", "hv.doc"), null);
  assert.equal(formatoDe("video/mp4", "x.mp4"), null);
  assert.equal(esDocAntiguo("application/msword", "hv.doc"), true);
  assert.equal(esDocAntiguo("application/octet-stream", "hv.doc"), true);
  assert.equal(esDocAntiguo("application/msword", "hv.rtf"), false);
});

test("OpenDocument: párrafos, títulos, espacios y tablas", () => {
  const xml =
    '<office:text><text:h>HOJA DE VIDA</text:h><text:p>Carlos<text:s/>Gómez<text:s text:c="2"/>Ruiz</text:p>' +
    "<table:table><table:table-row><table:table-cell><text:p>Coolitoral</text:p></table:table-cell><table:table-cell><text:p>2019 &amp; 2022</text:p></table:table-cell></table:table-row></table:table>" +
    "<text:p>Tel<text:tab/>300<text:line-break/>Barranquilla</text:p></office:text>";
  assert.equal(odtATexto(xml), "HOJA DE VIDA\nCarlos Gómez Ruiz\nCoolitoral | 2019 & 2022\nTel 300\nBarranquilla");
});

test("RTF: sin tablas de fuentes ni comandos, con tildes y Unicode", () => {
  const rtf =
    "{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0 Times New Roman;}}{\\colortbl;\\red0\\green0\\blue0;}{\\*\\generator Word;}" +
    "\\f0\\fs24 HOJA DE VIDA\\par Carlos G\\'f3mez\\tab Conductor\\par Experiencia: 5 a\\'f1os en \\u8220?buseta\\u8221?\\par}";
  assert.equal(rtfATexto(rtf), "HOJA DE VIDA\nCarlos Gómez Conductor\nExperiencia: 5 años en “buseta”");
});

test("archivo para el modelo: .odt y .txt van como texto; .doc y otros, omitidos con aviso", async () => {
  const zip = new JSZip();
  zip.file("content.xml", "<office:text><text:p>JUAN PÉREZ · conductor 6 años</text:p></office:text>");
  const odt = await archivoParaModelo(await zip.generateAsync({ type: "nodebuffer" }), MIME_ODT, "hv.odt");
  assert.ok(odt.ok && odt.formato === "odt" && odt.archivo.tipo === "text/plain" && odt.archivo.texto === "JUAN PÉREZ · conductor 6 años");

  // Un .txt guardado en Windows (Windows-1252), no UTF-8.
  const txt = await archivoParaModelo(Buffer.from([0x41, 0xf1, 0x6f, 0x73, 0x20, 0x96, 0x20, 0x43]), "text/plain", "hv.txt");
  assert.ok(txt.ok && txt.archivo.texto === "Años – C");

  const pdf = await archivoParaModelo(Buffer.from("%PDF-1.4"), "application/pdf", "hv.pdf");
  assert.ok(pdf.ok && pdf.archivo.tipo === "application/pdf" && pdf.archivo.base64.length > 0);

  const doc = await archivoParaModelo(Buffer.from("x"), "application/msword", "hv.doc");
  assert.ok(!doc.ok && doc.estado === "omitido" && /\.docx o PDF/.test(doc.error));
  const mp4 = await archivoParaModelo(Buffer.from("x"), "video/mp4", "x.mp4");
  assert.ok(!mp4.ok && /Se leen: PDF/.test(mp4.error));

  const vacio = await archivoParaModelo(Buffer.from("   "), "text/plain", "x.txt");
  assert.ok(!vacio.ok && vacio.estado === "ilegible");
});
