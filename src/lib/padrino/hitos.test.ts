import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoReferidoPorHitos, evaluarHito, validarAprobacionHito, validarPago, type HechosPermanencia } from "./hitos";

const INGRESO = "2026-10-15";
const HITO = "2026-11-15";
const condPadrino = { tipo: "conductor" as const, estado: "ACTIVO", fechaRetiro: null };
const ok: HechosPermanencia = { referido: { estado: "ACTIVO", fechaRetiro: null }, padrino: condPadrino };

test("antes de su fecha el hito sigue pendiente", () => {
  assert.deepEqual(evaluarHito(HITO, INGRESO, "2026-11-14", ok), { estado: "pendiente", motivo: null });
});

test("a su fecha, con referido activo y padrino vigente, queda por aprobar", () => {
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-15", ok).estado, "por_aprobar");
});

test("referido retirado antes de la causación: no causado y cancela los siguientes", () => {
  const r = evaluarHito(HITO, INGRESO, "2026-11-20", { ...ok, referido: { estado: "RETIRADO", fechaRetiro: "2026-11-10" } });
  assert.equal(r.estado, "no_causado");
  assert.equal(r.estado === "no_causado" && r.cancelaSiguientes, true);
  assert.match(r.motivo ?? "", /10\/11\/2026/);
});

test("retiro el mismo día de la causación tampoco causa; uno posterior sí", () => {
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", { ...ok, referido: { estado: "RETIRADO", fechaRetiro: HITO } }).estado, "no_causado");
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", { ...ok, referido: { estado: "RETIRADO", fechaRetiro: "2026-11-18" } }).estado, "por_aprobar");
});

test("sin dato de GEMA o con un retiro viejo, espera y avisa", () => {
  assert.match(evaluarHito(HITO, INGRESO, "2026-11-20", { ...ok, referido: null }).motivo ?? "", /GEMA todavía/);
  const viejo = evaluarHito(HITO, INGRESO, "2026-11-20", { ...ok, referido: { estado: "RETIRADO", fechaRetiro: "2025-03-01" } });
  assert.equal(viejo.estado, "pendiente");
  assert.match(viejo.motivo ?? "", /revise el dato/);
});

test("padrino sin contrato vigente: no causado, sin cancelar los siguientes", () => {
  const r = evaluarHito(HITO, INGRESO, "2026-11-20", { ...ok, padrino: { tipo: "conductor", estado: "RETIRADO", fechaRetiro: "2026-11-01" } });
  assert.equal(r.estado, "no_causado");
  assert.equal(r.estado === "no_causado" && r.cancelaSiguientes, false);
  assert.match(r.motivo ?? "", /Padrino sin contrato/);
  // Se retiró después de la fecha: a la causación estaba vigente.
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", { ...ok, padrino: { tipo: "conductor", estado: "RETIRADO", fechaRetiro: "2026-11-16" } }).estado, "por_aprobar");
});

test("empleado padrino: vigente y autorizado", () => {
  const emp = (status: string, autorizado: boolean) => ({ ...ok, padrino: { tipo: "empleado" as const, status, fechaRetiro: null, autorizado } });
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", emp("activo", true)).estado, "por_aprobar");
  assert.match(evaluarHito(HITO, INGRESO, "2026-11-20", emp("activo", false)).motivo ?? "", /autorizado/);
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", emp("retirado", true)).estado, "no_causado");
});

test("estado del referido según sus hitos", () => {
  assert.equal(estadoReferidoPorHitos([{ estado: "pagado" }, { estado: "pendiente" }]), "en_seguimiento");
  assert.equal(estadoReferidoPorHitos([{ estado: "pagado" }, { estado: "aprobado" }]), "en_seguimiento");
  assert.equal(estadoReferidoPorHitos([{ estado: "pagado" }, { estado: "pagado" }]), "completado");
  assert.equal(estadoReferidoPorHitos([{ estado: "pagado" }, { estado: "no_causado" }, { estado: "cancelado" }]), "terminado");
});

test("aprobación: segregación, desempeño y observación", () => {
  const base = { estado: "por_aprobar", aprobar: true, observacion: "", requiereDesempeno: false, desempenoSatisfactorio: false, aprobadorId: "u2", registradoPorId: "u1" };
  assert.equal(validarAprobacionHito(base), null);
  assert.match(validarAprobacionHito({ ...base, aprobadorId: "u1" }) ?? "", /otra persona/);
  assert.match(validarAprobacionHito({ ...base, requiereDesempeno: true }) ?? "", /desempeño/);
  assert.equal(validarAprobacionHito({ ...base, requiereDesempeno: true, desempenoSatisfactorio: true }), null);
  assert.match(validarAprobacionHito({ ...base, aprobar: false }) ?? "", /por qué/);
  assert.match(validarAprobacionHito({ ...base, estado: "pendiente" }) ?? "", /no está por aprobar/);
});

test("pago: solo aprobados, fecha no futura y referencia", () => {
  assert.equal(validarPago("aprobado", "2026-11-30", "Nómina 2026-11-2", "2026-12-01"), null);
  assert.match(validarPago("por_aprobar", "2026-11-30", "x", "2026-12-01") ?? "", /aprobados/);
  assert.match(validarPago("aprobado", "2026-12-05", "x", "2026-12-01") ?? "", /futura/);
  assert.match(validarPago("aprobado", "2026-11-30", " ", "2026-12-01") ?? "", /referencia/);
});
