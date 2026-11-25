import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accionCron,
  ajustesCorreo,
  correoValido,
  decidirEntrante,
  enlaceVencido,
  extraerCorreo,
  interpretarSiNo,
  mensajeRecordatorio,
  type AjustesCorreo,
  type ProcesoCorreo,
} from "./correo-psico";
import { reglasCorreoPsico } from "@/lib/comunicaciones/agente/motor";

test("correo: lo reconoce dentro del mensaje, como lo escriben en el celular", () => {
  assert.equal(extraerCorreo("mi correo es Carlos.Perez@Gmail.com gracias"), "carlos.perez@gmail.com");
  assert.equal(extraerCorreo("carlos @ gmail.com"), "carlos@gmail.com");
  assert.equal(extraerCorreo("carlos arroba gmail punto com"), "carlos@gmail.com");
  assert.equal(extraerCorreo("es juan_23@hotmail.es."), "juan_23@hotmail.es");
  assert.equal(extraerCorreo("pedro@empresa.com.co"), "pedro@empresa.com.co");
  assert.equal(extraerCorreo("no tengo correo"), null);
  assert.equal(extraerCorreo("carlos@gmail"), null);
  assert.equal(extraerCorreo(null), null);
});

test("correo: bien escrito", () => {
  assert.equal(correoValido("a@b.co"), true);
  assert.equal(correoValido("a b@c.com"), false);
  assert.equal(correoValido("a..b@c.com"), false);
  assert.equal(correoValido("sin-arroba.com"), false);
  assert.equal(correoValido(""), false);
});

test("correo: sí y no a «¿Tu correo es …?»", () => {
  assert.equal(interpretarSiNo("Sí, es correcto"), "si");
  assert.equal(interpretarSiNo("si"), "si");
  assert.equal(interpretarSiNo("Correcto"), "si");
  assert.equal(interpretarSiNo("No, lo corrijo"), "no");
  assert.equal(interpretarSiNo("no está bien"), "no");
  assert.equal(interpretarSiNo("no"), "no");
  assert.equal(interpretarSiNo("y la prueba cuándo es?"), null);
  assert.equal(interpretarSiNo("si pero quiero saber primero cuánto pagan por el trabajo de conductor"), null);
});

test("correo: qué hace Gestivo con cada mensaje", () => {
  assert.deepEqual(decidirEntrante(null, "carlos@gmail.com"), { tipo: "nada" });
  assert.deepEqual(decidirEntrante("pedido", "carlos@gmail.com"), { tipo: "preguntar", correo: "carlos@gmail.com" });
  assert.deepEqual(decidirEntrante("pedido", "sí"), { tipo: "nada" });
  assert.deepEqual(decidirEntrante("por_confirmar", "Sí, es correcto"), { tipo: "enviar" });
  assert.deepEqual(decidirEntrante("por_confirmar", "No, lo corrijo"), { tipo: "corregir" });
  assert.deepEqual(decidirEntrante("por_confirmar", "otro@gmail.com"), { tipo: "preguntar", correo: "otro@gmail.com" });
  assert.deepEqual(decidirEntrante("por_confirmar", "¿para qué es?"), { tipo: "nada" });
  // Ya enviado: si escribe otro correo se vuelve a preguntar; un «sí» suelto lo atiende el asistente.
  assert.deepEqual(decidirEntrante("enviado", "mejor este: nuevo@gmail.com"), { tipo: "preguntar", correo: "nuevo@gmail.com" });
  assert.deepEqual(decidirEntrante("enviado", "sí"), { tipo: "nada" });
  assert.deepEqual(decidirEntrante("validado", "otro@gmail.com"), { tipo: "nada" });
  assert.deepEqual(decidirEntrante("inscrito", "otro@gmail.com"), { tipo: "nada" });
});

const a: AjustesCorreo = { activo: true, horas: 24, recordatorios: 3 };
const ahora = new Date("2026-11-24T15:00:00Z");
const hace = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString();
const proc = (p: Partial<ProcesoCorreo> = {}): ProcesoCorreo => ({
  estado: "en_examenes",
  origen: "whatsapp_agente",
  correo_estado: null,
  correo_recordatorio_at: null,
  correo_recordatorios: 0,
  correo_escalado_at: null,
  ...p,
});

test("correo: pedir, recordar y pasar a una persona", () => {
  assert.equal(accionCron(proc(), a, ahora), "pedir");
  assert.equal(accionCron(proc({ estado: "prueba_manejo" }), a, ahora), null);
  assert.equal(accionCron(proc({ estado: "contratado" }), a, ahora), null);
  assert.equal(accionCron(proc({ origen: "chat_prueba" }), a, ahora), null);
  assert.equal(accionCron(proc(), { ...a, activo: false }, ahora), null);
  assert.equal(accionCron(proc({ correo_estado: "pedido", correo_recordatorio_at: hace(2) }), a, ahora), null);
  assert.equal(accionCron(proc({ correo_estado: "pedido", correo_recordatorio_at: hace(25) }), a, ahora), "recordar");
  assert.equal(accionCron(proc({ correo_estado: "enviado", correo_recordatorio_at: hace(25), correo_recordatorios: 2 }), a, ahora), "recordar");
  assert.equal(accionCron(proc({ correo_estado: "pedido", correo_recordatorio_at: hace(25), correo_recordatorios: 3 }), a, ahora), "escalar");
  assert.equal(accionCron(proc({ correo_estado: "pedido", correo_recordatorio_at: hace(25), correo_recordatorios: 3, correo_escalado_at: hace(1) }), a, ahora), null);
  assert.equal(accionCron(proc({ correo_estado: "validado", correo_recordatorio_at: hace(100) }), a, ahora), null);
  assert.equal(accionCron(proc({ correo_estado: "inscrito" }), a, ahora), null);
  assert.equal(accionCron(proc({ estado: "en_examenes_fase2" }), a, ahora), "pedir");
});

test("correo: mensaje del recordatorio, ajustes y vigencia del enlace", () => {
  assert.equal(mensajeRecordatorio("enviado"), "recordatorio_validar_correo");
  assert.equal(mensajeRecordatorio("pedido"), "recordatorio_correo");
  assert.equal(mensajeRecordatorio("por_confirmar"), "recordatorio_correo");
  assert.deepEqual(ajustesCorreo(() => undefined), { activo: true, horas: 24, recordatorios: 3 });
  const vals: Record<string, unknown> = { correo_psico_activo: false, correo_psico_horas: 6, correo_psico_recordatorios: 99 };
  assert.deepEqual(ajustesCorreo((k) => vals[k]), { activo: false, horas: 6, recordatorios: 10 });
  assert.equal(enlaceVencido(hace(-1), ahora), false);
  assert.equal(enlaceVencido(hace(1), ahora), true);
  assert.equal(enlaceVencido(null, ahora), true);
});

test("correo: lo que sabe el asistente", () => {
  assert.deepEqual(reglasCorreoPsico(null), []);
  const pedido = reglasCorreoPsico({ estado: "pedido", correo: null }).join("\n");
  assert.match(pedido, /recuérdale/);
  const enviado = reglasCorreoPsico({ estado: "enviado", correo: "a@b.co" }).join("\n");
  assert.match(enviado, /«a@b\.co»/);
  assert.match(enviado, /spam/);
});
