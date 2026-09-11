/**
 * Pruebas del motor de incapacidades (Fase 1 del plan).
 *
 *   npm run test:incapacidades
 *
 * 1. Compatibilidad con el libro: 79 filas × 13 fórmulas = 1.027 aserciones.
 *    El oráculo es la transcripción LITERAL de cada fórmula del anexo B, con la
 *    semántica de Excel (vacío = 0, texto sin distinguir mayúsculas). El motor
 *    llega al mismo resultado por otro camino (reglas parametrizadas), así que
 *    la comparación no es tautológica.
 * 2. Los casos sintéticos de la sección 13.2 de la especificación que competen
 *    al motor (14 de 17; filtrado, reimportación y concurrencia son de fases
 *    posteriores).
 * 3. La regla operativa `gestivo-cobro-dias` decidida en la Fase 0.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGLAS,
  IncidenciaMotor,
  diasIncapacidad,
  diasEntidad,
  factor,
  liquidar,
  indicadoresLegado,
  nombrePorCedula,
  redondeoExcel,
  valorPagadoNumerico,
  validarDiasContraInformados,
} from "./motor";
import {
  COLUMNAS_FORMULA,
  FILA_ROUND0,
  FILAS_ANEXO_A,
  filasSinteticas,
  type FilaSintetica,
} from "./fixtures-excel-2024";

/** Tolerancia técnica para importes (anexo H): no es una tolerancia de negocio. */
const TOLERANCIA = 1e-6;

// ── Oráculo: las fórmulas del anexo B, letra por letra ───────────────────────

const EXCEL = REGLAS["excel-2024-v1"];
const ROUND0 = REGLAS["excel-2024-v1-round0"];

function serial(iso: string | null): number {
  // Excel: celda vacía = 0. Un serial de fecha siempre es > 0.
  return iso ? Date.parse(`${iso}T00:00:00Z`) / 86_400_000 : 0;
}
const eq = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

interface Oraculo {
  C: string; I: number; M: number; N: number; O: number; P: number; Q: number;
  S: string; T: number; U: number; V: number; W: number; Y: string;
}

function oraculo(f: FilaSintetica, X: number, catalogo: Map<string, string>): Oraculo {
  const B = f.cedula, F = f.salario, G = serial(f.inicio), H = serial(f.fin);
  const J = f.entidad, K = f.tipo, L = f.modalidad, R = f.cobrada;
  const C = catalogo.get(String(B)) ?? " "; // =IFERROR(VLOOKUP(B,Personal!A:B,2,0)," ")
  const I = G > 0 ? H - G + 1 : 0; // =IF(G>0,H-G+1,0)
  // =IF(L="INICIAL",IF(J="ARL SURA",IF(I<=1,0,I-1),IF(I<=2,0,I-2)),I)
  const N = eq(L, "INICIAL") ? (eq(J, "ARL SURA") ? (I <= 1 ? 0 : I - 1) : I <= 2 ? 0 : I - 2) : I;
  const M = I - N; // =I-N
  const fac = eq(K, "AT") || eq(K, "EG") ? 1 : 0.67; // IF(OR(K="AT",K="EG"),1,0.67)
  const O = ((F / 30) * I) * fac; // =((F/30)*I)*IF(...)
  let Q = ((F / 30) * N) * fac; // =((F/30)*N)*IF(...)
  if (f.fila === FILA_ROUND0) Q = Math.round(Q); // Q70: =ROUND(...,0) (Q ≥ 0, Math.round basta)
  const P = O - Q; // =O-Q
  const S = X > 1 ? "SI" : B > 0 ? "NO" : ""; // =IF(X>1,"SI",(IF(B>0,"NO","")))
  const T = eq(R, "SI") ? Q : eq(R, "NO") ? 0 : 0; // =IF(R="SI",Q,IF(R="NO",0,0))
  const U = Q - T; // =Q-T
  const V = eq(S, "NO") ? Q : 0; // =IF(S="NO",Q,0)
  const W = V > 0 ? 1 : 0; // =IF(V>0,1,0)
  const Y = X - T === 0 ? "LO DEBIDO" : X - T > 0 ? "A FAVOR" : "NO PAGADO"; // =IF((+X-T)=0,...)
  return { C, I, M, N, O, P, Q, S, T, U, V, W, Y };
}

/** X sale del modo de pago de la fila y del T que da el oráculo (independiente del motor). */
function valorPagado(f: FilaSintetica, T: number): number | null {
  switch (f.pago.tipo) {
    case "fijo": return f.pago.valor as number | null;
    case "igual_a_T": return T;
    case "T_menos": return T - f.pago.delta;
    case "T_mas": return T + f.pago.delta;
  }
}

// ── 1. Compatibilidad: 1.027 aserciones ──────────────────────────────────────

test("compatibilidad con el libro: 79 filas × 13 fórmulas = 1.027 aserciones sin diferencias", () => {
  const filas = filasSinteticas();
  assert.equal(filas.length, 79);
  assert.equal(FILAS_ANEXO_A.length * COLUMNAS_FORMULA.length, 1027);

  // Catálogo sintético: la mitad de las cédulas existen, la otra mitad no (rama " " de C).
  const catalogo = new Map<string, string>();
  filas.forEach((f, i) => { if (i % 2 === 0 && f.cedula > 0) catalogo.set(String(f.cedula), `PERSONA ${f.fila}`); });

  let aserciones = 0;
  const cerca = (real: number, esperado: number, celda: string) => {
    aserciones++;
    assert.ok(Math.abs(real - esperado) <= TOLERANCIA, `${celda}: motor ${real} ≠ Excel ${esperado}`);
  };
  const exacto = (real: unknown, esperado: unknown, celda: string) => {
    aserciones++;
    assert.equal(real, esperado, celda);
  };

  for (const f of filas) {
    // Primero el oráculo con X provisional (solo se necesita T para fijar X).
    const T = oraculo(f, 0, catalogo).T;
    const X = valorPagado(f, T);
    const esperado = oraculo(f, X ?? 0, catalogo);

    const regla = f.fila === FILA_ROUND0 ? ROUND0 : EXCEL;
    const liq = liquidar(
      { salarioBase: f.salario, fechaInicio: f.inicio, fechaFin: f.fin, entidad: f.entidad, tipo: f.tipo, modalidad: f.modalidad },
      regla
    );
    const ind = indicadoresLegado({ cedula: f.cedula, cobrada: f.cobrada, valorPagado: X }, liq);
    const c = nombrePorCedula(f.cedula, catalogo).compat;

    exacto(c, esperado.C, `C${f.fila}`);
    exacto(liq.diasIncapacidad, esperado.I, `I${f.fila}`);
    exacto(liq.diasEmpresa, esperado.M, `M${f.fila}`);
    exacto(liq.diasEntidad, esperado.N, `N${f.fila}`);
    cerca(liq.valorTotal, esperado.O, `O${f.fila}`);
    cerca(liq.valorEmpresa, esperado.P, `P${f.fila}`);
    cerca(liq.valorEntidad, esperado.Q, `Q${f.fila}`);
    exacto(ind.pagada, esperado.S, `S${f.fila}`);
    cerca(ind.valorCobrado, esperado.T, `T${f.fila}`);
    cerca(ind.valorNoCobrado, esperado.U, `U${f.fila}`);
    cerca(ind.pendiente, esperado.V, `V${f.fila}`);
    exacto(ind.contador, esperado.W, `W${f.fila}`);
    exacto(ind.conciliacion, esperado.Y, `Y${f.fila}`);
  }
  assert.equal(aserciones, 1027, "deben ser exactamente 1.027 aserciones");
});

test("los fixtures cubren todas las ramas de las fórmulas", () => {
  const filas = filasSinteticas();
  const alguna = (p: (f: FilaSintetica) => boolean) => filas.some(p);
  assert.ok(alguna((f) => f.inicio === null), "I = 0 (sin fecha de inicio)");
  assert.ok(alguna((f) => f.entidad === "ARL SURA" && f.modalidad.toUpperCase() === "INICIAL"), "rama ARL SURA inicial");
  assert.ok(alguna((f) => f.modalidad === ""), "modalidad vacía");
  assert.ok(alguna((f) => f.modalidad.toUpperCase() === "PRORROGA"), "prórroga");
  assert.ok(alguna((f) => f.tipo === ""), "tipo vacío (factor 0.67)");
  assert.ok(alguna((f) => ["EP", "LM", "LP"].includes(f.tipo)), "tipos con factor 0.67");
  assert.ok(alguna((f) => f.tipo === "eg" || f.modalidad === "inicial" || f.cobrada === "si"), "comparación sin mayúsculas");
  assert.ok(alguna((f) => f.cedula === 0), "cédula 0 (S vacío)");
  assert.ok(alguna((f) => f.cobrada === ""), "R vacío");
  assert.ok(alguna((f) => f.pago.tipo === "fijo" && f.pago.valor === 1), "X = 1 (umbral de S)");
  assert.ok(alguna((f) => f.pago.tipo === "fijo" && f.pago.valor === 1.01), "X = 1,01");
  assert.ok(alguna((f) => f.pago.tipo === "T_menos" && f.pago.delta === 0.01), "X = T − 0,01");
  assert.ok(alguna((f) => f.pago.tipo === "T_mas"), "X > T");
  assert.ok(alguna((f) => f.pago.tipo === "fijo" && f.pago.valor === null), "X vacío");
  assert.ok(filas.some((f) => f.fila === FILA_ROUND0), "fila 70 presente");
});

// ── 2. Casos sintéticos de la sección 13.2 (regla literal del libro) ─────────

const base = { salarioBase: 1_300_000, fechaInicio: "2026-09-01", entidad: "NUEVA EPS", tipo: "EG", modalidad: "INICIAL" };
const conDias = (dias: number) => ({
  ...base,
  fechaFin: new Date(Date.parse("2026-09-01T00:00:00Z") + (dias - 1) * 86_400_000).toISOString().slice(0, 10),
});
const cerca = (real: number, esperado: number, msg?: string) =>
  assert.ok(Math.abs(real - esperado) <= TOLERANCIA, `${msg ?? ""} ${real} ≠ ${esperado}`);

test("13.2 · un solo día, inicial, entidad distinta de ARL SURA, EG", () => {
  const l = liquidar(conDias(1), EXCEL);
  assert.equal(l.diasEntidad, 0);
  assert.equal(l.diasEmpresa, 1);
  cerca(l.valorTotal, 43_333.333333333);
  assert.equal(l.valorEntidad, 0);
  cerca(l.valorEmpresa, l.valorTotal);
});

test("13.2 · cinco días, inicial, entidad distinta de ARL SURA, EG", () => {
  const l = liquidar(conDias(5), EXCEL);
  assert.equal(l.diasEntidad, 3);
  assert.equal(l.diasEmpresa, 2);
  cerca(l.valorTotal, 216_666.666666667);
  cerca(l.valorEntidad, 130_000);
});

test("13.2 · cinco días, inicial, ARL SURA, AT", () => {
  const l = liquidar({ ...conDias(5), entidad: "ARL SURA", tipo: "AT" }, EXCEL);
  assert.equal(l.diasEntidad, 4);
  assert.equal(l.diasEmpresa, 1);
  assert.equal(l.factor, 1);
});

test("13.2 · cinco días, prórroga, EG", () => {
  const l = liquidar({ ...conDias(5), modalidad: "PRORROGA" }, EXCEL);
  assert.equal(l.diasEntidad, 5);
  assert.equal(l.diasEmpresa, 0);
  cerca(l.valorEntidad, l.valorTotal);
});

test("13.2 · tipo LP, dos días, prórroga: factor 0.67 según la regla del archivo", () => {
  const l = liquidar({ ...conDias(2), tipo: "LP", modalidad: "PRORROGA" }, EXCEL);
  assert.equal(l.factor, 0.67);
  cerca(l.valorEntidad, 58_066.666666667);
  cerca(l.valorEntidad, l.valorTotal);
});

test("13.2 · modalidad vacía: compatibilidad N = I", () => {
  assert.equal(diasEntidad({ entidad: "NUEVA EPS", tipo: "EG", modalidad: "" }, 5, EXCEL), 5);
  assert.equal(diasEntidad({ entidad: "NUEVA EPS", tipo: "EG", modalidad: null }, 5, EXCEL), 5);
});

test("13.2 · tipo vacío: compatibilidad factor 0.67", () => {
  assert.equal(factor("", EXCEL), 0.67);
  assert.equal(factor(null, EXCEL), 0.67);
});

test("13.2 · R = NO con Q = 100.000: T = 0, U = 100.000", () => {
  const i = indicadoresLegado({ cedula: 1, cobrada: "NO", valorPagado: 0 }, { valorEntidad: 100_000 });
  assert.equal(i.valorCobrado, 0);
  assert.equal(i.valorNoCobrado, 100_000);
});

test("13.2 · pago parcial con S por fórmula: S = SI, V = 0, Y = NO PAGADO", () => {
  const i = indicadoresLegado({ cedula: 1, cobrada: "SI", valorPagado: 100 }, { valorEntidad: 100_000 });
  assert.equal(i.valorCobrado, 100_000);
  assert.equal(i.pagada, "SI");
  assert.equal(i.pendiente, 0);
  assert.equal(i.contador, 0);
  assert.equal(i.conciliacion, "NO PAGADO");
});

test("13.2 · umbral de S: X = 1 → NO; X = 1,01 → SI (con cédula válida)", () => {
  assert.equal(indicadoresLegado({ cedula: 1, cobrada: "SI", valorPagado: 1 }, { valorEntidad: 10 }).pagada, "NO");
  assert.equal(indicadoresLegado({ cedula: 1, cobrada: "SI", valorPagado: 1.01 }, { valorEntidad: 10 }).pagada, "SI");
  assert.equal(indicadoresLegado({ cedula: 0, cobrada: "SI", valorPagado: 1 }, { valorEntidad: 10 }).pagada, "");
});

test("13.2 · conciliación exacta: X = T → LO DEBIDO, también cero contra cero", () => {
  assert.equal(indicadoresLegado({ cedula: 1, cobrada: "SI", valorPagado: 130_000 }, { valorEntidad: 130_000 }).conciliacion, "LO DEBIDO");
  assert.equal(indicadoresLegado({ cedula: 1, cobrada: "NO", valorPagado: 0 }, { valorEntidad: 130_000 }).conciliacion, "LO DEBIDO");
  assert.equal(indicadoresLegado({ cedula: 1, cobrada: null, valorPagado: null }, { valorEntidad: 0 }).conciliacion, "LO DEBIDO");
});

test("13.2 · diferencia mínima negativa: X = T − 0,01 → NO PAGADO, sin tolerancia", () => {
  const i = indicadoresLegado({ cedula: 1, cobrada: "SI", valorPagado: 129_999.99 }, { valorEntidad: 130_000 });
  assert.equal(i.conciliacion, "NO PAGADO");
});

test("13.2 · pago mayor que cobrado: X > T → A FAVOR", () => {
  assert.equal(indicadoresLegado({ cedula: 1, cobrada: "SI", valorPagado: 130_000.01 }, { valorEntidad: 130_000 }).conciliacion, "A FAVOR");
  // T vacío (R sin marcar) con cualquier pago también sale A FAVOR, como en el libro.
  assert.equal(indicadoresLegado({ cedula: 1, cobrada: "", valorPagado: 5 }, { valorEntidad: 130_000 }).conciliacion, "A FAVOR");
});

test("13.2 · texto en X: incidencia, no liquidación silenciosa como cero", () => {
  assert.throws(
    () => indicadoresLegado({ cedula: 1, cobrada: "SI", valorPagado: "pendiente" }, { valorEntidad: 10 }),
    (e: unknown) => e instanceof IncidenciaMotor && e.codigo === "valor_pagado_no_numerico"
  );
  assert.equal(valorPagadoNumerico("  "), 0, "solo espacios cuenta como vacío");
  assert.equal(valorPagadoNumerico("250000"), 250_000, "texto numérico se convierte");
  assert.equal(valorPagadoNumerico(null), 0);
});

// ── 3. Semántica de Excel y bordes del motor ────────────────────────────────

test("ROUND de Excel: la mitad se aleja de cero", () => {
  assert.equal(redondeoExcel(2.5, 0), 3);
  assert.equal(redondeoExcel(-2.5, 0), -3);
  assert.equal(redondeoExcel(1234.5678, 2), 1234.57);
  assert.equal(redondeoExcel(0.4999, 0), 0);
});

test("variante Q70: la regla round0 redondea solo el valor entidad", () => {
  const e = { ...conDias(5), salarioBase: 1_234_567 };
  const sin = liquidar(e, EXCEL);
  const con = liquidar(e, ROUND0);
  assert.notEqual(sin.valorEntidad, Math.round(sin.valorEntidad), "el caso debe tener decimales para que se note");
  assert.equal(con.valorEntidad, Math.round(sin.valorEntidad));
  assert.equal(con.valorTotal, sin.valorTotal);
  cerca(con.valorEmpresa, sin.valorTotal - con.valorEntidad);
});

test("días de incapacidad: sin inicio 0; con inicio y sin fin, incidencia", () => {
  assert.equal(diasIncapacidad(null, "2026-09-05"), 0);
  assert.equal(diasIncapacidad("2026-09-01", "2026-09-01"), 1);
  assert.equal(diasIncapacidad("2026-09-01", "2026-09-05"), 5);
  assert.throws(() => diasIncapacidad("2026-09-01", null), (e: unknown) => e instanceof IncidenciaMotor && e.codigo === "fecha_fin_faltante");
  assert.throws(() => diasIncapacidad("2026-13-01", "2026-09-05"), (e: unknown) => e instanceof IncidenciaMotor && e.codigo === "fecha_invalida");
});

test("los días calculados desde las fechas deben coincidir con los de la información inicial", () => {
  // La matriz trae 5 días y las fechas dan 5: liquida.
  const ok = liquidar({ ...conDias(5), diasInformados: 5 });
  assert.equal(ok.diasIncapacidad, 5);
  // La matriz trae 4 y las fechas dan 5: incidencia, no se liquida con ninguno de los dos.
  assert.throws(
    () => liquidar({ ...conDias(5), diasInformados: 4 }),
    (e: unknown) => e instanceof IncidenciaMotor && e.codigo === "dias_no_coinciden" && /\(5\).*\(4\)/.test(e.message)
  );
  // Sin dato inicial no hay nada que cotejar.
  assert.equal(liquidar({ ...conDias(5), diasInformados: null }).diasIncapacidad, 5);
  assert.equal(liquidar(conDias(5)).diasIncapacidad, 5);
  // Un dato inicial que no es entero también es incidencia.
  assert.throws(
    () => validarDiasContraInformados(5, 4.5),
    (e: unknown) => e instanceof IncidenciaMotor && e.codigo === "dias_informados_invalidos"
  );
  assert.equal(validarDiasContraInformados(0, 0), 0);
});

test("nombre por cédula: GESTIVO dice si lo encontró; el compat del libro deja un espacio", () => {
  const cat = new Map([["123", "ANA"]]);
  assert.deepEqual(nombrePorCedula("123", cat), { encontrado: true, nombre: "ANA", compat: "ANA" });
  assert.deepEqual(nombrePorCedula(999, cat), { encontrado: false, nombre: null, compat: " " });
  assert.deepEqual(nombrePorCedula(null, cat), { encontrado: false, nombre: null, compat: " " });
  assert.equal(nombrePorCedula("123", (c) => (c === "123" ? "ANA" : undefined)).nombre, "ANA");
});

test("dos liquidaciones con la misma entrada dan exactamente el mismo resultado", () => {
  const e = { ...conDias(7), tipo: "LM" };
  assert.deepEqual(liquidar(e, EXCEL), liquidar(e, EXCEL));
  assert.deepEqual(liquidar(e), liquidar(e));
});

// ── 4. Regla operativa de GESTIVO (Fase 0, decisión 12.2) ───────────────────

const GESTIVO = REGLAS["gestivo-cobro-dias"];

test("gestivo-cobro-dias es la regla por defecto y la ARL responde por todos los días", () => {
  const at = { ...conDias(3), entidad: "ARL BOLIVAR", tipo: "AT" };
  assert.equal(liquidar(at).regla, "gestivo-cobro-dias");
  assert.equal(liquidar(at, GESTIVO).diasEntidad, 3, "ARL BOLIVAR inicial de 3 días: los 3");
  assert.equal(liquidar(at, EXCEL).diasEntidad, 1, "la fórmula del libro habría dado 1");
  assert.equal(liquidar({ ...conDias(1), entidad: "ARL BOLIVAR", tipo: "AT" }, GESTIVO).diasEntidad, 1);
  assert.equal(liquidar({ ...conDias(2), entidad: "ARL BOLIVAR", tipo: "EL" }, GESTIVO).diasEntidad, 2, "EL también paga la ARL");
});

test("gestivo-cobro-dias: la EPS reconoce una inicial desde el día 3 y una prórroga completa", () => {
  assert.equal(liquidar(conDias(5), GESTIVO).diasEntidad, 3);
  assert.equal(liquidar(conDias(2), GESTIVO).diasEntidad, 0);
  assert.equal(liquidar(conDias(1), GESTIVO).diasEntidad, 0);
  assert.equal(liquidar({ ...conDias(5), modalidad: "PRORROGA" }, GESTIVO).diasEntidad, 5);
  // Mismo resultado que la regla de la matriz EPS para el arranque: las 23 son EG y AT.
  assert.equal(liquidar({ ...conDias(3), tipo: "EG" }, GESTIVO).diasEntidad, 1);
});

test("gestivo-cobro-dias: la clase ARL manda sobre el nombre; ARL SURA ya no tiene regla propia", () => {
  assert.equal(liquidar({ ...conDias(5), entidad: "ARL SURA", tipo: "AT" }, GESTIVO).diasEntidad, 5);
  assert.equal(liquidar({ ...conDias(5), entidad: "ARL SURA", tipo: "AT" }, EXCEL).diasEntidad, 4);
  // Si la entidad viene clasificada como ARL aunque el tipo diga EG, se respeta la clase.
  assert.equal(liquidar({ ...conDias(5), entidad: "ARL BOLIVAR", tipo: "EG", esArl: true }, GESTIVO).diasEntidad, 5);
  assert.equal(liquidar({ ...conDias(5), entidad: "NUEVA EPS", tipo: "AT", esArl: false }, GESTIVO).diasEntidad, 3);
});

test("gestivo-cobro-dias: mismos factores e importes que el libro, solo cambian los días de la ARL", () => {
  const eg = liquidar(conDias(5), GESTIVO);
  cerca(eg.valorEntidad, 130_000);
  cerca(eg.valorTotal, 216_666.666666667);
  assert.equal(factor("LM", GESTIVO), 0.67);
  assert.equal(factor("at", GESTIVO), 1);
});
