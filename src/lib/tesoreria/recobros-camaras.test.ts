import { test } from "node:test";
import assert from "node:assert/strict";
import { contarAlarma, esDeCaja, ETAPAS_CAJA, etapaSolicitud, textoAlarma, validarCobro, type CobroInput, type SeguimientoSolicitud } from "./recobros-camaras";

const sol = (p: Partial<SeguimientoSolicitud>): SeguimientoSolicitud => ({
  estado: "resuelto", resultado: "recobro", vistoAt: null, cobroEstado: null, ...p,
});
const ctx = { fechaViaje: "2026-10-20", hoy: "2026-10-26" };

test("etapas del ciclo", () => {
  assert.equal(etapaSolicitud(sol({ estado: "pendiente", resultado: null })), "en_camaras");
  assert.equal(etapaSolicitud(sol({ resultado: "normalidad_timbradas" })), "sin_revisar");
  assert.equal(etapaSolicitud(sol({ resultado: "normalidad_timbradas", vistoAt: "x" })), "cerrada");
  // El recobro va a caja aunque cartulina no lo haya visto.
  assert.equal(etapaSolicitud(sol({})), "pendiente_caja");
  assert.equal(etapaSolicitud(sol({ cobroEstado: "cobrado" })), "cobrado");
  assert.equal(etapaSolicitud(sol({ cobroEstado: "no_cobrado", vistoAt: "x" })), "no_cobrado");
});

test("la alarma cuenta lo no visto y los recobros sin gestión", () => {
  const a = contarAlarma([
    sol({ estado: "pendiente", resultado: null }), // en cámaras: no cuenta
    sol({}),                                        // sin ver y por cobrar
    sol({ vistoAt: "x" }),                          // solo por cobrar
    sol({ cobroEstado: "cobrado" }),                // solo sin ver
    sol({ resultado: "normalidad_timbradas", vistoAt: "x" }), // cerrada
  ]);
  assert.deepEqual(a, { sinVer: 2, porCobrar: 2 });
  assert.equal(textoAlarma(a), "2 respuestas de cámaras sin revisar · 2 recobros sin gestión de caja");
  assert.equal(textoAlarma({ sinVer: 1, porCobrar: 0 }), "1 respuesta de cámaras sin revisar");
  assert.equal(textoAlarma({ sinVer: 0, porCobrar: 0 }), null);
});

test("caja solo ve recobros resueltos, en sus tres etapas", () => {
  const todas = [
    sol({ estado: "pendiente", resultado: null }),
    sol({ resultado: "normalidad_timbradas" }),
    sol({}),
    sol({ cobroEstado: "cobrado" }),
    sol({ cobroEstado: "no_cobrado" }),
  ];
  const deCaja = todas.filter(esDeCaja);
  assert.equal(deCaja.length, 3);
  assert.deepEqual(deCaja.map(etapaSolicitud), [...ETAPAS_CAJA]);
});

test("cobrado exige valor entero, fecha válida y soporte", () => {
  const ok = validarCobro({ estado: "cobrado", valor: 25000, fecha: "2026-10-25", soporte: " RC-123 ", motivo: "viejo" }, ctx);
  assert.deepEqual(ok, { ok: true, cobro: { estado: "cobrado", valor: 25000, fecha: "2026-10-25", soporte: "RC-123", motivo: null, nota: null } });
  for (const [input, msg] of [
    [{ valor: null }, /valor/],
    [{ valor: 0 }, /valor/],
    [{ valor: 1500.5 }, /valor/],
    [{ valor: 20_000_000 }, /pasar/],
    [{ fecha: "" }, /fecha/],
    [{ fecha: "2026-10-19" }, /anterior/],
    [{ fecha: "2026-10-27" }, /futura/],
    [{ soporte: "  " }, /recibo/],
  ] as const) {
    const base: CobroInput = { estado: "cobrado", valor: 25000, fecha: "2026-10-25", soporte: "RC" };
    const r = validarCobro({ ...base, ...input }, ctx);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, msg);
  }
});

test("no cobrado exige motivo y descarta valor y soporte", () => {
  const r = validarCobro({ estado: "no_cobrado", motivo: "Conductor retirado", valor: 5000, soporte: "X", nota: " ok " }, ctx);
  assert.deepEqual(r, { ok: true, cobro: { estado: "no_cobrado", valor: null, fecha: null, soporte: null, motivo: "Conductor retirado", nota: "ok" } });
  const sin = validarCobro({ estado: "no_cobrado", motivo: "   " }, ctx);
  assert.equal(sin.ok, false);
});
