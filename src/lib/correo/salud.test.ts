import { test } from "node:test";
import assert from "node:assert/strict";
import { esErrorDeCredenciales, interpretarEstadoBrevo } from "./salud";
import { evaluarCorreo } from "@/lib/estado-servicios";

test("el 535 de Brevo es un error de credenciales; un tiempo agotado no", () => {
  assert.equal(esErrorDeCredenciales("Invalid login: 535 5.7.8 Authentication failed"), true);
  assert.equal(esErrorDeCredenciales("EAUTH"), true);
  assert.equal(esErrorDeCredenciales("Connection timeout"), false);
});

test("la página de Brevo: solo cuentan SMTP y los envíos transaccionales", () => {
  const comp = (name: string, status: string) => ({ name, status });
  assert.equal(interpretarEstadoBrevo({ components: [comp("SMTP", "operational"), comp("Transactional emails delivery", "operational"), comp("SMS Campaigns", "major_outage")] }).estado, "operativo");
  const mal = interpretarEstadoBrevo({ components: [comp("SMTP", "partial_outage"), comp("Transactional emails delivery", "operational")] });
  assert.equal(mal.estado, "problemas");
  assert.match(mal.texto ?? "", /SMTP: partial outage/);
  assert.equal(interpretarEstadoBrevo({}).estado, "desconocido");
});

const sinNovedad = { nivel: "ok" as const, seguidos: 0, errores24h: 0, total24h: 3, ultimoError: null, ultimoOkAt: "2026-11-27T19:00:00Z" };

test("el SMTP rechaza la clave: el correo está fallando aunque los últimos envíos salieran", () => {
  const r = evaluarCorreo(sinNovedad, { ok: false, credenciales: true, error: "535 5.7.8 Authentication failed", at: "2026-11-27T21:00:00Z" }, null);
  assert.equal(r.nivel, "fallando");
  assert.match(r.consejo ?? "", /SMTP_PASS/);
  assert.match(r.ultimoError?.texto ?? "", /535/);
});

test("Brevo reporta problemas: fallando; todo bien: sin consejo", () => {
  const pagina = { estado: "problemas" as const, texto: "SMTP: major outage", url: "https://status.brevo.com", revisadoAt: "2026-11-27T21:00:00Z" };
  assert.equal(evaluarCorreo(sinNovedad, { ok: true, credenciales: false, error: null, at: "x" }, pagina).nivel, "fallando");
  const ok = evaluarCorreo(sinNovedad, { ok: true, credenciales: false, error: null, at: "x" }, { ...pagina, estado: "operativo", texto: "ok" });
  assert.equal(ok.nivel, "ok");
  assert.equal(ok.consejo, null);
});
