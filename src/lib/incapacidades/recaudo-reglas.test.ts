/**
 * Pruebas de recaudos, ajustes y saldo (fase 5).
 *
 *   npm run test:incapacidades
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularSaldo,
  estadoExpedienteSegunSaldo,
  validarAjuste,
  validarAplicacion,
  validarCierre,
} from "./recaudo-reglas";

test("saldo operativo = reclamado − abonos − ajustes, con sus estados", () => {
  assert.deepEqual(calcularSaldo({ valorReclamado: null, abonos: 0, ajustes: 0 }), { saldo: 0, estado: "sin_base", dentroTolerancia: false });
  assert.deepEqual(calcularSaldo({ valorReclamado: 130_000, abonos: 0, ajustes: 0 }), { saldo: 130_000, estado: "sin_recaudo", dentroTolerancia: false });
  assert.deepEqual(calcularSaldo({ valorReclamado: 130_000, abonos: 100, ajustes: 0 }), { saldo: 129_900, estado: "parcial", dentroTolerancia: false });
  assert.deepEqual(calcularSaldo({ valorReclamado: 130_000, abonos: 130_000, ajustes: 0 }), { saldo: 0, estado: "completo", dentroTolerancia: true });
  assert.deepEqual(calcularSaldo({ valorReclamado: 130_000, abonos: 130_000.01, ajustes: 0 }), { saldo: -0.01, estado: "sobrepago", dentroTolerancia: false });
  assert.deepEqual(calcularSaldo({ valorReclamado: 130_000, abonos: 0, ajustes: 30_000 }), { saldo: 100_000, estado: "diferencia", dentroTolerancia: false });
  // Un ajuste que cubre todo el saldo también concilia.
  assert.equal(calcularSaldo({ valorReclamado: 130_000, abonos: 100_000, ajustes: 30_000 }).estado, "completo");
});

test("un abono parcial no cierra: X = T − 0,01 sigue NO PAGADO sin tolerancia (13.2)", () => {
  const s = calcularSaldo({ valorReclamado: 130_000, abonos: 129_999.99, ajustes: 0 }, 0);
  assert.equal(s.estado, "parcial");
  assert.equal(s.dentroTolerancia, false);
  assert.throws(() => validarCierre(s, null), /exige una excepción/);
  assert.throws(() => validarCierre(s, "corto"), /exige una excepción/);
  assert.deepEqual(validarCierre(s, "Diferencia de un centavo aceptada por Contabilidad"), { porExcepcion: true });
});

test("la tolerancia aprobada convierte una diferencia mínima en conciliado", () => {
  const s = calcularSaldo({ valorReclamado: 130_000, abonos: 129_999.99, ajustes: 0 }, 1);
  assert.equal(s.estado, "completo");
  assert.deepEqual(validarCierre(s, null), { porExcepcion: false });
  assert.throws(() => calcularSaldo({ valorReclamado: 1, abonos: 0, ajustes: 0 }, -1), /tolerancia/);
  // Cero contra cero también es LO DEBIDO.
  assert.equal(calcularSaldo({ valorReclamado: 0, abonos: 0, ajustes: 0 }).estado, "completo");
});

test("el estado del expediente sigue al saldo solo desde radicado en adelante", () => {
  const c = { valorReclamado: 130_000, abonos: 50_000, ajustes: 0 };
  assert.equal(estadoExpedienteSegunSaldo("radicado", calcularSaldo(c), c), "con_recaudo");
  const total = { valorReclamado: 130_000, abonos: 130_000, ajustes: 0 };
  assert.equal(estadoExpedienteSegunSaldo("con_recaudo", calcularSaldo(total), total), "conciliado");
  const nada = { valorReclamado: 130_000, abonos: 0, ajustes: 0 };
  assert.equal(estadoExpedienteSegunSaldo("con_recaudo", calcularSaldo(nada), nada), "radicado", "anular todas las aplicaciones devuelve a radicado");
  assert.equal(estadoExpedienteSegunSaldo("liquidado", calcularSaldo(c), c), null, "antes de radicar no se toca");
  assert.equal(estadoExpedienteSegunSaldo("cerrado", calcularSaldo(c), c), null);
  // Reclamado cero y sin movimientos: no hay nada que conciliar todavía.
  const cero = { valorReclamado: 0, abonos: 0, ajustes: 0 };
  assert.equal(estadoExpedienteSegunSaldo("radicado", calcularSaldo(cero), cero), "radicado");
});

test("Σ aplicaciones ≤ recaudo; solo a expedientes radicados ante la misma entidad", () => {
  const r = { valor: 200_000, aplicado: 150_000, anulado: false, entidad_catalogo_id: "e1" };
  const e = { estado: "radicado", entidad_catalogo_id: "e1", radicacion_estado: "radicada", valor_reclamado: 130_000, saldo: 130_000 };
  assert.doesNotThrow(() => validarAplicacion(r, e, 50_000));
  assert.throws(() => validarAplicacion(r, e, 50_000.01), /sin aplicar/);
  assert.throws(() => validarAplicacion(r, e, 0), /mayor que cero/);
  assert.throws(() => validarAplicacion({ ...r, anulado: true }, e, 10), /anulado/);
  assert.throws(() => validarAplicacion(r, { ...e, entidad_catalogo_id: "e2" }, 10), /otra entidad/);
  assert.throws(() => validarAplicacion(r, { ...e, estado: "liquidado", radicacion_estado: null }, 10), /radicados/);
  assert.throws(() => validarAplicacion(r, { ...e, radicacion_estado: "solicitada" }, 10), /radicados/);
  // El sobrepago de un expediente se permite y queda visible: no se bloquea aquí.
  assert.doesNotThrow(() => validarAplicacion(r, { ...e, saldo: 10 }, 50_000));
  assert.doesNotThrow(() => validarAplicacion(r, { ...e, estado: "con_recaudo" }, 10));
});

test("un ajuste exige tipo válido, valor distinto de cero y motivo", () => {
  assert.doesNotThrow(() => validarAjuste({ tipo: "glosa_aceptada", valor: 5_000, motivo: "Glosa por historia clínica incompleta" }));
  assert.doesNotThrow(() => validarAjuste({ tipo: "correccion", valor: -5_000, motivo: "Se reclamó de menos" }));
  assert.throws(() => validarAjuste({ tipo: "x", valor: 5, motivo: "motivo largo" }), /Tipo/);
  assert.throws(() => validarAjuste({ tipo: "glosa_aceptada", valor: 0, motivo: "motivo largo" }), /distinto de cero/);
  assert.throws(() => validarAjuste({ tipo: "glosa_aceptada", valor: 5, motivo: "ab" }), /motivo/);
});
