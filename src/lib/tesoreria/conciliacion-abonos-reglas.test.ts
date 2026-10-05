import { test } from "node:test";
import assert from "node:assert/strict";
import { conciliar, resumirPor, totales, type AbonoRaw, type RecaudoRaw } from "./conciliacion-abonos-reglas";

const abono = (p: Partial<AbonoRaw> & { id_abono: number; id_viaje: number; valor_abono: number }): AbonoRaw => ({
  fecha_abono: "2026-09-01 10:00:00",
  concepto_abono: "INGRESAR",
  estado: 1,
  estado_texto: "GESTIONADO",
  fecha_viaje: "2026-09-01",
  num_viaje: 1,
  codigo_vehiculo: "500",
  placa_vehiculo: "WGD221",
  usuario_generacion: "CAJERO UNO",
  ...p,
});
const recaudo = (numero: number, neto: number, fecha = "2026-09-01T12:00:00"): RecaudoRaw => ({
  numero, neto, bruto: neto, fecha_recaudo: fecha, cajero: "CAJA", conductor_nombre: "PEDRO", cedula_conductor: "123", ruta_reprogramada: "A - 16 MIRAMAR",
});
const AHORA = "2026-09-03T10:00:00";

test("clasifica cuadrado, recaudo mayor, recaudo menor, pendiente y anulado", () => {
  const filas = conciliar(
    [
      abono({ id_abono: 1, id_viaje: 10, valor_abono: 214600 }),
      abono({ id_abono: 2, id_viaje: 11, valor_abono: 116400, concepto_abono: "AUTORIZADO" }),
      abono({ id_abono: 3, id_viaje: 12, valor_abono: 365000, concepto_abono: "REVISIÓN CÁMARA" }),
      abono({ id_abono: 4, id_viaje: 13, valor_abono: 219000 }),
      abono({ id_abono: 5, id_viaje: 14, valor_abono: 50000, estado: 2, estado_texto: "ANULADO" }),
      abono({ id_abono: 6, id_viaje: 15, valor_abono: 241000 }),
    ],
    [recaudo(10, 214600), recaudo(11, 266400), recaudo(12, 320000), recaudo(14, 90000), recaudo(15, 240500)],
    [],
    AHORA
  );
  const por = Object.fromEntries(filas.map((f) => [f.idViaje, f]));
  assert.equal(por[10].estado, "cuadrado");
  assert.equal(por[11].estado, "recaudo_mayor");
  assert.equal(por[11].diferencia, 150000);
  assert.equal(por[12].estado, "recaudo_menor");
  assert.equal(por[12].diferencia, -45000);
  assert.equal(por[13].estado, "pendiente");
  assert.equal(por[13].horas, 48);
  assert.equal(por[14].estado, "anulado");
  assert.equal(por[14].diferencia, null);
  // 500 pesos de diferencia es redondeo de caja: cuadra.
  assert.equal(por[15].estado, "cuadrado");
});

test("suma varios abonos del mismo viaje e ignora los anulados", () => {
  const [f] = conciliar(
    [
      abono({ id_abono: 1, id_viaje: 20, valor_abono: 100000, fecha_abono: "2026-09-01 09:00:00" }),
      abono({ id_abono: 2, id_viaje: 20, valor_abono: 50000, fecha_abono: "2026-09-01 11:00:00", concepto_abono: "AUTORIZADO" }),
      abono({ id_abono: 3, id_viaje: 20, valor_abono: 999999, estado: 2, estado_texto: "ANULADO" }),
    ],
    [recaudo(20, 150000, "2026-09-01T12:00:00")],
    [],
    AHORA
  );
  assert.equal(f.abonado, 150000);
  assert.equal(f.estado, "cuadrado");
  assert.equal(f.concepto, "INGRESAR");
  assert.equal(f.horas, 3);
});

test("un recaudo sin fecha de recaudo cuenta como pendiente", () => {
  const [f] = conciliar(
    [abono({ id_abono: 1, id_viaje: 30, valor_abono: 80000 })],
    [{ ...recaudo(30, 0), fecha_recaudo: null }],
    [{ numero: 30, conductor: "ANA", conductor_ced: "9", ruta_reprogramada: "D - 6", estado: "PENDIENTE", novedad: "NORMAL" }],
    AHORA
  );
  assert.equal(f.estado, "pendiente");
  assert.equal(f.estadoDespacho, "PENDIENTE");
});

test("totales y resumen por concepto excluyen lo anulado", () => {
  const filas = conciliar(
    [
      abono({ id_abono: 1, id_viaje: 10, valor_abono: 100000 }),
      abono({ id_abono: 2, id_viaje: 11, valor_abono: 50000, concepto_abono: "AUTORIZADO" }),
      abono({ id_abono: 3, id_viaje: 12, valor_abono: 70000, estado: 2, estado_texto: "ANULADO" }),
    ],
    [recaudo(10, 100000), recaudo(11, 80000)],
    [],
    AHORA
  );
  const t = totales(filas);
  assert.equal(t.abonado, 150000);
  assert.equal(t.recaudado, 180000);
  assert.equal(t.diferenciaNeta, 30000);
  assert.equal(t.porEstado.anulado.viajes, 1);
  const r = resumirPor(filas, (f) => f.concepto);
  assert.deepEqual(r.map((x) => x.concepto), ["INGRESAR", "AUTORIZADO"]);
});

test("lee el estado de GEMA: POR GESTIONAR cuenta como vigente y se marca", () => {
  const [f] = conciliar(
    [
      abono({ id_abono: 1, id_viaje: 40, valor_abono: 100000, fecha_abono: "2026-09-01 09:00:00" }),
      abono({ id_abono: 2, id_viaje: 40, valor_abono: 60000, fecha_abono: "2026-09-01 10:00:00", concepto_abono: "AUTORIZADO", estado: 0, estado_texto: "POR GESTIONAR" }),
      abono({ id_abono: 3, id_viaje: 40, valor_abono: 5000, fecha_abono: "2026-09-01 11:00:00", concepto_abono: "ACCIDENTE", estado: 2, estado_texto: "ANULADO" }),
    ],
    [recaudo(40, 160000)],
    [],
    AHORA
  );
  assert.equal(f.abonado, 160000);
  assert.equal(f.porGestionar, 1);
  assert.deepEqual(f.conceptos, ["INGRESAR", "AUTORIZADO", "ACCIDENTE"]);
  assert.deepEqual(f.estadosGema, ["GESTIONADO", "POR GESTIONAR", "ANULADO"]);
  assert.deepEqual(f.abonos.map((a) => a.estadoTexto), ["GESTIONADO", "POR GESTIONAR", "ANULADO"]);
  const t = totales([f]);
  assert.deepEqual(t.porGestionar, { viajes: 1, abonado: 60000 });
});
