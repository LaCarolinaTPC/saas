import { test } from "node:test";
import assert from "node:assert/strict";
import { TIEMPOS_REACTIVACION_POR_DEFECTO as T, accionReactivacion, tiemposDesdeAjustes, type ConversacionReactivacion } from "./reactivacion";

// 10:00 a. m. en Bogotá (UTC-5).
const AHORA = new Date("2026-11-13T15:00:00Z");
const haceH = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString();

const conv = (extra: Partial<ConversacionReactivacion> = {}): ConversacionReactivacion => ({
  ultimoMensajeAt: haceH(25),
  ultimoEntranteAt: haceH(26),
  ultimoEsNuestro: true,
  cerrada: false,
  paso: 0,
  ultimoPasoAt: null,
  hojaVidaRecibida: false,
  procesoEstado: null,
  buscaTrabajo: true,
  esAspirante: true,
  ...extra,
});

test("primer aviso a las 24 h de silencio sin hoja de vida", () => {
  assert.equal(accionReactivacion(conv(), AHORA, T), "aviso1");
  assert.equal(accionReactivacion(conv({ ultimoMensajeAt: haceH(10) }), AHORA, T), null);
  // Si el último mensaje es del aspirante, lo atiende el asistente o una persona, no la reactivación.
  assert.equal(accionReactivacion(conv({ ultimoEsNuestro: false }), AHORA, T), null);
});

test("no se reactiva a quien ya envió la hoja de vida, no busca trabajo o ya avanzó", () => {
  assert.equal(accionReactivacion(conv({ hojaVidaRecibida: true }), AHORA, T), null);
  assert.equal(accionReactivacion(conv({ buscaTrabajo: false }), AHORA, T), null);
  assert.equal(accionReactivacion(conv({ esAspirante: false }), AHORA, T), null);
  assert.equal(accionReactivacion(conv({ procesoEstado: "citado" }), AHORA, T), null);
  assert.equal(accionReactivacion(conv({ procesoEstado: "pendiente" }), AHORA, T), "aviso1");
  assert.equal(accionReactivacion(conv({ cerrada: true }), AHORA, T), null);
});

test("los avisos respetan el horario permitido; la llamada no envía nada y puede marcarse fuera de horario", () => {
  const noche = new Date("2026-11-14T03:00:00Z"); // 10 p. m. en Bogotá
  const haceDesdeNoche = (h: number) => new Date(noche.getTime() - h * 3_600_000).toISOString();
  assert.equal(accionReactivacion(conv({ ultimoMensajeAt: haceDesdeNoche(30) }), noche, T), null);
  assert.equal(accionReactivacion(conv({ paso: 2, ultimoPasoAt: haceDesdeNoche(25) }), noche, T), "llamar");
});

test("secuencia: segundo aviso a las 72 h, llamada 24 h después e incomunicado a los 7 días", () => {
  // El aspirante escribió por última vez antes del primer aviso.
  const callado = { ultimoEntranteAt: haceH(120) };
  assert.equal(accionReactivacion(conv({ ...callado, paso: 1, ultimoPasoAt: haceH(71) }), AHORA, T), null);
  assert.equal(accionReactivacion(conv({ ...callado, paso: 1, ultimoPasoAt: haceH(72), ultimoMensajeAt: haceH(72) }), AHORA, T), "aviso2");
  assert.equal(accionReactivacion(conv({ ...callado, paso: 2, ultimoPasoAt: haceH(24), ultimoMensajeAt: haceH(24) }), AHORA, T), "llamar");
  assert.equal(accionReactivacion(conv({ paso: 3, ultimoPasoAt: haceH(1), ultimoEntranteAt: haceH(6 * 24) }), AHORA, T), null);
  assert.equal(accionReactivacion(conv({ paso: 3, ultimoPasoAt: haceH(1), ultimoEntranteAt: haceH(7 * 24) }), AHORA, T), "incomunicado");
  assert.equal(accionReactivacion(conv({ paso: 4, ultimoPasoAt: haceH(1) }), AHORA, T), null);
});

test("si responde después de un aviso, la secuencia vuelve a empezar", () => {
  assert.equal(accionReactivacion(conv({ paso: 1, ultimoPasoAt: haceH(5), ultimoEntranteAt: haceH(2) }), AHORA, T), "reiniciar");
  assert.equal(accionReactivacion(conv({ paso: 3, ultimoPasoAt: haceH(5), ultimoEntranteAt: haceH(1), hojaVidaRecibida: true }), AHORA, T), "reiniciar");
});

test("tiempos desde los ajustes, con respaldo por defecto", () => {
  const t = tiemposDesdeAjustes([{ clave: "reactivacion_aviso1_horas", valor: 12 }, { clave: "incomunicado_dias", valor: "x" }], { horaDesde: "08:00", horaHasta: "18:00" });
  assert.equal(t.aviso1Horas, 12);
  assert.equal(t.incomunicadoDias, 7);
  assert.equal(t.horaDesde, "08:00");
});
