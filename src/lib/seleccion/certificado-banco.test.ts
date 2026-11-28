import { test } from "node:test";
import assert from "node:assert/strict";
import { AJUSTES_CERTIFICADO_POR_DEFECTO as A, accionCertificado, ajustesCertificado, type SituacionCertificado } from "./certificado-banco";

const base: SituacionCertificado = {
  estado: "en_examenes",
  banco_cuenta: "si",
  banco_respondido_at: "2026-11-20T15:00:00.000Z",
  itemEstado: null,
  enviado: false,
  recordatorios: 0,
  ultimoAt: null,
  escalado: false,
};
const h = (iso: string, horas: number) => new Date(new Date(iso).getTime() + horas * 3_600_000);

test("certificado bancario: cuándo recordarlo (24-nov-2026)", () => {
  // Tiene cuenta: a las 48 horas de responder.
  assert.equal(accionCertificado(base, A, h(base.banco_respondido_at!, 47)), null);
  assert.equal(accionCertificado(base, A, h(base.banco_respondido_at!, 48)), "recordar");
  // No tenía: se le da tiempo de abrirla (72 horas).
  assert.equal(accionCertificado({ ...base, banco_cuenta: "no" }, A, h(base.banco_respondido_at!, 60)), null);
  assert.equal(accionCertificado({ ...base, banco_cuenta: "no" }, A, h(base.banco_respondido_at!, 72)), "recordar");
  // Después, cada 48 horas desde el último; agotados, a una persona.
  const ultimo = "2026-11-23T15:00:00.000Z";
  assert.equal(accionCertificado({ ...base, recordatorios: 1, ultimoAt: ultimo }, A, h(ultimo, 47)), null);
  assert.equal(accionCertificado({ ...base, recordatorios: 2, ultimoAt: ultimo }, A, h(ultimo, 48)), "recordar");
  assert.equal(accionCertificado({ ...base, recordatorios: 3, ultimoAt: ultimo }, A, h(ultimo, 48)), "escalar");
  assert.equal(accionCertificado({ ...base, recordatorios: 3, ultimoAt: ultimo, escalado: true }, A, h(ultimo, 200)), null);
});

test("certificado bancario: cuándo no se recuerda", () => {
  const tarde = h(base.banco_respondido_at!, 100);
  assert.equal(accionCertificado({ ...base, enviado: true }, A, tarde), null, "ya lo envió (falta revisarlo)");
  assert.equal(accionCertificado({ ...base, itemEstado: "recibido" }, A, tarde), null);
  assert.equal(accionCertificado({ ...base, itemEstado: "validado" }, A, tarde), null);
  assert.equal(accionCertificado({ ...base, estado: "cierre" }, A, tarde), null);
  assert.equal(accionCertificado({ ...base, estado: "contratado" }, A, tarde), null);
  assert.equal(accionCertificado({ ...base, banco_cuenta: null }, A, tarde), null, "no ha respondido lo del banco");
  assert.equal(accionCertificado(base, { ...A, activo: false }, tarde), null);
});

test("certificado bancario: ajustes", () => {
  assert.deepEqual(ajustesCertificado(() => undefined), A);
  const a = ajustesCertificado((k) => ({ certificado_banco_activo: false, certificado_banco_horas: "24", certificado_banco_recordatorios: 99 })[k as never]);
  assert.equal(a.activo, false);
  assert.equal(a.horas, 24);
  assert.equal(a.recordatorios, 10);
});
