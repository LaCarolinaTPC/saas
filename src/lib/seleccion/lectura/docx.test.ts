import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { esDocx, extraerDocx, MIME_DOCX, xmlATexto } from "./docx";

const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const fila = (...celdas: string[]) => `<w:tr>${celdas.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`;
const documento = (cuerpo: string) => `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${cuerpo}</w:body></w:document>`;

test("esDocx: por el tipo o por el nombre", () => {
  assert.ok(esDocx(MIME_DOCX));
  assert.ok(esDocx("application/octet-stream", "Hoja de vida.DOCX"));
  assert.ok(!esDocx("application/pdf", "hoja.docx"));
  assert.ok(!esDocx("application/msword", "hoja.doc"));
});

test("xmlATexto: párrafos, tablas, tabuladores y entidades", () => {
  const xml = documento(
    p("HOJA DE VIDA") +
      `<w:p><w:r><w:t>Nombre:</w:t></w:r><w:r><w:tab/><w:t>Pedro &amp; Cía</w:t></w:r></w:p>` +
      `<w:tbl>${fila("Empresa", "Cargo", "Desde")}${fila("Sobusa", "Conductor", "2022")}</w:tbl>`
  );
  assert.equal(xmlATexto(xml), "HOJA DE VIDA\nNombre: Pedro & Cía\nEmpresa | Cargo | Desde\nSobusa | Conductor | 2022");
});

test("extraerDocx: texto e imágenes pegadas, sin logos pequeños", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", documento(p("Experiencia: Sobusa, conductor")));
  zip.file("word/media/image1.png", Buffer.alloc(20_000, 1));
  zip.file("word/media/image2.jpeg", Buffer.alloc(500, 1)); // logo: se descarta
  zip.file("word/media/image3.emf", Buffer.alloc(20_000, 1)); // formato que el modelo no lee
  const r = await extraerDocx(await zip.generateAsync({ type: "nodebuffer" }));
  assert.equal(r.texto, "Experiencia: Sobusa, conductor");
  assert.equal(r.imagenes.length, 1);
  assert.equal(r.imagenes[0].tipo, "image/png");
});

test("extraerDocx: un zip que no es Word falla con un mensaje claro", async () => {
  const zip = new JSZip();
  zip.file("otra.txt", "hola");
  await assert.rejects(extraerDocx(await zip.generateAsync({ type: "nodebuffer" })), /no parece un documento de Word/);
});
