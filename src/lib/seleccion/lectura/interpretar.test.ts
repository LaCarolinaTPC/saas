import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cambiosParaProceso,
  compararCedula,
  conCalculados,
  edadDe,
  extraerJson,
  interpretarRespuesta,
  itemDeClase,
  mesesConduccion,
  referenciasAceptadas,
  resumenParaAsistente,
  valorAceptado,
} from "./interpretar";
import type { CampoLeido, ExperienciaLeida } from "./esquema";

const HOY = "2026-11-20";
const exp = (p: Partial<ExperienciaLeida>): ExperienciaLeida => ({ empresa: null, cargo: null, desde: null, hasta: null, vehiculo: null, conduccion: true, ...p });

test("extraerJson tolera los bloques ```json", () => {
  assert.deepEqual(extraerJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(extraerJson("no hay"), null);
});

test("mesesConduccion suma periodos, no cuenta dos veces los que se cruzan y marca los sin fecha", () => {
  const r = mesesConduccion(
    [
      exp({ desde: "2020-01", hasta: "2020-12" }), // 12
      exp({ desde: "2020-07", hasta: "2021-06" }), // se cruza: +6
      exp({ desde: "2026-01", hasta: "actual" }), // ene–nov 2026: 11
      exp({ desde: null, hasta: "2019-05" }), // sin fecha
      exp({ desde: "2015-01", hasta: "2016-01", conduccion: false }), // no es conducción
    ],
    HOY
  );
  assert.deepEqual(r, { meses: 29, sinFecha: 1, periodos: 4 });
});

test("edadDe y compararCedula", () => {
  assert.equal(edadDe("1990-11-21", HOY), 35);
  assert.equal(edadDe("1990-11-20", HOY), 36);
  assert.equal(edadDe("xx", HOY), null);
  assert.equal(compararCedula("1.096.229.643", "1096229643"), true);
  assert.equal(compararCedula("1096229643", "72009959"), false);
  assert.equal(compararCedula(null, "72009959"), null);
});

test("interpretarRespuesta agrupa archivos, calcula y marca los que no ubicó", () => {
  const texto = JSON.stringify({
    documentos: [
      {
        archivos: [1, 2],
        clase: "hoja_vida",
        legible: true,
        resumen: "Hoja de vida de Pedro",
        campos: [
          { campo: "nombre", valor: "Pedro Pérez", confianza: "alta", evidencia: "PEDRO PÉREZ", pagina: 1 },
          { campo: "cedula", valor: "72.009.959", confianza: "alta" },
          { campo: "fecha_nacimiento", valor: "1990-01-15", confianza: "media" },
        ],
        experiencias: [{ empresa: "Sobusa", cargo: "Conductor", desde: "2022-01", hasta: "2023-12", vehiculo: "Bus", conduccion: true }],
        referencias: [{ nombre: "Ana", telefono: "3001234567", tipo: "laboral", empresa: "Sobusa" }],
      },
      { archivos: [3], clase: "licencia", legible: false, motivo: "foto borrosa" },
      { archivos: [9], clase: "cedula" }, // archivo que no existe: se ignora
    ],
  });
  const docs = interpretarRespuesta(texto, 4, { hoy: HOY, cedulaProceso: "72009959" })!;
  assert.equal(docs.length, 3);
  const hv = docs[0];
  assert.deepEqual(hv.archivos, [0, 1]);
  const v = (k: string) => hv.campos.find((c) => c.campo === k)?.valor;
  assert.equal(v("experiencia_conduccion_meses"), 24);
  assert.equal(v("edad"), 36);
  assert.equal(v("cedula_coincide"), "sí");
  assert.equal((v("referencias") as unknown[]).length, 1);
  assert.equal(docs[1].estado, "ilegible");
  assert.equal(docs[1].resumen, "foto borrosa");
  assert.deepEqual([docs[2].archivos, docs[2].clase, docs[2].estado], [[3], "otro", "ilegible"]);
});

test("interpretarRespuesta: sin JSON válido, null", () => {
  assert.equal(interpretarRespuesta("lo siento", 1, { hoy: HOY }), null);
});

test("resumenParaAsistente: lo ilegible pide repetir la foto", () => {
  assert.match(resumenParaAsistente({ clase: "licencia", estado: "ilegible", resumen: "borrosa", campos: [] }), /vuelva a enviar/);
  const r = resumenParaAsistente({
    clase: "licencia",
    estado: "leido",
    resumen: "",
    campos: [{ campo: "categorias", valor: "C2 vence 2029-03-14", confianza: "alta", evidencia: null, pagina: null, decision: null, valor_final: null }],
  });
  assert.match(r, /^licencia de conducción; categorías: C2/);
});

const c = (campo: string, valor: unknown, decision: CampoLeido["decision"], valor_final: unknown = null): CampoLeido => ({
  campo,
  valor,
  confianza: "alta",
  evidencia: null,
  pagina: null,
  decision,
  valor_final,
});

test("valorAceptado: corregido, aceptado, rechazado o sin decidir", () => {
  assert.equal(valorAceptado(c("x", "a", "aceptado")), "a");
  assert.equal(valorAceptado(c("x", "a", "corregido", "b")), "b");
  assert.equal(valorAceptado(c("x", "a", "rechazado")), null);
  assert.equal(valorAceptado(c("x", "a", null)), null);
});

test("cambiosParaProceso solo llena lo vacío y marca el origen", () => {
  const r = cambiosParaProceso(
    "hoja_vida",
    [c("fecha_nacimiento", "1990-01-15", "aceptado"), c("experiencia_conduccion_meses", 24, "aceptado")],
    { fecha_nacimiento: null, experiencia_meses: 12, edad: null },
    HOY
  );
  assert.deepEqual(r.cambios, { fecha_nacimiento: "1990-01-15", edad: 36 });
  assert.deepEqual(r.origen, { fecha_nacimiento: "leido", edad: "leido" });
  const lic = cambiosParaProceso("licencia", [c("restricciones", "usar lentes", "aceptado")], {}, HOY);
  assert.deepEqual(lic.cambios, { licencia_restricciones: "usar lentes" });
  // Rechazado: nada.
  assert.deepEqual(cambiosParaProceso("cedula", [c("fecha_expedicion", "2010-02-01", "rechazado")], {}, HOY).cambios, {});
});

test("conCalculados: los calculados siguen la decisión del campo del que salen", () => {
  const calc = (campo: string, valor: unknown): CampoLeido => ({ ...c(campo, valor, null), calculado: true });
  const r = conCalculados([c("experiencias", [], "aceptado"), calc("experiencia_conduccion_meses", 24), c("fecha_nacimiento", "1990-01-15", "corregido", "1991-01-15"), calc("edad", 36)], HOY);
  assert.equal(r[1].decision, "aceptado");
  assert.deepEqual([r[3].decision, r[3].valor_final], ["corregido", 35]);
  assert.equal(conCalculados([c("experiencias", [], "rechazado"), calc("experiencia_conduccion_meses", 24)])[1].decision, "rechazado");
  assert.equal(conCalculados([calc("experiencia_conduccion_meses", 24)])[0].decision, null);
});

test("referenciasAceptadas e itemDeClase", () => {
  assert.equal(referenciasAceptadas([c("referencias", [{ nombre: "Ana", telefono: "1", tipo: "laboral", empresa: null }], "aceptado")]).length, 1);
  assert.equal(referenciasAceptadas([c("referencias", [{ nombre: "Ana" }], "rechazado")]).length, 0);
  const items = ["Hoja de vida", "Fotocopia de la cédula", "Fotocopia de la licencia", "Carta laboral"];
  assert.equal(itemDeClase("cedula", items), "Fotocopia de la cédula");
  assert.equal(itemDeClase("licencia", items), "Fotocopia de la licencia");
  assert.equal(itemDeClase("carta_laboral", items), "Carta laboral");
  assert.equal(itemDeClase("otro", items), null);
});
