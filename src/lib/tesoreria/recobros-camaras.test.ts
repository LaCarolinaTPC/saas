import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diasAtencion, esDeCaja, ETAPAS_CAJA, etapaSolicitud, indicadoresRecobros,
  motivoNoPermitido, nivelDias, pasaFiltro, validarCobro, validarGestion, validarTexto,
  type CobroInput, type GestionInput, type RecobroIndicador,
} from "./recobros-camaras";

const sol = (p: Partial<RecobroIndicador>): RecobroIndicador => ({
  estado: "resuelto", resultado: "recobro", cobroEstado: null, gestionesN: 0,
  gestionProximaFecha: null, incobrableSolicitadoAt: null,
  // 2026-10-20 a mediodía en Bogotá.
  resueltoAt: "2026-10-20T17:00:00Z", cobroFecha: null, cobroValor: null, incobrableAutorizadoAt: null,
  ...p,
});
const HOY = "2026-10-26";
const ctx = { fechaViaje: "2026-10-20", hoy: HOY };

test("etapas del ciclo", () => {
  assert.equal(etapaSolicitud(sol({ estado: "pendiente", resultado: null })), "en_camaras");
  // La respuesta de cámaras no espera visto: la normalidad queda cerrada y el
  // recobro va directo a caja.
  assert.equal(etapaSolicitud(sol({ resultado: "normalidad_timbradas" })), "cerrada");
  assert.equal(etapaSolicitud(sol({})), "pendiente_caja");
  assert.equal(etapaSolicitud(sol({ gestionesN: 1 })), "en_seguimiento");
  assert.equal(etapaSolicitud(sol({ gestionesN: 2, incobrableSolicitadoAt: "x" })), "por_autorizar");
  assert.equal(etapaSolicitud(sol({ cobroEstado: "cobrado", gestionesN: 3 })), "cobrado");
  assert.equal(etapaSolicitud(sol({ cobroEstado: "incobrable", incobrableSolicitadoAt: "x" })), "incobrable");
});

test("caja ve solo recobros resueltos, en sus cinco etapas", () => {
  const todas = [
    sol({ estado: "pendiente", resultado: null }),
    sol({ resultado: "normalidad_timbradas" }),
    sol({}),
    sol({ gestionesN: 1 }),
    sol({ incobrableSolicitadoAt: "x" }),
    sol({ cobroEstado: "cobrado" }),
    sol({ cobroEstado: "incobrable" }),
  ];
  const deCaja = todas.filter(esDeCaja);
  assert.equal(deCaja.length, 5);
  assert.deepEqual(deCaja.map(etapaSolicitud), [...ETAPAS_CAJA]);
  assert.equal(todas.filter((s) => pasaFiltro(s, "abiertos", HOY)).length, 3);
});

test("quién puede gestionar, cobrar, pedir, autorizar, rechazar y reabrir", () => {
  const caja = { caja: true, autoriza: false };
  const dir = { caja: false, autoriza: true };
  const abierto = sol({ gestionesN: 1 });
  const pedido = sol({ incobrableSolicitadoAt: "x" });
  const cerrado = sol({ cobroEstado: "incobrable" });

  assert.equal(motivoNoPermitido("gestion", abierto, caja), null);
  assert.match(motivoNoPermitido("gestion", abierto, dir)!, /caja/);
  assert.equal(motivoNoPermitido("gestion", pedido, caja), null); // sigue abierto mientras espera
  assert.equal(motivoNoPermitido("cobrar", pedido, caja), null);
  assert.match(motivoNoPermitido("cobrar", cerrado, caja)!, /reabrir/);

  assert.equal(motivoNoPermitido("solicitar_incobrable", abierto, caja), null);
  assert.match(motivoNoPermitido("solicitar_incobrable", pedido, caja)!, /esperando/);

  // Caja no puede saltarse a la directora.
  assert.match(motivoNoPermitido("autorizar", pedido, caja)!, /directora/);
  assert.equal(motivoNoPermitido("autorizar", pedido, dir), null);
  assert.equal(motivoNoPermitido("rechazar", pedido, dir), null);
  assert.match(motivoNoPermitido("autorizar", abierto, dir)!, /No hay una solicitud/);

  assert.equal(motivoNoPermitido("reabrir", cerrado, dir), null);
  assert.match(motivoNoPermitido("reabrir", cerrado, caja)!, /directora/);
  assert.match(motivoNoPermitido("reabrir", abierto, dir)!, /incobrable/);

  assert.match(motivoNoPermitido("gestion", sol({ resultado: "normalidad_timbradas" }), caja)!, /recobros/);
});

test("cobro exige valor entero, fecha válida y soporte", () => {
  const ok = validarCobro({ valor: 25000, fecha: "2026-10-25", soporte: " RC-123 " }, ctx);
  assert.deepEqual(ok, { ok: true, cobro: { valor: 25000, fecha: "2026-10-25", soporte: "RC-123", nota: null } });
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
    const base: CobroInput = { valor: 25000, fecha: "2026-10-25", soporte: "RC" };
    const r = validarCobro({ ...base, ...input }, ctx);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, msg);
  }
});

test("gestión: fecha entre la respuesta de cámaras y hoy, texto y próxima fecha razonable", () => {
  const g = { desde: "2026-10-20", hoy: HOY };
  assert.deepEqual(validarGestion({ fecha: "2026-10-22", gestion: " Llamada ", proximaFecha: "" }, g),
    { ok: true, gestion: { fecha: "2026-10-22", gestion: "Llamada", proximaFecha: null } });
  assert.equal(validarGestion({ fecha: HOY, gestion: "x", proximaFecha: "2027-01-24" }, g).ok, true); // 90 días
  for (const [input, msg] of [
    [{ fecha: "" }, /fecha/],
    [{ fecha: "2026-10-19" }, /anterior/],
    [{ fecha: "2026-10-27" }, /futura/],
    [{ gestion: "   " }, /gestión/],
    [{ proximaFecha: "2026-10-25" }, /pasada/],
    [{ proximaFecha: "2027-01-25" }, /90/],
  ] as const) {
    const base: GestionInput = { fecha: "2026-10-22", gestion: "Llamada" };
    const r = validarGestion({ ...base, ...input }, g);
    assert.equal(r.ok, false, JSON.stringify(input));
    if (!r.ok) assert.match(r.error, msg);
  }
  assert.equal(validarTexto("  ", "Falta").ok, false);
  assert.equal(validarTexto("x".repeat(501), "Falta").ok, false);
});

test("días de atención: desde la respuesta de cámaras hasta el cierre o hasta hoy", () => {
  assert.equal(diasAtencion(sol({}), HOY), 6);
  assert.equal(diasAtencion(sol({ cobroEstado: "cobrado", cobroFecha: "2026-10-23" }), HOY), 3);
  assert.equal(diasAtencion(sol({ cobroEstado: "incobrable", incobrableAutorizadoAt: "2026-10-25T03:00:00Z" }), HOY), 4); // 24-oct en Bogotá
  // 23:30 de Bogotá del 20 ya es 21 en UTC: cuenta el día de Bogotá.
  assert.equal(diasAtencion(sol({ resueltoAt: "2026-10-21T04:30:00Z" }), HOY), 6);
  assert.equal(diasAtencion(sol({ resultado: "normalidad_timbradas" }), HOY), null);
  assert.deepEqual([7, 8, 15, 16].map(nivelDias), ["normal", "alerta", "alerta", "critico"]);
});

test("indicadores de gestión del recobro", () => {
  const ind = indicadoresRecobros([
    sol({ resultado: "normalidad_timbradas" }),                                             // no es recobro
    sol({}),                                                                                // abierto 6 d, sin gestión
    sol({ resueltoAt: "2026-10-01T17:00:00Z", gestionesN: 2, gestionProximaFecha: "2026-10-24" }), // 25 d, vencida
    sol({ resueltoAt: "2026-09-01T17:00:00Z", gestionesN: 1, incobrableSolicitadoAt: "2026-10-24T15:00:00Z" }), // 55 d, espera 2
    sol({ cobroEstado: "cobrado", cobroFecha: "2026-10-22", cobroValor: 30000, gestionesN: 1 }), // 2 d
    sol({ cobroEstado: "cobrado", cobroFecha: "2026-10-30", cobroValor: 20000 }),          // 10 d
    sol({ cobroEstado: "incobrable", incobrableAutorizadoAt: "2026-10-26T15:00:00Z" }),    // 6 d
  ], HOY);
  assert.equal(ind.recobros, 6);
  assert.equal(ind.abiertos, 3);
  assert.deepEqual([ind.sinGestion, ind.enSeguimiento, ind.porAutorizar, ind.vencidas], [1, 1, 1, 1]);
  assert.deepEqual([ind.cobrados, ind.incobrables, ind.montoCobrado], [2, 1, 50000]);
  assert.equal(ind.tasaCobro, 2 / 3);
  assert.equal(ind.diasCerradosPromedio, 6);
  assert.equal(ind.diasCerradosMediana, 6);
  assert.equal(ind.diasAbiertosMaximo, 55);
  assert.deepEqual(ind.tramosAbiertos, [1, 0, 1, 1]);
  assert.equal(ind.gestionesPorRecobro, 4 / 6);
  assert.equal(ind.diasEsperandoAutorizacion, 2);

  const vacio = indicadoresRecobros([], HOY);
  assert.equal(vacio.tasaCobro, null);
  assert.equal(vacio.diasAbiertosPromedio, null);
});
