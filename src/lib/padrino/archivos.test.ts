import { test } from "node:test";
import assert from "node:assert/strict";
import { firmaCoincide, textoSeguroExcel } from "./archivos";

const bytes = (...xs: (number | string)[]) =>
  Uint8Array.from(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

test("firma binaria: el contenido debe corresponder al MIME declarado", () => {
  assert.equal(firmaCoincide("application/pdf", bytes("%PDF-1.7 resto")), true);
  assert.equal(firmaCoincide("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0, 0x00)), true);
  assert.equal(firmaCoincide("image/png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0x00)), true);
});

test("firma binaria: contenido distinto al declarado se rechaza", () => {
  // Un HTML declarado como PDF (el vector típico: subir un script como 'certificado').
  assert.equal(firmaCoincide("application/pdf", bytes("<html><script>")), false);
  // Un PDF declarado como imagen.
  assert.equal(firmaCoincide("image/png", bytes("%PDF-1.7")), false);
  assert.equal(firmaCoincide("image/jpeg", bytes("%PDF-1.7")), false);
  // MIME que no está en la lista, archivo vacío o más corto que la firma.
  assert.equal(firmaCoincide("text/html", bytes("<html>")), false);
  assert.equal(firmaCoincide("application/pdf", bytes()), false);
  assert.equal(firmaCoincide("image/png", bytes(0x89, "PN")), false);
});

test("texto seguro para Excel: los que empiezan por =, +, -, @, tab o CR llevan apóstrofo", () => {
  assert.equal(textoSeguroExcel("=HYPERLINK(\"http://mal\",\"clic\")"), "'=HYPERLINK(\"http://mal\",\"clic\")");
  assert.equal(textoSeguroExcel("+57 300"), "'+57 300");
  assert.equal(textoSeguroExcel("-cmd"), "'-cmd");
  assert.equal(textoSeguroExcel("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(textoSeguroExcel("\t=1+1"), "'\t=1+1");
});

test("texto seguro para Excel: lo normal pasa igual", () => {
  assert.equal(textoSeguroExcel("PEREZ GOMEZ JUAN"), "PEREZ GOMEZ JUAN");
  assert.equal(textoSeguroExcel("Nómina 2026-11 quincena 2"), "Nómina 2026-11 quincena 2");
  assert.equal(textoSeguroExcel(null), "");
  assert.equal(textoSeguroExcel(undefined), "");
});
