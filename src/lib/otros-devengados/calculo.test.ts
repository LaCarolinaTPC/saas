import { test } from "node:test";
import assert from "node:assert/strict";
import { cruzarQuincena, nominaCerrada, quincenaGemaDePeriodo } from "./calculo";

test("saldo positivo: producción cubre la nómina y queda por entregar", () => {
  const r = cruzarQuincena({ produccion: 1_500_000, conceptos: { "003": 800_000, "010": 110_000 }, entregado: 300_000 });
  assert.equal(r.nominaDevengo, 910_000);
  assert.equal(r.generado, 590_000);
  assert.equal(r.otrosDevengados, 590_000);
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
  assert.equal(r.saldo, -300_000);
  assert.equal(r.porEntregar, 0);
  assert.equal(r.anticipo, 300_000);
});

test("día 31 entra en la segunda quincena aunque MGX cierre el 30", () => {
  assert.deepEqual(quincenaGemaDePeriodo("2026-10-16", 2), { periodo: "2026-10", quincena: 2, ini: "2026-10-16", fin: "2026-10-31" });
  assert.deepEqual(quincenaGemaDePeriodo("2026-10-01", 1), { periodo: "2026-10", quincena: 1, ini: "2026-10-01", fin: "2026-10-15" });
  assert.equal(quincenaGemaDePeriodo("2027-02-16", 2).fin, "2027-02-28");
});

test("nómina cerrada exige est_per 2 y líneas", () => {
  assert.equal(nominaCerrada(2, 160), true);
  assert.equal(nominaCerrada(1, 0), false);
  assert.equal(nominaCerrada(2, 0), false);
  assert.equal(nominaCerrada(1, 10), false);
});
