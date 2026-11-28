import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEGUIMIENTO_POR_DEFECTO as CFG, debeEscalar, debeRecordar, enHorario, mensajeDelRecordatorio, recordatoriosEnviados, textoRecordatorio, validarSeguimiento, ventanaAbierta,
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

test("debeRecordar: último nuestro, 2 h de silencio, ventana abierta", () => {
  assert.equal(debeRecordar(conv(), AHORA, CFG), true);
  assert.equal(debeRecordar(conv({ ultimoMensajeAt: haceH(1.5) }), AHORA, CFG), false, "todavía no pasan 2 h");
  assert.equal(debeRecordar(conv({ ultimoEsNuestro: false }), AHORA, CFG), false, "el último lo escribió el aspirante");
  assert.equal(debeRecordar(conv({ ultimoEntranteAt: haceH(30) }), AHORA, CFG), false, "ventana cerrada");
  assert.equal(debeRecordar(conv({ ultimoEntranteAt: null }), AHORA, CFG), false, "nunca escribió");
  // El recordatorio es lo último del chat: el siguiente espera otras 2 h.
  assert.equal(debeRecordar(conv({ seguimientoEnviadoAt: haceH(1), ultimoMensajeAt: haceH(1) }), AHORA, CFG), false, "recordado hace 1 h");
  assert.equal(debeRecordar(conv({ seguimientoEnviadoAt: haceH(2.5) }), AHORA, { ...CFG, maxRecordatorios: 1 }), false, "con 1 vez, ya se le recordó");
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
  const viejo = "Hola {nombre}, ¿sigues interesado en el proceso de selección de La Carolina? Respóndenos para continuar.";
  assert.equal(textoRecordatorio(viejo, "JUAN CARLOS PÉREZ"), "Hola Juan, ¿sigues interesado en el proceso de selección de La Carolina? Respóndenos para continuar.");
  assert.equal(textoRecordatorio(viejo, null), "Hola, ¿sigues interesado en el proceso de selección de La Carolina? Respóndenos para continuar.");
  assert.equal(textoRecordatorio("¿Sigues ahí, {nombre}?", "ana"), "¿Sigues ahí, Ana?");
  assert.equal(textoRecordatorio("¿Sigues ahí, {nombre}?", "  "), "¿Sigues ahí?");
  // Nombre pegado, con números o con emojis: se omite.
  assert.equal(textoRecordatorio("Hola {nombre}, ¿sigues ahí?", "Manuelguillermomarriaga"), "Hola, ¿sigues ahí?");
  assert.equal(textoRecordatorio("Hola {nombre}, ¿sigues ahí?", "Juan123"), "Hola, ¿sigues ahí?");
  assert.equal(textoRecordatorio("Hola {nombre}, ¿sigues ahí?", "😎 Juan"), "Hola, ¿sigues ahí?");
  assert.equal(textoRecordatorio("Hola {nombre}, ¿sigues ahí?", "MARÍA josé"), "Hola María, ¿sigues ahí?");
});

test("validarSeguimiento", () => {
  assert.equal(validarSeguimiento({ ...CFG }).ok, true);
  assert.equal(validarSeguimiento({ ...CFG, horasEspera: 0.2 }).ok, false);
  assert.equal(validarSeguimiento({ ...CFG, horaDesde: "7:00" }).ok, false);
  assert.equal(validarSeguimiento({ ...CFG, mensaje: "hola" }).ok, false);
  assert.equal(validarSeguimiento({ ...CFG, horasEscalar: 1.5 }).ok, false);
});

test("varios recordatorios: hasta maxRecordatorios por silencio, cada uno 2 h después del anterior", () => {
  // 3.ª hora del silencio: ya salió uno hace 2,5 h (lo último del chat).
  const uno = conv({ ultimoEntranteAt: haceH(5), ultimoMensajeAt: haceH(2.5), seguimientoEnviadoAt: haceH(2.5), seguimientoConteo: 1 });
  assert.equal(recordatoriosEnviados(uno), 1);
  assert.equal(debeRecordar(uno, AHORA, CFG), true, "sale el 2.º");
  const tres = { ...uno, seguimientoConteo: 3 };
  assert.equal(debeRecordar(tres, AHORA, CFG), false, "ya salieron los 3");
  // Enviado antes de que existiera la cuenta (0): vale por uno.
  assert.equal(recordatoriosEnviados({ ...uno, seguimientoConteo: 0 }), 1);
  // Respondió después del último: la cuenta vuelve a cero.
  assert.equal(recordatoriosEnviados(conv({ ultimoEntranteAt: haceH(3), seguimientoEnviadoAt: haceH(4), seguimientoConteo: 3 })), 0);
  // Ya completó lo que se pide por el chat o su proceso avanzó: no se le pregunta.
  assert.equal(debeRecordar(conv({ esperaRespuesta: false }), AHORA, CFG), false);
});

test("debeEscalar con varios recordatorios: después del último, o si la ventana se cerró antes", () => {
  const ventanaAbierta = { ultimoEntranteAt: haceH(20), seguimientoEnviadoAt: haceH(16), ultimoMensajeAt: haceH(16) };
  const cfg = { ...CFG, horasEscalar: 12 };
  assert.equal(debeEscalar(conv({ ...ventanaAbierta, seguimientoConteo: 1 }), AHORA, cfg), false, "faltan recordatorios y la ventana sigue abierta");
  assert.equal(debeEscalar(conv({ ...ventanaAbierta, seguimientoConteo: 3 }), AHORA, cfg), true, "salieron los 3");
  assert.equal(debeEscalar(conv({ ultimoEntranteAt: haceH(30), seguimientoEnviadoAt: haceH(25), ultimoMensajeAt: haceH(25), seguimientoConteo: 1 }), AHORA, CFG), true, "ventana cerrada");
  assert.equal(debeEscalar(conv({ ...ventanaAbierta, seguimientoConteo: 3, esperaRespuesta: false }), AHORA, cfg), false);
});

test("validarSeguimiento: veces de 1 a 10", () => {
  assert.equal(validarSeguimiento({ ...CFG, maxRecordatorios: 0 }).ok, false);
  assert.equal(validarSeguimiento({ ...CFG, maxRecordatorios: 11 }).ok, false);
  assert.equal(validarSeguimiento({ ...CFG, maxRecordatorios: 2.5 }).ok, false);
  const ok = validarSeguimiento({ ...CFG, maxRecordatorios: 5 });
  assert.ok(ok.ok && ok.config.maxRecordatorios === 5);
  assert.equal(CFG.maxRecordatorios, 3);
});

test("cada recordatorio con su texto; si faltan, se repite el último", () => {
  assert.match(mensajeDelRecordatorio(CFG, 1), /^¡Hola nuevamente!/);
  assert.match(mensajeDelRecordatorio(CFG, 2), /^¡Tenemos grandes beneficios/);
  assert.match(mensajeDelRecordatorio(CFG, 3), /^🚍/);
  assert.equal(mensajeDelRecordatorio(CFG, 5), mensajeDelRecordatorio(CFG, 3));
  assert.equal(mensajeDelRecordatorio({ mensaje: "Uno uno uno", mensajesSiguientes: [] }, 2), "Uno uno uno");
  // Los saltos de línea se respetan.
  assert.match(textoRecordatorio(mensajeDelRecordatorio(CFG, 2), "ana"), /\n🚘 Formación continua/);
  // Solo se guardan los que se usan; los vacíos del final se quitan; uno muy corto no vale.
  const v = validarSeguimiento({ ...CFG, maxRecordatorios: 2, mensajesSiguientes: ["Segundo recordatorio", "Tercero que sobra"] });
  assert.ok(v.ok && v.config.mensajesSiguientes.length === 1);
  const vacios = validarSeguimiento({ ...CFG, mensajesSiguientes: ["Segundo recordatorio", "  "] });
  assert.ok(vacios.ok && vacios.config.mensajesSiguientes.length === 1);
  assert.equal(validarSeguimiento({ ...CFG, mensajesSiguientes: ["corto"] }).ok, false);
});
