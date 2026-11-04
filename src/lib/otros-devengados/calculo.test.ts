import { test } from "node:test";
import assert from "node:assert/strict";
import { CONCEPTOS_DEVENGO_DEFECTO, cruzarQuincena, nominaCerrada, quincenaDeFecha, quincenaGemaDePeriodo, siguienteCorte } from "./calculo";

test("los ajustes 006 y 013 no entran en el devengo del cruce", () => {
  assert.deepEqual([...CONCEPTOS_DEVENGO_DEFECTO], ["003", "010", "202", "208", "209"]);
});

test("saldo positivo: producción cubre la nómina y queda por entregar", () => {
  const r = cruzarQuincena({ produccion: 1_500_000, conceptos: { "003": 800_000, "010": 110_000 }, entregado: 300_000 });
  assert.equal(r.nominaDevengo, 910_000);
  assert.equal(r.generado, 590_000);
  assert.equal(r.otrosDevengados, 590_000);
  assert.equal(r.disponible, 590_000);
  assert.equal(r.saldo, 290_000);
  assert.equal(r.porEntregar, 290_000);
  assert.equal(r.anticipo, 0);
});

test("entregado de más: queda como anticipo de salario", () => {
  const r = cruzarQuincena({ produccion: 1_000_000, conceptos: { "003": 800_000 }, entregado: 350_000 });
  assert.equal(r.otrosDevengados, 200_000);
  assert.equal(r.saldo, -150_000);
  assert.equal(r.porEntregar, 0);
  assert.equal(r.anticipo, 150_000);
});

test("producción menor que la nómina: sin otros devengados y el déficit es anticipo del corte", () => {
  const r = cruzarQuincena({ produccion: 500_000, conceptos: { "003": 800_000 }, entregado: 0 });
  assert.equal(r.generado, -300_000);
  assert.equal(r.otrosDevengados, 0);
  assert.equal(r.porEntregar, 0);
  assert.equal(r.anticipo, 300_000);
});

test("descuentos restan y la devolución de viaje suma (planilla 01043)", () => {
  // 433.978 − 80.000 (pérdida de viaje) = 353.978
  const a = cruzarQuincena({ produccion: 1_433_978, conceptos: { "003": 1_000_000 }, entregado: 0, descuentos: 80_000 });
  assert.equal(a.disponible, 353_978);
  assert.equal(a.porEntregar, 353_978);
  // 298.549 − 40.000 de turno + 160.000 de devolución = 418.549
  const b = cruzarQuincena({ produccion: 1_298_549, conceptos: { "003": 1_000_000 }, entregado: 0, descuentos: 40_000, devoluciones: 160_000 });
  assert.equal(b.disponible, 418_549);
});

test("descuento mayor que los otros devengados: queda pendiente, no es anticipo", () => {
  const r = cruzarQuincena({ produccion: 1_050_000, conceptos: { "003": 1_000_000 }, entregado: 0, descuentos: 80_000 });
  assert.equal(r.disponible, 0);
  assert.equal(r.descuentoPendiente, 30_000);
  assert.equal(r.anticipo, 0);
});

test("día 31 entra en la segunda quincena aunque MGX cierre el 30", () => {
  assert.deepEqual(quincenaGemaDePeriodo("2026-10-16", 2), { periodo: "2026-10", quincena: 2, ini: "2026-10-16", fin: "2026-10-31" });
  assert.deepEqual(quincenaGemaDePeriodo("2026-10-01", 1), { periodo: "2026-10", quincena: 1, ini: "2026-10-01", fin: "2026-10-15" });
  assert.equal(quincenaGemaDePeriodo("2027-02-16", 2).fin, "2027-02-28");
  assert.equal(quincenaDeFecha("2026-10-31").quincena, 2);
  assert.equal(quincenaDeFecha("2026-10-15").quincena, 1);
});

test("nómina cerrada exige est_per 2 y líneas", () => {
  assert.equal(nominaCerrada(2, 160), true);
  assert.equal(nominaCerrada(1, 0), false);
  assert.equal(nominaCerrada(2, 0), false);
  assert.equal(nominaCerrada(1, 10), false);
});

test("saldo negativo: descuento sin cubrir y entrega de más; el ajuste lo lleva a cero", () => {
  // Otros devengados 50.000, descuentos 80.000 → debe 30.000.
  const a = cruzarQuincena({ produccion: 1_050_000, conceptos: { "003": 1_000_000 }, entregado: 0, descuentos: 80_000 });
  assert.equal(a.saldoNegativo, 30_000);
  // Con el ajuste a cero (suma 30.000) queda en cero, sin pendiente ni anticipo.
  const b = cruzarQuincena({ produccion: 1_050_000, conceptos: { "003": 1_000_000 }, entregado: 0, descuentos: 80_000, devoluciones: 30_000 });
  assert.equal(b.saldoNegativo, 0);
  assert.equal(b.descuentoPendiente, 0);
  assert.equal(b.porEntregar, 0);
  // Entregó 200.000 y luego llegó un descuento de 50.000 → debe 50.000.
  const c = cruzarQuincena({ produccion: 1_200_000, conceptos: { "003": 1_000_000 }, entregado: 200_000, descuentos: 50_000 });
  assert.equal(c.saldoNegativo, 50_000);
  assert.equal(c.anticipo, 50_000);
  const d = cruzarQuincena({ produccion: 1_200_000, conceptos: { "003": 1_000_000 }, entregado: 200_000, descuentos: 50_000, devoluciones: 50_000 });
  assert.equal(d.saldoNegativo, 0);
  assert.equal(d.anticipo, 0);
});

test("el déficit de producción no es saldo negativo trasladable", () => {
  const r = cruzarQuincena({ produccion: 500_000, conceptos: { "003": 800_000 }, entregado: 0 });
  assert.equal(r.anticipo, 300_000);
  assert.equal(r.saldoNegativo, 0);
});

test("corte siguiente", () => {
  assert.deepEqual(siguienteCorte({ periodo: "2026-10", quincena: 1 }), { periodo: "2026-10", quincena: 2, ini: "2026-10-16", fin: "2026-10-31" });
  assert.equal(siguienteCorte({ periodo: "2026-12", quincena: 2 }).periodo, "2027-01");
});
