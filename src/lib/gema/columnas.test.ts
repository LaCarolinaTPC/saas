import { test } from "node:test";
import assert from "node:assert/strict";
import { columnaDescuentosOtros, columnaObservacionesDescuento, limpiaObservacion } from "./sync";

test("«descuentos otros» se reconoce con cualquier forma del nombre", () => {
  for (const k of ["descuentosOtros", "DescuentosOtros", "descuentos_otros", "DESCUENTOS OTROS", "otrosDescuentos", "descuento_otro", "DescuentoOtro", "pagoObligaciones"]) {
    assert.equal(columnaDescuentosOtros({ bruto: 1, [k]: 5 }), k);
  }
  // valorDescuentos es combustible + póliza: nunca debe confundirse.
  assert.equal(columnaDescuentosOtros({ valorDescuentos: 1, descuento: 2 }), null);
  assert.equal(columnaDescuentosOtros(undefined), null);
});

test("«observaciones descuento» se reconoce y no se cruza con «descuentos otros»", () => {
  for (const k of ["observacionesDescuento", "ObservacionesDescuento", "observaciones_descuento", "OBSERVACIÓN DESCUENTO", "observacionesDescuentos", "obsDescuento"]) {
    assert.equal(columnaObservacionesDescuento({ bruto: 1, [k]: "x" }), k);
  }
  // La fila real trae las dos columnas nuevas: cada una debe encontrar la suya.
  const fila = { bruto: 1, descuentosOtros: 83300, observacionesDescuento: "PAG FACT FE3789-501 GASTOS" };
  assert.equal(columnaDescuentosOtros(fila), "descuentosOtros");
  assert.equal(columnaObservacionesDescuento(fila), "observacionesDescuento");
  assert.equal(columnaObservacionesDescuento({ descuentosOtros: 1, observaciones: "otra cosa" }), null);
  assert.equal(columnaObservacionesDescuento(undefined), null);
});

test("«N/A» de GEMA se guarda como sin observación", () => {
  for (const v of ["N/A", " n/a ", "NA", "", null, undefined]) assert.equal(limpiaObservacion(v), null);
  assert.equal(limpiaObservacion(" DEV DESPACHO "), "DEV DESPACHO");
});
