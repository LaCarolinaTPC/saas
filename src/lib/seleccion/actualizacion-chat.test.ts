import { test } from "node:test";
import assert from "node:assert/strict";
import { CAUSAS_REABRIBLES, cambioQueReabre, cambiosDesdeChat, type DatosProcesoChat } from "./actualizacion-chat";
import { CAUSAS_NO_CONTRATO, CAUSAS_PRESELECCION } from "@/lib/contratacion/constants";

const base: DatosProcesoChat = { edad: 37, ciudad_residencia: "Bogotá", dispuesto_traslado: false, licencia_categoria: "C2", experiencia_meses: 6 };
const vacio: DatosProcesoChat = { edad: null, ciudad_residencia: null, dispuesto_traslado: null, licencia_categoria: null, experiencia_meses: null };

test("vale la última respuesta del chat: primero no se trasladaba y después sí", () => {
  assert.deepEqual(cambiosDesdeChat(base, { ...base, dispuesto_traslado: true }, new Set()), { dispuesto_traslado: true });
});

test("llena los vacíos y no borra lo que el chat ya no menciona", () => {
  assert.deepEqual(cambiosDesdeChat({ ...vacio, edad: 30 }, { ...vacio, ciudad_residencia: "Soledad" }, new Set()), { ciudad_residencia: "Soledad" });
  assert.deepEqual(cambiosDesdeChat(base, vacio, new Set()), {});
});

test("lo que Gestión Humana editó a mano no lo cambia el chat (salvo que estuviera vacío)", () => {
  assert.deepEqual(cambiosDesdeChat(base, { ...base, dispuesto_traslado: true, experiencia_meses: 24 }, new Set(["dispuesto_traslado"])), { experiencia_meses: 24 });
  assert.deepEqual(cambiosDesdeChat({ ...base, dispuesto_traslado: null }, { ...base, dispuesto_traslado: true }, new Set(["dispuesto_traslado"])), { dispuesto_traslado: true });
});

test("la categoría verificada en el RUNT manda sobre lo que diga en el chat", () => {
  assert.deepEqual(cambiosDesdeChat({ ...base, licencia_verificada_runt: true }, { ...base, licencia_categoria: "C3" }, new Set()), {});
  assert.deepEqual(cambiosDesdeChat(base, { ...base, licencia_categoria: "C3" }, new Set()), { licencia_categoria: "C3" });
});

test("sin cambios reales (mayúsculas o espacios) no hay nada que guardar", () => {
  assert.deepEqual(cambiosDesdeChat(base, { ...base, ciudad_residencia: " bogotá " }, new Set()), {});
});

test("proceso cerrado solo: se reabre si la persona vuelve y cambió justo lo que lo descartó", () => {
  const cerrado: DatosProcesoChat = { edad: 35, ciudad_residencia: "Cartagena", dispuesto_traslado: false, licencia_categoria: "B1", experiencia_meses: 24 };
  const igual = { ...cerrado };
  // Incomunicado: basta con que vuelva a escribir.
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.incomunicado, cerrado, igual), true);
  // Residencia: un «hola» no reabre; aceptar el traslado o mudarse, sí.
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.residencia, cerrado, igual), false);
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.residencia, cerrado, { ...igual, dispuesto_traslado: true }), true);
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.residencia, cerrado, { ...igual, ciudad_residencia: "Soledad" }), true);
  // Licencia: va a renovar o ahora dice otra categoría.
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.licencia, cerrado, igual), false);
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.licencia, cerrado, { ...igual, renovara_licencia: true }), true);
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.licencia, cerrado, { ...igual, licencia_categoria: "C2" }), true);
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.edad, cerrado, { ...igual, edad: 36 }), true);
  assert.equal(cambioQueReabre(CAUSAS_REABRIBLES.autorizacion, cerrado, { ...igual, autorizacion: "si" }), true);
  // Antecedentes, ya trabaja aquí o un cierre de Gestión Humana: nunca solos.
  for (const causa of ["Antecedentes", "Ya trabaja en la empresa", "No se ajusta al perfil", null]) {
    assert.equal(cambioQueReabre(causa, cerrado, { ...igual, dispuesto_traslado: true, autorizacion: "si" }), false);
  }
  // Las causas son las mismas del catálogo de Candidatos.
  assert.equal(CAUSAS_REABRIBLES.residencia, CAUSAS_PRESELECCION.residencia);
  assert.equal(CAUSAS_REABRIBLES.licencia, CAUSAS_PRESELECCION.licencia);
  assert.equal(CAUSAS_REABRIBLES.edad, CAUSAS_PRESELECCION.edad);
  assert.equal(CAUSAS_REABRIBLES.autorizacion, CAUSAS_PRESELECCION.autorizacion);
  assert.ok((CAUSAS_NO_CONTRATO as readonly string[]).includes(CAUSAS_REABRIBLES.incomunicado));
});
