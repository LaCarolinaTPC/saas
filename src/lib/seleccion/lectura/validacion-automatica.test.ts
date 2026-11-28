import { test } from "node:test";
import assert from "node:assert/strict";
import { documentoParaValidarSolo } from "./validacion-automatica";
import type { CampoLeido } from "./esquema";

const c = (campo: string, valor: unknown, confianza: "alta" | "media" | "baja" = "alta"): CampoLeido => ({ campo, valor, confianza, evidencia: null, pagina: null, decision: null, valor_final: null });
const aspirante = { nombre: "PEDRO LUIS TORRES MERCADO", cedula: "1129492533", licenciaVerificada: true };
const hoy = "2026-11-27";

test("hoja de vida: se valida sola con la cédula del aspirante o con su nombre", () => {
  assert.equal(documentoParaValidarSolo("hoja_vida", [c("nombre", "Pedro Luis Torres"), c("cedula", "1129492533"), c("cedula_coincide", "sí")], aspirante, [], hoy).ok, true);
  assert.equal(documentoParaValidarSolo("hoja_vida", [c("nombre", "Pedro Torres Mercado")], aspirante, [], hoy).ok, true);
  // Otra cédula o un nombre que no es: a una persona.
  assert.equal(documentoParaValidarSolo("hoja_vida", [c("nombre", "Pedro Luis Torres"), c("cedula", "999"), c("cedula_coincide", "no")], aspirante, [], hoy).ok, false);
  assert.equal(documentoParaValidarSolo("hoja_vida", [c("nombre", "Carlos Ruiz Díaz")], aspirante, [], hoy).ok, false);
  // Nombre leído con poca confianza: no basta.
  assert.equal(documentoParaValidarSolo("hoja_vida", [c("nombre", "Pedro Torres", "baja")], aspirante, [], hoy).ok, false);
});

test("cédula: solo si el número es el del proceso", () => {
  assert.equal(documentoParaValidarSolo("cedula", [c("numero", "1129492533"), c("cedula_coincide", "sí")], aspirante, [], hoy).ok, true);
  assert.equal(documentoParaValidarSolo("cedula", [c("numero", "1129492534"), c("cedula_coincide", "no")], aspirante, [], hoy).ok, false);
});

test("licencia: el nombre coincide y la licencia ya está verificada (RUNT o a mano)", () => {
  const campos = [c("nombre", "TORRES MERCADO PEDRO LUIS"), c("categorias", "C2 2028-02-24")];
  assert.equal(documentoParaValidarSolo("licencia", campos, aspirante, [], hoy).ok, true);
  assert.equal(documentoParaValidarSolo("licencia", campos, { ...aspirante, licenciaVerificada: false }, [], hoy).ok, false);
});

test("certificado bancario: Banco de Bogotá, cuenta vigente y a nombre del aspirante", () => {
  const base = [c("banco", "Banco de Bogotá"), c("banco_bogota", "sí"), c("titular", "Pedro Luis Torres Mercado"), c("cuenta_vigente", "sí")];
  assert.equal(documentoParaValidarSolo("certificado_bancario", base, aspirante, [], hoy).ok, true);
  assert.equal(documentoParaValidarSolo("certificado_bancario", [c("banco", "Bancolombia"), c("banco_bogota", "no"), c("titular", "Pedro Torres")], aspirante, [], hoy).ok, false);
  assert.equal(documentoParaValidarSolo("certificado_bancario", [...base.slice(0, 3), c("cuenta_vigente", "no")], aspirante, [], hoy).ok, false);
  assert.equal(documentoParaValidarSolo("certificado_bancario", [c("banco_bogota", "sí"), c("titular", "Otra Persona Distinta")], aspirante, [], hoy).ok, false);
});

test("referencias, otros documentos y lecturas vacías: siempre una persona", () => {
  assert.equal(documentoParaValidarSolo("otro", [c("x", "y")], aspirante, [], hoy).ok, false);
  assert.equal(documentoParaValidarSolo("hoja_vida", [], aspirante, [], hoy).ok, false);
});
