import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEGUIMIENTO_POR_DEFECTO as CFG, debeEscalar, debeRecordar, enHorario, textoRecordatorio, validarSeguimiento, ventanaAbierta,
  type ConversacionSeguimiento,
} from "./seguimiento";

// 10:00 a. m. en Bogotá (UTC-5).
const AHORA = new Date("2026-11-10T15:00:00Z");
const haceH = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString();

const conv = (extra: Partial<ConversacionSeguimiento> = {}): ConversacionSeguimiento => ({
  ultimoMensajeAt: haceH(2.5),
  ultimoEntranteAt: haceH(3),
  ultimoEsNuestro: true,
  seguimientoEnviadoAt: null,
  seguimientoEscaladoAt: null,
  requiereHumano: false,
  cerrada: false,
  ...extra,
});

test("enHorario y ventanaAbierta", () => {
  assert.equal(enHorario(AHORA, "07:00", "20:00"), true);
  assert.equal(enHorario(new Date("2026-11-10T02:00:00Z"), "07:00", "20:00"), false); // 9 p. m.
  assert.equal(enHorario(new Date("2026-11-10T02:00:00Z"), "20:00", "06:00"), true); // cruza medianoche
  assert.equal(ventanaAbierta(haceH(23), AHORA), true);
  assert.equal(ventanaAbierta(haceH(23.9), AHORA), false); // dentro del margen de 15 min
  assert.equal(ventanaAbierta(null, AHORA), false);
});

test("debeRecordar: último nuestro, 2 h de silencio, ventana abierta, una vez por silencio", () => {
  assert.equal(debeRecordar(conv(), AHORA, CFG), true);
  assert.equal(debeRecordar(conv({ ultimoMensajeAt: haceH(1.5) }), AHORA, CFG), false, "todavía no pasan 2 h");
  assert.equal(debeRecordar(conv({ ultimoEsNuestro: false }), AHORA, CFG), false, "el último lo escribió el aspirante");
  assert.equal(debeRecordar(conv({ ultimoEntranteAt: haceH(30) }), AHORA, CFG), false, "ventana cerrada");
  assert.equal(debeRecordar(conv({ ultimoEntranteAt: null }), AHORA, CFG), false, "nunca escribió");
  assert.equal(debeRecordar(conv({ seguimientoEnviadoAt: haceH(1) }), AHORA, CFG), false, "ya se le recordó");
  // Se le recordó en un silencio anterior y luego volvió a escribir: se puede recordar otra vez.
  assert.equal(debeRecordar(conv({ seguimientoEnviadoAt: haceH(10) }), AHORA, CFG), true);
  assert.equal(debeRecordar(conv({ cerrada: true }), AHORA, CFG), false);
  assert.equal(debeRecordar(conv(), new Date("2026-11-10T02:00:00Z"), CFG), false, "de noche no");
  assert.equal(debeRecordar(conv(), AHORA, { ...CFG, activo: false }), false);
});

test("debeEscalar: 24 h sin responder al recordatorio, una sola vez", () => {
  const base = { ultimoEntranteAt: haceH(30), ultimoMensajeAt: haceH(25), seguimientoEnviadoAt: haceH(25) };
  assert.equal(debeEscalar(conv(base), AHORA, CFG), true);
  assert.equal(debeEscalar(conv({ ...base, seguimientoEnviadoAt: haceH(20) }), AHORA, CFG), false, "aún no pasan 24 h");
  assert.equal(debeEscalar(conv({ ...base, ultimoEntranteAt: haceH(10) }), AHORA, CFG), false, "respondió después del recordatorio");
  assert.equal(debeEscalar(conv({ ...base, seguimientoEscaladoAt: haceH(1) }), AHORA, CFG), false, "ya se marcó");
  assert.equal(debeEscalar(conv({ ...base, requiereHumano: true }), AHORA, CFG), false);
  assert.equal(debeEscalar(conv(base), AHORA, { ...CFG, horasEscalar: 0 }), false);
  assert.equal(debeEscalar(conv({ seguimientoEnviadoAt: null }), AHORA, CFG), false);
});

test("textoRecordatorio: primer nombre o sin nombre", () => {
  assert.equal(textoRecordatorio(CFG.mensaje, "JUAN CARLOS PÉREZ"), "Hola Juan, ¿sigues interesado en el proceso de selección de La Carolina? Respóndenos para continuar.");
  assert.equal(textoRecordatorio(CFG.mensaje, null), "Hola, ¿sigues interesado en el proceso de selección de La Carolina? Respóndenos para continuar.");
  assert.equal(textoRecordatorio("¿Sigues ahí, {nombre}?", "ana"), "¿Sigues ahí, Ana?");
  assert.equal(textoRecordatorio("¿Sigues ahí, {nombre}?", "  "), "¿Sigues ahí?");
});

test("validarSeguimiento", () => {
  assert.equal(validarSeguimiento({ ...CFG }).ok, true);
  assert.equal(validarSeguimiento({ ...CFG, horasEspera: 0.2 }).ok, false);
  assert.equal(validarSeguimiento({ ...CFG, horaDesde: "7:00" }).ok, false);
  assert.equal(validarSeguimiento({ ...CFG, mensaje: "hola" }).ok, false);
  assert.equal(validarSeguimiento({ ...CFG, horasEscalar: 1.5 }).ok, false);
});
