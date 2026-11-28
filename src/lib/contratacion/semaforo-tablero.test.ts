import { test } from "node:test";
import assert from "node:assert/strict";
import { puntosDeTarjeta, siguientePendiente } from "./semaforo-tablero";

const colores = (ps: { color: string }[]) => ps.map((x) => x.color).join(",");

test("tablero: preselección con los 4 requisitos y la autorización", () => {
  const ps = puntosDeTarjeta({ estado: "pendiente", preseleccion: { edad: { color: "verde" }, residencia: { color: "verde" }, licencia: { color: "pendiente", motivo: "Falta el RUNT" }, simit: { color: "rojo", motivo: "Deuda" } }, autorizacion: null });
  assert.deepEqual(ps.map((x) => x.etiqueta), ["Edad", "Residencia", "Licencia", "SIMIT", "Autorización"]);
  assert.equal(colores(ps), "verde,verde,gris,rojo,gris");
  assert.equal(siguientePendiente(ps)?.etiqueta, "SIMIT"); // lo rojo primero
});

test("tablero: antecedentes por fuente (tolera verde, revisión ámbar, error ámbar, sin consultar gris) y el aval", () => {
  const ps = puntosDeTarjeta({
    estado: "antecedentes",
    antecedentes: {
      veredicto: "revision",
      decision: null,
      fuentes: [
        { fuente: "policia", estado: "limpio" },
        { fuente: "procuraduria", estado: "error", motivo: "No respondió" },
        { fuente: "contraloria", estado: "sin_consultar" },
        { fuente: "rnmc", estado: "hallazgo", accion: "tolera" },
      ],
    },
  });
  assert.equal(colores(ps), "verde,ambar,gris,verde,ambar");
  assert.equal(ps[4].etiqueta, "Aval");
});

test("tablero: exámenes fase 1 (orden, banco, rutas, resultado, reconocimiento) y listo para contratar", () => {
  const f1 = puntosDeTarjeta({ estado: "en_examenes", ordenF1: true, banco: "no", rutasRespondidas: false, examenF1: "aplazado", reconocimiento: "por_verificar" });
  assert.equal(colores(f1), "verde,verde,gris,ambar,ambar");
  const listo = puntosDeTarjeta({ estado: "listo_contratar", antecedentes: { fuentes: [], veredicto: "limpio", decision: null }, examenF1: "apto", examenF2: "apto", reconocimiento: "finalizado", aprobacion: false });
  assert.equal(colores(listo), "verde,verde,verde,ambar");
  assert.equal(siguientePendiente(listo)?.etiqueta, "Visto bueno");
});

test("tablero: citado, prueba, escuela; contratado y cierre sin puntos", () => {
  assert.equal(colores(puntosDeTarjeta({ estado: "citado", antecedentes: { fuentes: [], veredicto: "limpio", decision: null }, citaPrueba: { estado: "pide_otra_fecha", fecha: "2026-11-30" } })), "verde,ambar");
  assert.equal(colores(puntosDeTarjeta({ estado: "prueba_manejo", prueba: "escuela" })), "verde,ambar");
  assert.equal(colores(puntosDeTarjeta({ estado: "en_escuela", clases: { total: 3, listo: true } })), "ambar,verde");
  assert.deepEqual(puntosDeTarjeta({ estado: "contratado" }), []);
  assert.deepEqual(puntosDeTarjeta({ estado: "cierre" }), []);
});

test("tablero: SIMIT o RUNT sin respuesta de Croma salen en ámbar y a revisión (borde rojo)", () => {
  const ps = puntosDeTarjeta({ estado: "pendiente", preseleccion: { edad: { color: "verde" }, residencia: { color: "verde" }, licencia: { color: "pendiente" }, simit: { color: "pendiente" } }, autorizacion: "si", simitSinRespuesta: true, runtSinRespuesta: true });
  assert.equal(colores(ps), "verde,verde,ambar,ambar,verde");
  assert.deepEqual(ps.filter((x) => x.revisar).map((x) => x.etiqueta), ["Licencia", "SIMIT"]);
  // Si el SIMIT ya llegó (verde o rojo), manda lo que dijo, no el error viejo.
  const llego = puntosDeTarjeta({ estado: "pendiente", preseleccion: { simit: { color: "verde", motivo: "$0" } }, simitSinRespuesta: true });
  assert.equal(llego[3].color, "verde");
  assert.equal(llego[3].revisar, undefined);
});

test("tablero: lo que necesita una persona queda marcado para revisar", () => {
  const ant = puntosDeTarjeta({ estado: "antecedentes", antecedentes: { veredicto: "revision", decision: null, fuentes: [{ fuente: "rnmc", estado: "hallazgo", accion: "revision" }] } });
  assert.ok(ant.some((x) => x.etiqueta === "RNMC" && x.revisar));
  assert.ok(ant.some((x) => x.etiqueta === "Aval" && x.revisar));
  assert.equal(puntosDeTarjeta({ estado: "en_examenes_fase2", examenF1: "apto", examenF2: "no_apto" })[1].revisar, true);
  assert.equal(puntosDeTarjeta({ estado: "listo_contratar", examenF1: "apto", examenF2: "apto", reconocimiento: "finalizado", aprobacion: false }).some((x) => x.revisar), false);
});

test("tablero: con el aval de una persona, los hallazgos quedan verdes y no piden revisión", () => {
  const ps = puntosDeTarjeta({ estado: "antecedentes", antecedentes: { veredicto: "revision", decision: "aprobado", fuentes: [{ fuente: "policia", estado: "limpio" }, { fuente: "rnmc", estado: "hallazgo", accion: "revision", motivo: "Medida sin conducta" }] } });
  assert.ok(ps.every((x) => x.color === "verde" || x.color === "gris"));
  assert.equal(ps.some((x) => x.revisar), false);
  assert.match(ps.find((x) => x.etiqueta === "RNMC")?.detalle ?? "", /^Con aval/);
});
