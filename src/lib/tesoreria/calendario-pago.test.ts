import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGLAS_DEFECTO, domingoDePascua, festivosColombia, fechaPagoDe, periodoDe, periodoAnterior,
  ultimoPeriodoCerrado, pagosEntre, estadoPago, diaIso, type ReglaPago,
} from "./calendario-pago";

const SEM = REGLAS_DEFECTO.SEMANAL;
const QUI = REGLAS_DEFECTO.DECADA;

test("festivos de Colombia 2026 coinciden con el calendario oficial", () => {
  assert.equal(domingoDePascua(2026), "2026-04-05");
  const oficial = [
    "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01",
    "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07",
    "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
  ];
  assert.deepEqual([...festivosColombia(2026)].sort(), oficial);
});

test("festivos de Colombia 2027 coinciden con el calendario oficial", () => {
  assert.equal(domingoDePascua(2027), "2027-03-28");
  const oficial = [
    "2027-01-01", "2027-01-11", "2027-03-22", "2027-03-25", "2027-03-26", "2027-05-01",
    "2027-05-10", "2027-05-31", "2027-06-07", "2027-07-05", "2027-07-20", "2027-08-07",
    "2027-08-16", "2027-10-18", "2027-11-01", "2027-11-15", "2027-12-08", "2027-12-25",
  ];
  assert.deepEqual([...festivosColombia(2027)].sort(), oficial);
});

test("semana de lunes a domingo", () => {
  const p = periodoDe(SEM, "2026-09-25"); // viernes
  assert.equal(p.desde, "2026-09-21");
  assert.equal(p.hasta, "2026-09-27");
  assert.equal(diaIso(p.desde), 1);
  assert.equal(p.etiqueta, "Semana del 21 al 27 sep 2026");
  assert.equal(periodoDe(SEM, "2026-09-27").hasta, "2026-09-27"); // el domingo cierra su propia semana
  assert.equal(periodoDe(SEM, "2026-09-28").desde, "2026-09-28");
  assert.equal(periodoDe(SEM, "2026-10-01").etiqueta, "Semana del 28 sep al 4 oct 2026");
  assert.equal(periodoDe(SEM, "2026-12-30").etiqueta, "Semana del 28 dic 2026 al 3 ene 2027");
});

test("quincena: 1-15 y 16-fin de mes, con bisiesto", () => {
  assert.deepEqual([periodoDe(QUI, "2026-09-15").desde, periodoDe(QUI, "2026-09-15").hasta], ["2026-09-01", "2026-09-15"]);
  assert.deepEqual([periodoDe(QUI, "2026-09-16").desde, periodoDe(QUI, "2026-09-16").hasta], ["2026-09-16", "2026-09-30"]);
  assert.equal(periodoDe(QUI, "2028-02-20").hasta, "2028-02-29");
  assert.equal(periodoDe(QUI, "2027-02-20").hasta, "2027-02-28");
  assert.equal(periodoAnterior(QUI, periodoDe(QUI, "2026-10-03")).desde, "2026-09-16");
  assert.equal(periodoDe(QUI, "2026-09-03").etiqueta, "Quincena del 1 al 15 sep 2026");
});

test("pago semanal: el martes siguiente al domingo de corte", () => {
  const pago = fechaPagoDe(SEM, periodoDe(SEM, "2026-09-25"));
  assert.equal(pago.fecha, "2026-09-29");
  assert.equal(pago.motivo, null);
});

test("pago se corre al miércoles si el lunes es festivo", () => {
  // Semana del 5 al 11 de oct 2026: el lunes 12 es festivo (Día de la Raza).
  const pago = fechaPagoDe(SEM, periodoDe(SEM, "2026-10-08"));
  assert.equal(pago.prevista, "2026-10-13");
  assert.equal(pago.fecha, "2026-10-14");
  assert.match(pago.motivo!, /lunes 12 oct 2026 es festivo/);
});

test("pago se corre al miércoles si el martes es festivo", () => {
  // Semana del 30 nov al 6 dic 2026: el martes 8 de diciembre (Inmaculada) es festivo.
  const pago = fechaPagoDe(SEM, periodoDe(SEM, "2026-12-03"));
  assert.equal(pago.prevista, "2026-12-08");
  assert.equal(pago.fecha, "2026-12-09");
  assert.match(pago.motivo!, /martes 8 dic 2026 es festivo/);
});

test("las reglas de festivo son configurables", () => {
  const sinCorrer: ReglaPago = { ...SEM, correrSiLunesFestivo: false, correrSiDiaPagoFestivo: false };
  assert.equal(fechaPagoDe(sinCorrer, periodoDe(sinCorrer, "2026-10-08")).fecha, "2026-10-13");
  const jueves: ReglaPago = { ...SEM, diaPago: 4, diaPagoAlterno: 5 };
  assert.equal(fechaPagoDe(jueves, periodoDe(jueves, "2026-09-25")).fecha, "2026-10-01");
});

test("pago quincenal: primer martes después del corte", () => {
  // 15 sep 2026 es martes: se paga el martes siguiente, 22.
  assert.equal(fechaPagoDe(QUI, periodoDe(QUI, "2026-09-10")).fecha, "2026-09-22");
  // 30 sep 2026 es miércoles: martes 6 oct.
  assert.equal(fechaPagoDe(QUI, periodoDe(QUI, "2026-09-20")).fecha, "2026-10-06");
  // 31 may 2027 es lunes festivo y es el corte: el lunes no está después del corte, se paga el martes 1 jun.
  assert.equal(fechaPagoDe(QUI, periodoDe(QUI, "2027-05-20")).fecha, "2027-06-01");
});

test("último periodo cerrado y pagos por fecha", () => {
  assert.equal(ultimoPeriodoCerrado(SEM, "2026-09-25").hasta, "2026-09-20");
  assert.equal(ultimoPeriodoCerrado(SEM, "2026-09-28").hasta, "2026-09-27");
  assert.equal(ultimoPeriodoCerrado(QUI, "2026-09-25").hasta, "2026-09-15");
  const pagos = pagosEntre(SEM, "2026-09-01", "2026-09-30").map((p) => p.pago.fecha);
  assert.deepEqual(pagos, ["2026-09-29", "2026-09-22", "2026-09-15", "2026-09-08", "2026-09-01"]);
  const q = pagosEntre(QUI, "2026-09-01", "2026-10-31").map((p) => `${p.periodo.clave}>${p.pago.fecha}`);
  assert.deepEqual(q, ["2026-10-Q1>2026-10-20", "2026-09-Q2>2026-10-06", "2026-09-Q1>2026-09-22", "2026-08-Q2>2026-09-01"]);
});

test("estado del pago", () => {
  const p = periodoDe(SEM, "2026-09-16");
  const pago = fechaPagoDe(SEM, p); // 2026-09-22
  assert.equal(estadoPago(p, pago, "2026-09-20"), "en_curso");
  assert.equal(estadoPago(p, pago, "2026-09-21"), "por_pagar");
  assert.equal(estadoPago(p, pago, "2026-09-22"), "pagadero_hoy");
  assert.equal(estadoPago(p, pago, "2026-09-25"), "fecha_cumplida");
});
