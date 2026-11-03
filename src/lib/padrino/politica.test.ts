import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARAMETROS_V2, PARAMETROS_V3, diferencias, esquemasLegadoDe, maximoPolitica, siguienteVersion, parametrosDeFila, parametrosDesdeEsquemas, parsearParametros, totalesEsquema, validarPublicacion,
  type ParametrosPolitica, type VersionPublicada,
} from "./politica";
import {
  decidirEsquema, evaluarPadrino, evaluarReferido, hitosPorBeneficiario, hitosProyectados, padrinoPuedeRegistrar,
  politicaVigente, resumenDecision, validarDecision,
  type EsquemasPolitica, type HechosPadrino, type HechosReferido, type Validacion,
} from "./reglas";
import { evaluarHito, filaIncentivo, pagosSimulados, type HechosPermanencia } from "./hitos";

const est = (rs: { codigo: string; estado: string }[]) => Object.fromEntries(rs.map((r) => [r.codigo, r.estado]));
const HOY = "2026-11-03";

// ── Parámetros ──────────────────────────────────────────────────────────────

test("los parámetros de v2 y v3 son válidos y los montos son los de cada política", () => {
  assert.equal(parsearParametros(PARAMETROS_V2).ok, true);
  assert.equal(parsearParametros(PARAMETROS_V3).ok, true);
  assert.deepEqual(totalesEsquema(PARAMETROS_V2.esquemas.A), { padrino: 700000, referido: 0, total: 700000 });
  assert.deepEqual(totalesEsquema(PARAMETROS_V2.esquemas.B), { padrino: 200000, referido: 0, total: 200000 });
  assert.deepEqual(totalesEsquema(PARAMETROS_V3.esquemas.A), { padrino: 500000, referido: 200000, total: 700000 });
  assert.deepEqual(totalesEsquema(PARAMETROS_V3.esquemas.B), { padrino: 200000, referido: 0, total: 200000 });
  assert.deepEqual(totalesEsquema(PARAMETROS_V3.esquemas.C), { padrino: 200000, referido: 200000, total: 400000 });
  assert.equal(maximoPolitica(PARAMETROS_V3), 700000);
});

test("un parámetro inválido se rechaza con el campo que falla", () => {
  const malo = structuredClone(PARAMETROS_V3) as ParametrosPolitica;
  malo.esquemas.A!.hitos[1].numero = 1;
  const r = parsearParametros(malo);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /repetir/);
  const negativo = structuredClone(PARAMETROS_V3) as ParametrosPolitica;
  negativo.esquemas.C!.hitos[0].pagos.referido = -1;
  assert.match((parsearParametros(negativo) as { error: string }).error, /esquemas\.C\.hitos\.0\.pagos\.referido/);
});

test("sin `parametros` (código antes de la migración) se derivan de `esquemas` y equivalen a la v2", () => {
  const esquemas: EsquemasPolitica = {
    A: { nombre: "Con experiencia", condicion: "x", hitos: PARAMETROS_V2.esquemas.A!.hitos.map((h) => ({ numero: h.numero, meses: h.meses, valor: h.pagos.padrino, descripcion: h.descripcion })) },
    B: { nombre: "Sin experiencia", condicion: "y", hitos: PARAMETROS_V2.esquemas.B!.hitos.map((h) => ({ numero: h.numero, meses: h.meses, valor: h.pagos.padrino, descripcion: h.descripcion, requiere_desempeno: h.requiere_desempeno })) },
  };
  const p = parametrosDesdeEsquemas(esquemas);
  assert.deepEqual(p.requisitos, PARAMETROS_V2.requisitos);
  assert.deepEqual(p.esquemas.B!.hitos, PARAMETROS_V2.esquemas.B!.hitos);
  // Hitos iguales a los de antes: mismas fechas y valores.
  const antes = hitosProyectados(esquemas, "A", "2026-10-15").map((h) => [h.numero, h.valor, h.fechaCausacion]);
  const ahora = hitosPorBeneficiario(p, "A", "2026-10-15").map((h) => [h.numero, h.valor, h.fechaCausacion]);
  assert.deepEqual(ahora, antes);
  // Una fila con parámetros inválidos también cae a los esquemas.
  assert.deepEqual(parametrosDeFila({ parametros: { esquemas: {} }, esquemas }).requisitos, PARAMETROS_V2.requisitos);
});

test("una política en borrador sin fecha nunca queda vigente", () => {
  const ps = [
    { id: "v2", vigente_desde: "2026-10-01", vigente_hasta: null },
    { id: "v3", vigente_desde: null, vigente_hasta: null },
  ];
  assert.equal(politicaVigente(ps, HOY)?.id, "v2");
});

test("publicar: cierra la versión abierta el día anterior y no deja cruces", () => {
  const v2: VersionPublicada = { id: "2", version: "v2", vigente_desde: "2026-10-01", vigente_hasta: null };
  const base: Parameters<typeof validarPublicacion>[0] = { parametros: PARAMETROS_V3, publicadas: [v2], vigenteDesde: "2026-12-01", hoy: HOY, aprobadaPor: "Gerencia General", soporte: "Política firmada" };
  assert.deepEqual(validarPublicacion(base), { ok: true, cerrar: [{ id: "2", version: "v2", hasta: "2026-11-30" }] });
  assert.deepEqual(validarPublicacion({ ...base, vigenteDesde: HOY }), { ok: true, cerrar: [{ id: "2", version: "v2", hasta: "2026-11-02" }] });
  const err = (x: Partial<typeof base>) => { const r = validarPublicacion({ ...base, ...x }); return r.ok ? "" : r.error; };
  assert.match(err({ vigenteDesde: "2026-11-01" }), /anterior a hoy/);
  assert.match(err({ vigenteDesde: "" }), /fecha/);
  assert.match(err({ aprobadaPor: " " }), /aprobó/);
  assert.match(err({ soporte: "" }), /soporte/);
  assert.match(err({ publicadas: [{ ...v2, vigente_desde: "2026-12-05" }] }), /después/);
  assert.match(err({ publicadas: [{ ...v2, vigente_hasta: "2026-12-10" }] }), /se cruza/);
  assert.match(err({ parametros: { esquemas: {} } }), /no son válidos/);
});

test("borradores: nombre de la versión siguiente, columna vieja y diferencias", () => {
  assert.equal(siguienteVersion(["v2", "v3"]), "v4");
  assert.equal(siguienteVersion([]), "v1");
  const legado = esquemasLegadoDe(PARAMETROS_V3);
  assert.deepEqual(legado.A.hitos.map((h) => h.valor), [100000, 300000, 300000]);
  assert.equal(legado.C.hitos.length, 2);
  assert.deepEqual(diferencias(PARAMETROS_V2, PARAMETROS_V2), []);
  const d = diferencias(PARAMETROS_V2, PARAMETROS_V3);
  assert.ok(d.some((x) => /^Esquema C nuevo \(Reintegro\): \$400\.000/.test(x)), d.join("\n"));
  assert.ok(d.some((x) => x.startsWith("Esquema A, hito 2: mes 2, padrino $200.000, referido $0 → mes 2, padrino $200.000, referido $100.000")));
  assert.ok(d.some((x) => x.startsWith("Padrino, antigüedad mínima: 0 meses → 3 meses")));
  assert.ok(d.some((x) => x.startsWith("R4 ") && x.endsWith("activo, bloquea → apagado")));
});

// ── Padrino v3 ──────────────────────────────────────────────────────────────

const padrino = (p: Partial<HechosPadrino>): HechosPadrino => ({ cedula: "1", conductor: null, empleado: null, empleadoAutorizado: false, notificaciones: [], correctivos: [], ...p });
const conductor = (fechaIngreso = "2024-01-10") => ({ nombre: "X", estado: "ACTIVO", tipo: "FIJO", fechaIngreso });
const v3Padrino = (h: Partial<HechosPadrino>) => evaluarPadrino(padrino(h), HOY, PARAMETROS_V3);

test("v3: cualquier empleado activo con 3 meses puede ser padrino; P3 ya no aplica", () => {
  const r = v3Padrino({ empleado: { nombre: "Y", status: "activo", cargo: "AUXILIAR OPERATIVO", area: "Operaciones", fechaIngreso: "2025-01-01" } });
  assert.deepEqual(est(r), { P1: "cumple", P2: "cumple", P4: "cumple", P5: "cumple", P6: "revisar" });
  assert.equal(padrinoPuedeRegistrar(r), null);
});

test("v3: Recursos Humanos queda excluido, salvo la excepción autorizada (el instructor)", () => {
  const gh = { nombre: "Y", status: "activo", cargo: "AUXILIAR DE GESTION HUMANA", area: "Recursos Humanos", fechaIngreso: "2025-01-01" };
  const r = v3Padrino({ empleado: gh });
  assert.equal(est(r).P2, "no_cumple");
  assert.match(padrinoPuedeRegistrar(r) ?? "", /selección/);
  assert.equal(est(v3Padrino({ empleado: gh, empleadoAutorizado: true })).P2, "cumple");
});

test("v3: antigüedad mínima de 3 meses, contando desde el reingreso", () => {
  assert.equal(est(v3Padrino({ conductor: conductor("2026-09-01") })).P4, "no_cumple");
  assert.equal(est(v3Padrino({ conductor: conductor("2026-08-03") })).P4, "cumple");
  assert.equal(est(v3Padrino({ conductor: { ...conductor("2020-01-01"), fechaReingreso: "2026-10-01" } })).P4, "no_cumple");
});

test("v3: falta grave = accidente con responsabilidad directa nivel III-IV en 12 meses; las leves no impiden", () => {
  const grave = v3Padrino({ conductor: conductor(), correctivos: [{ fecha: "2026-02-01", nivel: "III", responsabilidad: "directo" }] });
  assert.equal(est(grave).P6, "no_cumple");
  const leve = v3Padrino({ conductor: conductor(), correctivos: [{ fecha: "2026-02-01", nivel: "II", responsabilidad: "directo" }] });
  assert.equal(est(leve).P6, "revisar");
  const compartido = v3Padrino({ conductor: conductor(), correctivos: [{ fecha: "2026-02-01", nivel: "IV", responsabilidad: "compartido" }] });
  assert.equal(est(compartido).P6, "revisar");
  const viejo = v3Padrino({ conductor: conductor(), correctivos: [{ fecha: "2025-09-01", nivel: "IV", responsabilidad: "directo" }] });
  assert.equal(est(viejo).P6, "revisar");
});

test("v3: descargos vigentes dejan el proceso disciplinario en revisión", () => {
  assert.equal(est(v3Padrino({ conductor: conductor(), notificaciones: [{ nivel: "descargos", fecha: "2026-06-01" }] })).P5, "revisar");
});

// ── Referido v3 ─────────────────────────────────────────────────────────────

const referido = (p: Partial<HechosReferido>): HechosReferido => ({
  cedula: "9",
  proceso: { id: "p", fechaCreacion: "2026-11-01", simit: "ok", estado: "citado", licencia: "C2", antecedentes: "ok", fechaExamenes: null, fechaExamenesFase2: null },
  candidatoCreado: "2026-11-01",
  otrosProcesos: [],
  conductor: null,
  causaRetiro: null,
  notificaciones: [],
  accidentes: [],
  pagosPrevios: [],
  experienciaCertificada: null,
  // Registrado por el padrino antes de que empezara el proceso (2026-11-01).
  registradoEl: "2026-10-30",
  ...p,
});

test("v3: referido nuevo limpio; R4 y R5 ya no aplican", () => {
  const r = evaluarReferido(referido({}), PARAMETROS_V3);
  assert.deepEqual(est(r), { R1: "cumple", R2: "cumple", R3: "cumple", R6: "cumple", R7: "cumple", R8: "revisar", R9: "revisar", R10: "revisar", R11: "cumple", R12: "cumple", R13: "cumple" });
});

test("v3: hoja de vida en los 6 meses anteriores (no en 12)", () => {
  const siete = evaluarReferido(referido({ otrosProcesos: [{ id: "o", estado: "cierre", fechaCreacion: "2026-04-01" }] }), PARAMETROS_V3);
  assert.equal(est(siete).R2, "cumple");
  const cinco = evaluarReferido(referido({ otrosProcesos: [{ id: "o", estado: "cierre", fechaCreacion: "2026-06-15" }] }), PARAMETROS_V3);
  assert.equal(est(cinco).R2, "no_cumple");
});

test("v3: licencia, antecedentes y un pago por cédula", () => {
  const r = evaluarReferido(referido({ proceso: { ...referido({}).proceso, licencia: "B1", antecedentes: "con_antecedentes" }, pagosPrevios: [{ fuente: "historico", detalle: "2024, $350.000" }] }), PARAMETROS_V3);
  assert.deepEqual([est(r).R6, est(r).R7, est(r).R11], ["no_cumple", "no_cumple", "no_cumple"]);
  assert.match(r.find((x) => x.codigo === "R11")!.dato, /2024/);
});

test("v3: los requisitos de contratación no cuentan al decidir; un pago previo sí bloquea", () => {
  const limpio = { padrino: v3Padrino({ conductor: conductor() }), referido: evaluarReferido(referido({}), PARAMETROS_V3), evaluadoEl: HOY } satisfies Validacion;
  // R8 y R9 (se verifican al contratar) no cuentan; R10 y P6 en revisar solo piden observación.
  assert.deepEqual(resumenDecision(limpio), { bloqueantes: 0, observar: 2 });
  assert.match(validarDecision("elegible", limpio, false, "") ?? "", /observación/);
  assert.equal(validarDecision("elegible", limpio, false, "Confirmado con GH"), null);
  const pagado = { ...limpio, referido: evaluarReferido(referido({ pagosPrevios: [{ fuente: "gestivo", detalle: "B2 pagado" }] }), PARAMETROS_V3) };
  assert.match(validarDecision("elegible", pagado, false, "x") ?? "", /excepción/);
});

test("R13: el registro debe ser antes de iniciar la selección (con días de gracia)", () => {
  const conProceso = (registradoEl: string) => est(evaluarReferido(referido({ registradoEl }), PARAMETROS_V3)).R13;
  // El proceso de ejemplo empezó el 2026-11-01.
  assert.equal(conProceso("2026-10-28"), "cumple");
  assert.equal(conProceso("2026-11-01"), "cumple");
  assert.equal(conProceso("2026-11-02"), "no_cumple");
  const gracia = { ...PARAMETROS_V3, referido: { ...PARAMETROS_V3.referido, tolerancia_registro_dias: 3 } };
  assert.equal(est(evaluarReferido(referido({ registradoEl: "2026-11-04" }), gracia)).R13, "cumple");
  assert.match(evaluarReferido(referido({ registradoEl: "2026-11-05" }), gracia).find((r) => r.codigo === "R13")!.dato, /tardío/);
  // En v2 no aplica.
  assert.equal(est(evaluarReferido(referido({ registradoEl: "2026-11-05" }), PARAMETROS_V2)).R13, undefined);
});

test("prerregistro sin proceso: R13 cumple y lo que sale del proceso queda por verificar", () => {
  const r = evaluarReferido(referido({ sinProceso: true, registradoEl: "2026-11-01", proceso: { id: "", fechaCreacion: "2026-11-01", simit: null } }), PARAMETROS_V3);
  assert.deepEqual([est(r).R6, est(r).R7, est(r).R8, est(r).R9, est(r).R13], ["revisar", "revisar", "revisar", "revisar", "cumple"]);
  // Los de contratación no cuentan al decidir: el prerregistro no queda bloqueado por ellos.
  assert.equal(resumenDecision({ padrino: [], referido: r, evaluadoEl: HOY }).bloqueantes, 0);
});

// ── Esquema según el tipo de referido ───────────────────────────────────────

const retirado = (fechaRetiro: string) => ({ estado: "RETIRADO", fechaIngreso: "2024-01-01", fechaRetiro });

test("esquema: nuevo con certificado A, sin certificado B (igual en v2 y v3)", () => {
  for (const p of [PARAMETROS_V2, PARAMETROS_V3]) {
    assert.equal(decidirEsquema({ conductor: null, causaRetiro: null, experienciaCertificada: true }, "2026-11-01", p).esquema, "A");
    assert.equal(decidirEsquema({ conductor: null, causaRetiro: null, experienciaCertificada: false }, "2026-11-01", p).esquema, "B");
  }
});

test("esquema v3: reintegro de 6 meses o más con retiro voluntario va por C, nunca por A", () => {
  const d = decidirEsquema({ conductor: retirado("2026-03-15"), causaRetiro: null, causaRetiroClave: "RENUNCIA_VOLUNTARIA", experienciaCertificada: true }, "2026-11-01", PARAMETROS_V3);
  assert.deepEqual([d.esquema, d.tipoIngreso, d.mesesFuera, d.sinBonificacion, d.revisar], ["C", "reintegro", 7, null, null]);
});

test("esquema v3: reintegro de menos de 6 meses o por justa causa no se bonifica; sin causa se revisa", () => {
  const corto = decidirEsquema({ conductor: retirado("2026-07-01"), causaRetiro: null, causaRetiroClave: "RENUNCIA_VOLUNTARIA" }, "2026-11-01", PARAMETROS_V3);
  assert.match(corto.sinBonificacion ?? "", /menos de 6 meses/);
  const justa = decidirEsquema({ conductor: retirado("2025-01-01"), causaRetiro: null, causaRetiroClave: "JUSTA_CAUSA" }, "2026-11-01", PARAMETROS_V3);
  assert.match(justa.sinBonificacion ?? "", /justa causa/);
  const empresa = decidirEsquema({ conductor: retirado("2025-01-01"), causaRetiro: null, causaRetiroClave: "FIN_CONTRATO" }, "2026-11-01", PARAMETROS_V3);
  assert.match(empresa.sinBonificacion ?? "", /voluntario/);
  const sinCausa = decidirEsquema({ conductor: retirado("2025-01-01"), causaRetiro: null, causaRetiroClave: null }, "2026-11-01", PARAMETROS_V3);
  assert.deepEqual([sinCausa.esquema, sinCausa.sinBonificacion], ["C", null]);
  assert.match(sinCausa.revisar ?? "", /causa/);
});

test("esquema v2: un reintegro se trata como antes (A o B por certificado)", () => {
  const d = decidirEsquema({ conductor: retirado("2026-07-01"), causaRetiro: null, causaRetiroClave: "JUSTA_CAUSA", experienciaCertificada: false }, "2026-11-01", PARAMETROS_V2);
  assert.deepEqual([d.esquema, d.sinBonificacion], ["B", null]);
});

// ── Hitos por beneficiario ──────────────────────────────────────────────────

test("hitos v3 por beneficiario: A tiene 5 filas, B 2 y C 4, con los montos del documento", () => {
  const filas = (e: "A" | "B" | "C") => hitosPorBeneficiario(PARAMETROS_V3, e, "2026-11-10").map((h) => `${h.numero}${h.beneficiario[0]}:${h.valor}@${h.fechaCausacion}`);
  assert.deepEqual(filas("A"), ["1p:100000@2026-12-10", "2p:200000@2027-01-10", "2r:100000@2027-01-10", "3p:200000@2027-02-10", "3r:100000@2027-02-10"]);
  assert.deepEqual(filas("B"), ["1p:100000@2026-12-10", "2p:100000@2027-02-10"]);
  assert.deepEqual(filas("C"), ["1p:100000@2026-12-10", "1r:100000@2026-12-10", "2p:100000@2027-02-10", "2r:100000@2027-02-10"]);
  assert.equal(hitosPorBeneficiario(PARAMETROS_V3, "B", null)[0].fechaCausacion, null);
});

const INGRESO = "2026-10-15";
const HITO = "2026-11-15";
const ok: HechosPermanencia = { referido: { estado: "ACTIVO", fechaRetiro: null }, padrinoConductor: { estado: "ACTIVO", fechaRetiro: null }, padrinoEmpleado: null, autorizacionEmpleado: null };
const padrinoRetirado: HechosPermanencia = { ...ok, padrinoConductor: { estado: "RETIRADO", fechaRetiro: "2026-11-01" } };

test("si el padrino se retira pierde lo suyo, pero el referido conserva lo propio", () => {
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", padrinoRetirado, { beneficiario: "padrino", modoEmpleados: "excluidos" }).estado, "no_causado");
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", padrinoRetirado, { beneficiario: "referido", modoEmpleados: "excluidos" }).estado, "por_aprobar");
});

test("si el referido se retira, no se causa lo de ninguno y se cancelan los siguientes", () => {
  const h = { ...ok, referido: { estado: "RETIRADO", fechaRetiro: "2026-11-10" } };
  for (const beneficiario of ["padrino", "referido"] as const) {
    const r = evaluarHito(HITO, INGRESO, "2026-11-20", h, { beneficiario, modoEmpleados: "excluidos" });
    assert.equal(r.estado === "no_causado" && r.cancelaSiguientes, true, beneficiario);
  }
});

test("v3: un empleado padrino vigente cobra sin estar en la lista de autorizados", () => {
  const emp: HechosPermanencia = { ...ok, padrinoConductor: null, padrinoEmpleado: { status: "activo", fechaRetiro: null }, autorizacionEmpleado: null };
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", emp, { modoEmpleados: "excluidos" }).estado, "por_aprobar");
  // En v2 (lista blanca) sigue exigiendo la autorización.
  assert.equal(evaluarHito(HITO, INGRESO, "2026-11-20", emp).estado, "no_causado");
});

test("pagos simulados v3 (A): si permanece se paga todo; el retiro del padrino no toca al referido", () => {
  const hitosA = hitosPorBeneficiario(PARAMETROS_V3, "A", "2026-12-01");
  const opc = { modoEmpleados: "excluidos" as const, padrinoDebeSeguirActivo: true };
  const todo = pagosSimulados(hitosA, "2026-12-01", {}, opc);
  assert.deepEqual(todo.totales, { padrino: 500000, referido: 200000, total: 700000 });
  // El referido se retira antes del mes 2: solo se paga el mes 1 (al padrino); lo demás se cancela.
  const r2 = pagosSimulados(hitosA, "2026-12-01", { referidoSeRetiraAntesDelMes: 2 }, opc);
  assert.deepEqual(r2.totales, { padrino: 100000, referido: 0, total: 100000 });
  assert.deepEqual(r2.pagos.map((p) => p.resultado), ["se_paga", "no_causado", "no_causado", "cancelado", "cancelado"]);
  // El padrino se retira antes del mes 3: pierde su mes 3, el referido cobra completo.
  const p3 = pagosSimulados(hitosA, "2026-12-01", { padrinoSeRetiraAntesDelMes: 3 }, opc);
  assert.deepEqual(p3.totales, { padrino: 300000, referido: 200000, total: 500000 });
});

test("pagos simulados v2 (B): el retiro del padrino deja el hito sin causar", () => {
  const hitosB = hitosPorBeneficiario(PARAMETROS_V2, "B", "2026-12-01");
  const p = pagosSimulados(hitosB, "2026-12-01", { padrinoSeRetiraAntesDelMes: 3 });
  assert.deepEqual(p.totales, { padrino: 100000, referido: 0, total: 100000 });
  assert.equal(p.pagos[1].fechaCausacion, "2027-03-01");
});

test("incentivos: el pago del referido va a su cédula con su propio concepto", () => {
  const base = { fechaPago: "2026-12-20", valor: 100000, esquema: "A", numero: 2, cedulaPadrino: "111", nombrePadrino: "PADRINO", cedulaReferido: "999", nombreReferido: "REFERIDO" };
  const p = filaIncentivo(base);
  assert.deepEqual([p.cedula, p.nombre, p.concepto], ["111", "PADRINO", "PLAN PADRINO A2 - REFERIDO 999"]);
  const r = filaIncentivo({ ...base, beneficiario: "referido" });
  assert.deepEqual([r.cedula, r.nombre, r.concepto, r.mes_entrega], ["999", "REFERIDO", "PLAN PADRINO A2 - BONO REFERIDO", "DICIEMBRE 2026"]);
});
