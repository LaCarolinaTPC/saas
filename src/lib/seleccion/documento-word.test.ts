import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { marcasDeDocx, rellenarDocx, rellenarXml } from "./documento-word";

test("documento Word: reemplaza las marcas, escapa el XML y avisa las que no tienen dato", () => {
  const xml = '<w:p><w:r><w:t>Paciente: {nombre} CC {cedula} - {cargo}</w:t></w:r></w:p>';
  const r = rellenarXml(xml, { nombre: "PÉREZ & HIJOS <S.A.>", cedula: "13175742", cargo: "" });
  assert.equal(r.xml, "<w:p><w:r><w:t>Paciente: PÉREZ &amp; HIJOS &lt;S.A.&gt; CC 13175742 - </w:t></w:r></w:p>");
  assert.deepEqual(r.usadas.sort(), ["cargo", "cedula", "nombre"]);
  assert.deepEqual(r.faltan, ["cargo"]);
});

test("documento Word: junta una marca que Word partió en varios fragmentos", () => {
  const partida = '<w:r><w:t>{</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>nom</w:t></w:r><w:r><w:t>bre}</w:t></w:r>';
  const r = rellenarXml(partida, { nombre: "NIXON LEAL" });
  assert.equal(r.xml, "<w:r><w:t>NIXON LEAL</w:t></w:r>");
  // Lo que no es una marca (texto entre llaves con espacios o mayúsculas) no se toca.
  assert.equal(rellenarXml("<w:t>{No es marca} y {OTRA}</w:t>", {}).xml, "<w:t>{No es marca} y {OTRA}</w:t>");
});

test("documento Word: rellena el .docx completo (cuerpo y encabezado) y lista sus marcas", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", '<w:document><w:body><w:p><w:r><w:t>{nombre} · {cedula} · {fecha}</w:t></w:r></w:p></w:body></w:document>');
  zip.file("word/header1.xml", "<w:hdr><w:p><w:r><w:t>{laboratorio}</w:t></w:r></w:p></w:hdr>");
  zip.file("word/styles.xml", "<w:styles>{no_se_toca}</w:styles>");
  const plantilla = await zip.generateAsync({ type: "nodebuffer" });
  assert.deepEqual(await marcasDeDocx(plantilla), ["cedula", "fecha", "laboratorio", "nombre"]);
  const { docx, faltan } = await rellenarDocx(plantilla, { nombre: "ANA RUIZ", cedula: "72009959", laboratorio: "BIOBAC SST - IPS" });
  assert.deepEqual(faltan, ["fecha"]);
  const salida = await JSZip.loadAsync(docx);
  assert.match(await salida.file("word/document.xml")!.async("string"), /ANA RUIZ · 72009959 · </);
  assert.match(await salida.file("word/header1.xml")!.async("string"), /BIOBAC SST - IPS/);
  assert.match(await salida.file("word/styles.xml")!.async("string"), /\{no_se_toca\}/);
});
