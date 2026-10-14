import { test } from "node:test";
import assert from "node:assert/strict";
import { causaDiferencia, conciliarConGema, type BusDiaGema, type BusDiaPetromil } from "./combustible-conciliacion";

const p = (fecha: string, bus: string, valor: number, compartidas: number[] = []): BusDiaPetromil => ({ fecha, bus, valor, compartidas });
const g = (fecha: string, bus: string, valor: number, filas = 1): BusDiaGema => ({ fecha, bus, valor, filas });

test("cuadra cuando cada bus-día coincide al peso", () => {
  const r = conciliarConGema(["2026-10-01"], [p("2026-10-01", "500", 237625), p("2026-10-01", "501", 206425.4)],
    [g("2026-10-01", "500", 237625), g("2026-10-01", "501", 206425)], new Set(["2026-10-01"]));
  assert.equal(r.estado, "cuadra");
  assert.equal(r.busesDia, 2);
  assert.equal(r.cuadran, 2);
  assert.deepEqual(r.diferencias, []);
});

test("un día que GEMA no ha liquidado no se compara", () => {
  const r = conciliarConGema(["2026-10-13"], [p("2026-10-13", "500", 196363)], [], new Set());
  assert.equal(r.estado, "sin_liquidar");
  assert.deepEqual(r.diasSinLiquidar, ["2026-10-13"]);
  assert.equal(r.petromil, 0);
});

test("compara solo los días liquidados y deja los demás aparte", () => {
  const r = conciliarConGema(["2026-10-12", "2026-10-13"],
    [p("2026-10-12", "500", 100), p("2026-10-13", "500", 200)], [g("2026-10-12", "500", 100)], new Set(["2026-10-12"]));
  assert.equal(r.estado, "cuadra");
  assert.deepEqual(r.diasComparados, ["2026-10-12"]);
  assert.deepEqual(r.diasSinLiquidar, ["2026-10-13"]);
  assert.equal(r.petromil, 100);
});

test("clasifica las causas vistas en la conciliación de 2026", () => {
  assert.equal(causaDiferencia(p("d", "881", 150409), g("d", "881", 300818, 2)), "duplicado_gema");
  assert.equal(causaDiferencia(p("d", "564", 359432, [179716]), g("d", "564", 179716)), "factura_compartida");
  assert.equal(causaDiferencia(p("d", "564", 179716, [179716]), undefined), "factura_compartida");
  assert.equal(causaDiferencia(p("d", "1037", 574977), undefined), "falta_en_gema");
  assert.equal(causaDiferencia(undefined, g("d", "903", 150000)), "sobra_en_gema");
  assert.equal(causaDiferencia(p("d", "501", 173377), g("d", "501", 63377)), "diferencia");
});

test("totaliza diferencias por causa y las ordena de mayor a menor", () => {
  const r = conciliarConGema(["2026-07-26"],
    [p("2026-07-26", "881", 150409), p("2026-07-26", "1037", 574977), p("2026-07-26", "500", 100)],
    [g("2026-07-26", "881", 300818, 2), g("2026-07-26", "500", 100), g("2026-07-26", "502", 0)],
    new Set(["2026-07-26"]));
  assert.equal(r.estado, "diferencias");
  assert.equal(r.busesDia, 3, "el bus con fila en GEMA en cero y sin tanqueo no cuenta");
  assert.equal(r.diferencia, 300918 - 725486);
  assert.deepEqual(r.porCausa, { falta_en_gema: { n: 1, valor: -574977 }, duplicado_gema: { n: 1, valor: 150409 } });
  assert.deepEqual(r.diferencias.map((x) => x.bus), ["1037", "881"]);
});

test("dos buses que se compensan el mismo día son un tanqueo cargado a otro bus", () => {
  const r = conciliarConGema(["2026-05-23"], [p("2026-05-23", "558", 218744), p("2026-05-23", "500", 100)],
    [g("2026-05-23", "975", 218744), g("2026-05-23", "500", 100)], new Set(["2026-05-23"]));
  assert.equal(r.diferencia, 0);
  assert.deepEqual(r.diferencias.map((x) => [x.bus, x.causa]).sort(), [["558", "otro_bus"], ["975", "otro_bus"]]);
  assert.deepEqual(r.porCausa, { otro_bus: { n: 2, valor: 0 } });
});
