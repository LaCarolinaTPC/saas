import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiosDesdeChat, type DatosProcesoChat } from "./actualizacion-chat";

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
