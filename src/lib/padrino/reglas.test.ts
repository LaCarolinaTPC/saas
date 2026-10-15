import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluarPadrino, evaluarReferido, hitosProyectados, padrinoPuedeRegistrar, politicaVigente,
  resumenValidacion, sumarMeses, totalEsquema, validarDecision,
  type EsquemasPolitica, type HechosPadrino, type HechosReferido, type Validacion,
} from "./reglas";

test("mes calendario: mismo día, y el último del mes si no existe", () => {
  assert.equal(sumarMeses("2026-10-15", 1), "2026-11-15");
  assert.equal(sumarMeses("2026-10-15", 3), "2027-01-15");
  assert.equal(sumarMeses("2026-01-31", 1), "2026-02-28");
  assert.equal(sumarMeses("2028-01-31", 1), "2028-02-29");
  assert.equal(sumarMeses("2026-10-31", -6), "2026-04-30");
});

const ESQUEMAS: EsquemasPolitica = {
  A: { nombre: "Con experiencia", condicion: "", hitos: [
    { numero: 1, meses: 1, valor: 150000, descripcion: "Mes 1" },
    { numero: 2, meses: 2, valor: 200000, descripcion: "Mes 2" },
    { numero: 3, meses: 3, valor: 350000, descripcion: "Mes 3" },
  ] },
  B: { nombre: "Sin experiencia", condicion: "", hitos: [
    { numero: 1, meses: 1, valor: 100000, descripcion: "Mes 1" },
    { numero: 2, meses: 3, valor: 100000, descripcion: "3 meses", requiere_desempeno: true },
  ] },
};

test("hitos con fecha de causación y totales de la política", () => {
  assert.equal(totalEsquema(ESQUEMAS.A), 700000);
  assert.equal(totalEsquema(ESQUEMAS.B), 200000);
  const b = hitosProyectados(ESQUEMAS, "B", "2026-10-15");
  assert.deepEqual(b.map((h) => h.fechaCausacion), ["2026-11-15", "2027-01-15"]);
  assert.equal(hitosProyectados(ESQUEMAS, "A", null)[0].fechaCausacion, null);
});

test("política vigente en la fecha de registro", () => {
  const ps = [
    { id: "v1", vigente_desde: "2026-01-01", vigente_hasta: "2026-09-30" },
    { id: "v2", vigente_desde: "2026-10-01", vigente_hasta: null },
  ];
  assert.equal(politicaVigente(ps, "2026-10-15")?.id, "v2");
  assert.equal(politicaVigente(ps, "2026-05-01")?.id, "v1");
  assert.equal(politicaVigente(ps, "2025-05-01"), null);
});

const padrino = (p: Partial<HechosPadrino>): HechosPadrino => ({ cedula: "1", conductor: null, empleado: null, empleadoAutorizado: false, notificaciones: [], correctivos: [], ...p });
const est = (rs: { codigo: string; estado: string }[]) => Object.fromEntries(rs.map((r) => [r.codigo, r.estado]));

test("padrino conductor activo sin sanciones: P3 queda para confirmar", () => {
  const r = evaluarPadrino(padrino({ conductor: { nombre: "X", estado: "ACTIVO", tipo: "FIJO EMPRESA", fechaIngreso: "2024-01-10" } }), "2026-10-15");
  assert.deepEqual(est(r), { P1: "cumple", P2: "cumple", P3: "revisar" });
  assert.equal(padrinoPuedeRegistrar(r), null);
});

test("padrino retirado o inexistente no puede registrar", () => {
  const r = evaluarPadrino(padrino({ conductor: { nombre: "X", estado: "RETIRADO", tipo: null, fechaIngreso: null } }), "2026-10-15");
  assert.equal(est(r).P1, "no_cumple");
  assert.match(padrinoPuedeRegistrar(r) ?? "", /RETIRADO/);
  assert.equal(est(evaluarPadrino(padrino({}), "2026-10-15")).P1, "no_cumple");
});

const empleado = (cargo: string, area: string | null, autorizado: boolean, status = "activo") =>
  evaluarPadrino(padrino({ empleado: { nombre: "Y", status, cargo, area }, empleadoAutorizado: autorizado }), "2026-10-15");

test("de los empleados, solo el autorizado y activo puede ser padrino", () => {
  const ok = empleado("INSTRUCTOR DE CONDUCCION", "Operaciones", true);
  assert.deepEqual([est(ok).P1, est(ok).P2], ["cumple", "cumple"]);
  assert.equal(padrinoPuedeRegistrar(ok), null);
  for (const [cargo, area] of [["AUXILIAR OPERATIVO", "Operaciones"], ["CAJERO", "METRORECAUDO LTDA."], ["AUXILIAR DE GESTION HUMANA", "RECURSOS HUMANOS"]]) {
    const r = empleado(cargo, area, false);
    assert.deepEqual([est(r).P1, est(r).P2], ["no_cumple", "no_cumple"], cargo);
    assert.match(padrinoPuedeRegistrar(r) ?? "", /autorizados/);
  }
  assert.equal(est(empleado("INSTRUCTOR DE CONDUCCION", "Operaciones", true, "retirado")).P1, "no_cumple");
});

test("P3: descargos o correctivos de los últimos 6 meses no cumplen; los viejos no cuentan", () => {
  const base = { conductor: { nombre: "X", estado: "ACTIVO", tipo: null, fechaIngreso: null } };
  assert.equal(est(evaluarPadrino(padrino({ ...base, notificaciones: [{ nivel: "descargos", fecha: "2026-06-01" }] }), "2026-10-15")).P3, "no_cumple");
  assert.equal(est(evaluarPadrino(padrino({ ...base, correctivos: [{ nivel: "II", fecha: "2026-09-01" }] }), "2026-10-15")).P3, "no_cumple");
  assert.equal(est(evaluarPadrino(padrino({ ...base, notificaciones: [{ nivel: "descargos", fecha: "2026-03-01" }] }), "2026-10-15")).P3, "revisar");
});

const referido = (p: Partial<HechosReferido>): HechosReferido => ({
  cedula: "9",
  proceso: { id: "p", fechaCreacion: "2026-10-10", simit: "ok" },
  candidatoCreado: "2026-10-10",
  otrosProcesos: [],
  conductor: null,
  causaRetiro: null,
  notificaciones: [],
  accidentes: [],
  ...p,
});

test("referido limpio cumple todo", () => {
  assert.deepEqual(est(evaluarReferido(referido({}))), { R1: "cumple", R2: "cumple", R3: "cumple", R4: "cumple", R5: "cumple" });
});

test("R2 y R3: proceso en los 12 meses anteriores y otro en curso", () => {
  const r = evaluarReferido(referido({ otrosProcesos: [{ id: "o", estado: "citado", fechaCreacion: "2026-05-20" }] }));
  assert.equal(est(r).R2, "no_cumple");
  assert.equal(est(r).R3, "no_cumple");
  assert.match(r.find((x) => x.codigo === "R2")!.dato, /20\/05\/2026/);
  const viejo = evaluarReferido(referido({ otrosProcesos: [{ id: "o", estado: "cierre", fechaCreacion: "2025-05-20" }] }));
  assert.equal(est(viejo).R2, "cumple");
  const hv = evaluarReferido(referido({ candidatoCreado: "2026-05-01" }));
  assert.equal(est(hv).R2, "revisar");
});

test("R4: retiro antes de un mes no cumple; R1: retiro previo se revisa", () => {
  const r = evaluarReferido(referido({ conductor: { estado: "RETIRADO", fechaIngreso: "2026-03-01", fechaRetiro: "2026-03-20" }, causaRetiro: "Renuncia voluntaria" }));
  assert.equal(est(r).R4, "no_cumple");
  assert.equal(est(r).R1, "revisar");
  assert.match(r.find((x) => x.codigo === "R1")!.dato, /Renuncia voluntaria/);
  const ok = evaluarReferido(referido({ conductor: { estado: "RETIRADO", fechaIngreso: "2025-01-01", fechaRetiro: "2025-06-01" } }));
  assert.equal(est(ok).R4, "cumple");
});

test("R5: accidentes no cumplen; SIMIT con deuda o sin verificar se revisa", () => {
  assert.equal(est(evaluarReferido(referido({ accidentes: [{ fecha: "2025-02-01" }] }))).R5, "no_cumple");
  assert.equal(est(evaluarReferido(referido({ proceso: { id: "p", fechaCreacion: "2026-10-10", simit: "deuda" } }))).R5, "revisar");
  assert.equal(est(evaluarReferido(referido({ proceso: { id: "p", fechaCreacion: "2026-10-10", simit: null } }))).R5, "revisar");
});

test("decisión de elegibilidad: no cumple exige excepción; revisar exige observación", () => {
  const v = (p: string[], r: string[]): Validacion => ({
    padrino: p.map((e, i) => ({ codigo: `P${i + 1}`, titulo: "", estado: e as "cumple", dato: "" })),
    referido: r.map((e, i) => ({ codigo: `R${i + 1}`, titulo: "", estado: e as "cumple", dato: "" })),
    evaluadoEl: "2026-10-15",
  });
  const limpia = v(["cumple"], ["cumple"]);
  const conRevisar = v(["revisar"], ["cumple"]);
  const conFalla = v(["cumple"], ["no_cumple"]);
  assert.deepEqual(resumenValidacion(conFalla), { noCumple: 1, revisar: 0, cumple: 1 });
  assert.equal(validarDecision("elegible", limpia, false, ""), null);
  assert.match(validarDecision("elegible", conRevisar, false, "") ?? "", /observación/);
  assert.equal(validarDecision("elegible", conRevisar, false, "Confirmado con GH"), null);
  assert.match(validarDecision("elegible", conFalla, false, "x") ?? "", /excepción/);
  assert.equal(validarDecision("elegible", conFalla, true, "Autorizado por Gerencia"), null);
  assert.match(validarDecision("no_elegible", limpia, false, " ") ?? "", /por qué/);
});
