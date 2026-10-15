import { test } from "node:test";
import assert from "node:assert/strict";
import { alertasReferidos, costoPorContratado, FUENTE_PADRINO, permanenciaPorFuente, resumenTablero } from "./tablero";
import { filaIncentivo } from "./hitos";

test("fila de incentivos con el formato de la carga del Excel", () => {
  assert.deepEqual(
    filaIncentivo({ fechaPago: "2026-11-28", valor: 150000, esquema: "A", numero: 1, cedulaPadrino: "200", nombrePadrino: "PADRINO", cedulaReferido: "100" }),
    { cedula: "200", nombre: "PADRINO", mes_entrega: "NOVIEMBRE 2026", periodo: "2026-11-01", valor: 150000, concepto: "PLAN PADRINO A1 - REFERIDO 100", source_file: "gestivo-plan-padrino" }
  );
});

test("tablero: estados, próximos 30 días, causado/pagado por mes y top padrinos", () => {
  const referidos = [
    { estado: "en_seguimiento", cedula_padrino: "p1", nombre_padrino: "UNO" },
    { estado: "completado", cedula_padrino: "p1", nombre_padrino: "UNO" },
    { estado: "en_validacion", cedula_padrino: "p2", nombre_padrino: "DOS" },
  ];
  const h = (estado: string, valor: number, fecha_causacion: string, fecha_pago: string | null = null, cedula_padrino = "p1") => ({ estado, valor, fecha_causacion, fecha_pago, cedula_padrino, nombre_padrino: null });
  const hitos = [
    h("pagado", 150000, "2026-10-20", "2026-10-30"),
    h("aprobado", 200000, "2026-11-01"),
    h("por_aprobar", 100000, "2026-11-10"),
    h("pendiente", 350000, "2026-12-01"),
    h("pendiente", 100000, "2027-02-01"),
    h("no_causado", 100000, "2026-11-05"),
  ];
  const r = resumenTablero(referidos, hitos, "2026-11-15", 3);
  assert.deepEqual(r.porEstado, { en_seguimiento: 1, completado: 1, en_validacion: 1 });
  assert.equal(r.contratados, 2);
  assert.deepEqual(r.proximos, { cantidad: 1, valor: 350000 });
  assert.deepEqual(r.porAprobar, { cantidad: 1, valor: 100000 });
  assert.deepEqual(r.porPagar, { cantidad: 1, valor: 200000 });
  assert.deepEqual(r.mensual, [
    { mes: "2026-09", causado: 0, pagado: 0 },
    { mes: "2026-10", causado: 150000, pagado: 150000 },
    { mes: "2026-11", causado: 300000, pagado: 0 },
  ]);
  assert.equal(r.topPadrinos[0].cedula, "p1");
  assert.equal(r.topPadrinos[0].contratados, 2);
  assert.equal(r.topPadrinos[0].porPagar, 300000);
});

test("permanencia: solo cuentan en la base quienes ya cumplieron el plazo", () => {
  const hoy = "2026-12-31";
  const filas = permanenciaPorFuente(
    [
      { cedula: "1", fuente: FUENTE_PADRINO, ingreso: "2026-08-01", retiro: null },
      { cedula: "2", fuente: FUENTE_PADRINO, ingreso: "2026-08-01", retiro: "2026-09-15" },
      { cedula: "3", fuente: "WhatsApp", ingreso: "2026-08-01", retiro: "2026-08-20" },
      { cedula: "4", fuente: "WhatsApp", ingreso: "2026-12-15", retiro: null },
    ],
    hoy
  );
  assert.deepEqual(filas.map((f) => f.fuente), [FUENTE_PADRINO, "WhatsApp", "Otras fuentes (todas)"]);
  const pp = filas[0].tasas;
  assert.deepEqual(pp[30], { base: 2, permanecen: 2, pct: 100 });
  assert.deepEqual(pp[60], { base: 2, permanecen: 1, pct: 50 });
  const wa = filas[1].tasas;
  assert.deepEqual(wa[30], { base: 1, permanecen: 0, pct: 0 });
  assert.equal(filas[1].contratados, 2);
});

test("costo por contratado", () => {
  assert.equal(costoPorContratado(700000, 2), 350000);
  assert.equal(costoPorContratado(100, 0), null);
});

test("alertas: faltas o accidentes con hito por venir, con racha", () => {
  const base = { nombre: "X", cedula: "1", fechaIngreso: "2026-10-01" };
  const a = alertasReferidos([
    { ...base, referidoId: "a", proximoHito: { numero: 2, fecha: "2026-12-01", valor: 200000 }, faltas: ["2026-11-03", "2026-11-04", "2026-10-10"], accidentes: [] },
    { ...base, referidoId: "b", proximoHito: { numero: 1, fecha: "2026-11-01", valor: 150000 }, faltas: [], accidentes: ["2026-10-20"] },
    { ...base, referidoId: "c", proximoHito: null, faltas: ["2026-11-03"], accidentes: [] },
    { ...base, referidoId: "d", proximoHito: { numero: 1, fecha: "2026-11-01", valor: 1 }, faltas: [], accidentes: [] },
  ]);
  assert.deepEqual(a.map((x) => x.referidoId), ["b", "a"]);
  assert.equal(a[1].racha, 2);
  assert.match(a[1].motivos[0], /3 falta\(s\).*04\/11\/2026, 2 días seguidos/);
  assert.match(a[0].motivos[0], /1 accidente/);
});
