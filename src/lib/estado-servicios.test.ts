import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarEventos } from "./estado-servicios";

const ahora = new Date("2026-11-24T15:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();

test("estado de servicios: fallando con 3 errores seguidos recientes", () => {
  const r = evaluarEventos([{ ok: false, at: hace(5), error: "timeout" }, { ok: false, at: hace(20) }, { ok: false, at: hace(40) }, { ok: true, at: hace(60) }], ahora);
  assert.equal(r.nivel, "fallando");
  assert.equal(r.seguidos, 3);
  assert.equal(r.ultimoError?.texto, "timeout");
  assert.equal(r.ultimoOkAt, hace(60));
});

test("estado de servicios: un error suelto o errores viejos no son «fallando»", () => {
  assert.equal(evaluarEventos([{ ok: false, at: hace(5) }, { ok: true, at: hace(10) }, { ok: true, at: hace(20) }], ahora).nivel, "ok");
  // Tres seguidos pero hace más de 3 horas (y nada desde entonces): no se avisa.
  assert.equal(evaluarEventos([{ ok: false, at: hace(200) }, { ok: false, at: hace(210) }, { ok: false, at: hace(220) }], ahora).nivel, "ok");
  assert.equal(evaluarEventos([], ahora).nivel, "sin_datos");
});

test("estado de servicios: la mitad de los intentos de la última hora fallaron", () => {
  const ev = [
    { ok: true, at: hace(1) },
    ...[5, 10, 15, 20, 25].map((m) => ({ ok: false, at: hace(m) })),
    ...[30, 35, 40].map((m) => ({ ok: true, at: hace(m) })),
  ];
  const r = evaluarEventos(ev, ahora);
  assert.equal(r.seguidos, 0);
  assert.equal(r.nivel, "fallando");
  assert.equal(r.errores24h, 5);
  assert.equal(r.total24h, 9);
});

test("alerta por correo: en pruebas lo dice en el asunto y al comienzo; en producción no", async () => {
  const { armarCorreoAlerta } = await import("./alerta-servicios");
  const s = { nombre: "Croma (RUNT, SIMIT y antecedentes)", seguidos: 4, errores24h: 6, total24h: 18, ultimoError: { texto: "timeout", at: hace(5) }, ultimoOkAt: hace(90), consejo: "Páuselo." };
  const dev = armarCorreoAlerta("falla", s, { desarrollo: true, url: "http://x/estado" });
  assert.match(dev.asunto, /^\[PRUEBAS\] Gestivo: Croma .* está fallando$/);
  assert.match(dev.texto, /ENTORNO DE PRUEBAS/);
  assert.match(dev.html, /ENTORNO DE PRUEBAS/);
  assert.match(dev.texto, /4 errores seguidos · 6 de 18/);
  assert.match(dev.texto, /timeout/);
  const prod = armarCorreoAlerta("falla", s, { desarrollo: false, url: "http://x/estado" });
  assert.doesNotMatch(prod.asunto, /PRUEBAS/);
  assert.doesNotMatch(prod.texto, /ENTORNO DE PRUEBAS/);
  const ok = armarCorreoAlerta("recuperado", s, { desarrollo: false, url: "http://x", desdeAt: hace(120) });
  assert.match(ok.asunto, /volvió a funcionar/);
  assert.equal(armarCorreoAlerta("recordatorio", s, { desarrollo: false, url: "u" }).asunto, "Gestivo: Croma (RUNT, SIMIT y antecedentes) sigue fallando");
});
