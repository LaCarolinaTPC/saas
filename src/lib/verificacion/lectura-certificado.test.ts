import { test } from "node:test";
import assert from "node:assert/strict";
import { instruccionCertificado, interpretarCertificado } from "./lectura-certificado";

const HOY = "2026-11-26";

test("certificado: RNMC sin medidas, de la cédula del candidato", () => {
  const r = interpretarCertificado(
    '```json\n{"es_esa_fuente": true, "cedula": "1.129.492.533", "nombre": "PEDRO LUIS TORRES", "fecha_documento": "2026-11-26", "hallazgo": false, "valor": null, "categorias": null, "vence": null, "restricciones": null, "detalle": "No tiene medidas correctivas pendientes por cumplir."}\n```',
    "rnmc",
    "1129492533",
    HOY
  )!;
  assert.equal(r.hallazgo, false);
  assert.equal(r.cedulaCoincide, true);
  assert.deepEqual(r.avisos, []);
  assert.match(r.detalle, /No tiene medidas/);
});

test("certificado: SIMIT con comparendos → valor y hallazgo salen del total", () => {
  const r = interpretarCertificado('{"es_esa_fuente": true, "cedula": "123", "hallazgo": false, "valor": "$ 1.266.101", "detalle": "2 comparendos"}', "simit", "123", HOY)!;
  assert.equal(r.valor, 1266101);
  assert.equal(r.hallazgo, true, "el total manda sobre lo que diga el modelo");
});

test("certificado: RUNT con licencia → categoría, vencimiento y restricciones; nunca hallazgo", () => {
  const r = interpretarCertificado('{"es_esa_fuente": true, "cedula": "123", "categorias": ["c2", "b1"], "vence": "2030-05-01", "restricciones": "Lentes", "hallazgo": true, "detalle": "Licencia activa"}', "runt", "123", HOY)!;
  assert.equal(r.categoria, "C2, B1");
  assert.equal(r.vence, "2030-05-01");
  assert.equal(r.restricciones, "Lentes");
  assert.equal(r.hallazgo, false);
});

test("certificado: avisos de otra cédula, otro documento, certificado viejo y licencia vencida", () => {
  const otra = interpretarCertificado('{"es_esa_fuente": false, "cedula": "999", "fecha_documento": "2026-09-01", "hallazgo": false, "detalle": "x"}', "policia", "123", HOY)!;
  assert.ok(otra.avisos.some((a) => /no parece ser el certificado/.test(a)));
  assert.ok(otra.avisos.some((a) => /cédula 999/.test(a)));
  assert.ok(otra.avisos.some((a) => /hace 86 días/.test(a)));
  const vencida = interpretarCertificado('{"es_esa_fuente": true, "categorias": ["C2"], "vence": "2025-01-01", "detalle": "x"}', "runt", null, HOY)!;
  assert.ok(vencida.avisos.some((a) => /venció/.test(a)));
  assert.equal(vencida.cedulaCoincide, null);
});

test("certificado: sin JSON no hay lectura; sin hallazgo claro se avisa", () => {
  assert.equal(interpretarCertificado("No pude leer el archivo.", "rnmc", "1", HOY), null);
  const r = interpretarCertificado('{"es_esa_fuente": true, "hallazgo": null, "detalle": "borroso"}', "procuraduria", null, HOY)!;
  assert.ok(r.avisos.some((a) => /elíjalo usted/.test(a)));
});

test("certificado: la instrucción nombra la fuente y qué es hallazgo", () => {
  assert.match(instruccionCertificado("rnmc"), /Medidas Correctivas/);
  assert.match(instruccionCertificado("simit"), /total en pesos/);
});
