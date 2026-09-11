/**
 * Pruebas del tablero (fase 6).
 *
 *   npm run test:incapacidades
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { agregarTablero, porcentaje, type FilaTablero } from "./tablero-reglas";

const fila = (p: Partial<FilaTablero>): FilaTablero => ({
  estado: "recibido", entidad_catalogo_id: "e1", entidad_nombre: "EPS SURA", entidad_clase: "EPS", pagador_recibido: "EPS SURA", cobrable: true,
  valor_reclamado: null, radicacion_estado: null, radicacion_valor: null, abonos_aplicados: 0, ajustes_saldo: 0, saldo_operativo: null,
  dias_incapacidad: 3, dias_entidad: null, dias_entidad_ajustados: null,
  ...p,
});

test("el tablero agrega reclamado, radicado, recaudado y saldo por entidad y en total", () => {
  const { total, porEntidad } = agregarTablero([
    fila({ estado: "recibido" }),
    fila({ estado: "liquidado", valor_reclamado: 100_000, dias_entidad: 1, saldo_operativo: 100_000 }),
    fila({ estado: "radicado", valor_reclamado: 200_000, radicacion_estado: "radicada", radicacion_valor: 200_000, saldo_operativo: 200_000, dias_entidad: 2 }),
    fila({ estado: "con_recaudo", valor_reclamado: 300_000, radicacion_estado: "radicada", radicacion_valor: 300_000, abonos_aplicados: 120_000, ajustes_saldo: 30_000, saldo_operativo: 150_000, dias_entidad: 3 }),
    fila({ estado: "cerrado", valor_reclamado: 50_000, radicacion_estado: "radicada", radicacion_valor: 50_000, abonos_aplicados: 50_000, saldo_operativo: 0 }),
    fila({ estado: "liquidado", entidad_catalogo_id: "e2", entidad_nombre: "ARL BOLIVAR", entidad_clase: "ARL", valor_reclamado: 900_000, cobrable: true, saldo_operativo: 900_000, dias_entidad_ajustados: 5, dias_entidad: 4 }),
    fila({ estado: "recibido", cobrable: false }),
  ]);
  assert.equal(total.expedientes, 7);
  assert.deepEqual(total.porEstado, { recibido: 2, liquidado: 2, radicado: 1, con_recaudo: 1, cerrado: 1 });
  assert.equal(total.cobrables, 6);
  assert.equal(total.noCobrables, 1);
  assert.equal(total.reclamado, 100_000 + 200_000 + 300_000 + 50_000 + 900_000);
  assert.equal(total.radicado, 200_000 + 300_000 + 50_000);
  assert.equal(total.recaudado, 170_000);
  assert.equal(total.ajustes, 30_000);
  // El saldo solo cuenta lo que está en cobro (radicado, con recaudo, conciliado): ni lo liquidado sin radicar ni lo cerrado.
  assert.equal(total.saldo, 200_000 + 150_000);
  assert.equal(total.sinRadicar, 1_550_000 - 550_000);
  assert.equal(total.dias, 21);
  assert.equal(total.diasEntidad, 1 + 2 + 3 + 5, "los días a cargo ajustados mandan sobre los calculados");
  // ARL primero: más reclamado.
  assert.deepEqual(porEntidad.map((g) => g.entidad), ["ARL BOLIVAR", "EPS SURA"]);
  assert.equal(porEntidad[0].reclamado, 900_000);
  assert.equal(porEntidad[1].expedientes, 6);
  assert.equal(porEntidad[1].saldo, 350_000);
});

test("una entidad sin homologar se agrupa por el pagador recibido", () => {
  const { porEntidad } = agregarTablero([fila({ entidad_catalogo_id: null, entidad_nombre: null, pagador_recibido: "SALUD TOTAL S.A." })]);
  assert.equal(porEntidad[0].entidad, "SALUD TOTAL S.A.");
  assert.equal(porEntidad[0].entidadId, null);
});

test("porcentaje acotado entre 0 y 100", () => {
  assert.equal(porcentaje(50, 200), 25);
  assert.equal(porcentaje(300, 200), 100);
  assert.equal(porcentaje(-5, 200), 0);
  assert.equal(porcentaje(10, 0), 0);
});
