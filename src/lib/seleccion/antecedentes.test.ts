import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AJUSTE_DE_REGLA, REGLAS_POR_DEFECTO, REGLAS_TODO_A_REVISION, evaluarAntecedentes, hallazgoDe, permiteSeguir, reglasDeAjustes,
  type ReglasAntecedentes,
} from "./antecedentes";

const ok = (fuente: string, resultado: unknown) => ({ fuente, estado: "ok", resultado });

test("antecedentes: limpio solo con las cuatro fuentes sin hallazgos", () => {
  const limpias = [
    ok("policia", { has_records: false }),
    ok("procuraduria", { found: true, has_records: false }),
    ok("contraloria", { is_fiscal_responsible: false }),
    ok("rnmc", { found: true, full_name: "RODOLFO ENRIQUE MANJARRES DE AVILA", has_pending_measures: false }),
  ];
  assert.equal(evaluarAntecedentes(limpias).resultado, "limpio");
  // Falta una: pendiente (no se marca «Listo para citar»).
  assert.equal(evaluarAntecedentes(limpias.slice(0, 3)).resultado, "pendiente");
  // Una con hallazgo: Gestión Humana revisa.
  assert.equal(evaluarAntecedentes([...limpias.slice(1), ok("policia", { has_records: true })]).resultado, "hallazgo");
  // RNMC con fecha que no coincide: sin veredicto (pendiente), no limpio.
  const fecha = [...limpias.slice(0, 3), { fuente: "rnmc", estado: "error", resultado: { found: false }, error: "La fecha no coincide" }];
  const ev = evaluarAntecedentes(fecha);
  assert.equal(ev.resultado, "pendiente");
  assert.equal(ev.fuentes.find((f) => f.fuente === "rnmc")?.estado, "error");
  // En curso.
  assert.equal(evaluarAntecedentes([...limpias.slice(0, 3), { fuente: "rnmc", estado: "pendiente", resultado: { trabajo_id: "x" } }]).resultado, "pendiente");
});

test("antecedentes: lectura de cada fuente", () => {
  assert.equal(hallazgoDe("procuraduria", { found: false }), false);
  assert.equal(hallazgoDe("contraloria", { is_fiscal_responsible: true }), true);
  assert.equal(hallazgoDe("rnmc", { found: false, has_pending_measures: null }), null);
  // «El registro responde cualquier número»: limpio sin nombre no confirma a la persona...
  assert.equal(hallazgoDe("rnmc", { found: true, full_name: null, has_pending_measures: false }), null);
  // ...salvo que el RUNT ya la confirmó (el certificado de la Policía ya no imprime el nombre).
  assert.equal(hallazgoDe("rnmc", { found: true, full_name: null, has_pending_measures: false }, { identidadConfirmada: true }), false);
  assert.equal(hallazgoDe("rnmc", { found: false, full_name: null }, { identidadConfirmada: true }), null);
  assert.equal(hallazgoDe("rnmc", { found: true, full_name: "ANA PEREZ", has_pending_measures: true }), true);
  const sinNombre = evaluarAntecedentes([
    ok("policia", { has_records: false }),
    ok("procuraduria", { found: true, has_records: false }),
    ok("contraloria", { is_fiscal_responsible: false }),
    ok("rnmc", { found: true, full_name: null, has_pending_measures: false }),
  ]);
  assert.equal(sinNombre.resultado, "pendiente");
  const conRunt = evaluarAntecedentes(
    [
      ok("policia", { has_records: false }),
      ok("procuraduria", { found: true, has_records: false }),
      ok("contraloria", { is_fiscal_responsible: false }),
      ok("rnmc", { found: true, full_name: null, has_pending_measures: false }),
    ],
    { identidadConfirmada: true }
  );
  assert.equal(conRunt.resultado, "limpio");
  // RNMC opcional (ajuste en «no» mientras Croma no responde): sin respuesta del RNMC no frena, con la observación.
  const tres = [ok("policia", { has_records: false }), ok("procuraduria", { found: true, has_records: false }), ok("contraloria", { is_fiscal_responsible: false })];
  const sinRnmc = evaluarAntecedentes([...tres, { fuente: "rnmc", estado: "error", resultado: null, error: "timeout" }], { rnmcOpcional: true });
  assert.equal(sinRnmc.resultado, "limpio");
  assert.equal(sinRnmc.faltaRnmc, true);
  assert.equal(evaluarAntecedentes(tres, { rnmcOpcional: true }).resultado, "limpio");
  // Obligatorio (por defecto): sigue pendiente.
  assert.equal(evaluarAntecedentes([...tres, { fuente: "rnmc", estado: "error", resultado: null, error: "timeout" }]).resultado, "pendiente");
  // Un hallazgo del RNMC sigue siendo hallazgo aunque sea opcional.
  const conHallazgo = evaluarAntecedentes([...tres, ok("rnmc", { found: true, full_name: "ANA", has_pending_measures: true })], { rnmcOpcional: true });
  assert.equal(conHallazgo.resultado, "hallazgo");
  assert.equal(conHallazgo.faltaRnmc, undefined);
  // Si otra fuente falta, sigue pendiente.
  assert.equal(evaluarAntecedentes(tres.slice(0, 2), { rnmcOpcional: true }).resultado, "pendiente");
  assert.equal(hallazgoDe("policia", null), null);
});

// ── Reglas de Gestión Humana (entrega 3) ─────────────────────────────────────
const LIMPIAS = [
  ok("policia", { has_records: false }),
  ok("procuraduria", { found: true, has_records: false }),
  ok("contraloria", { is_fiscal_responsible: false }),
  ok("rnmc", { found: true, full_name: "ANA PEREZ", has_pending_measures: false }),
];
/** Las cuatro limpias, cambiando una fuente por la respuesta dada. */
const con = (fuente: string, resultado: unknown) => [...LIMPIAS.filter((c) => c.fuente !== fuente), ok(fuente, resultado)];
const medidas = (n: number, texto = "Multa tipo 2") => ({ found: true, full_name: "ANA PEREZ", has_pending_measures: true, pending_measures: Array.from({ length: n }, () => ({ descripcion: texto })) });
const fiscal = (...fallos: { amount: number; ruling_date: string }[]) => ({ is_fiscal_responsible: true, records: fallos });
const HOY = new Date("2026-11-20T12:00:00Z");
const veredicto = (consultas: ReturnType<typeof ok>[], reglas: ReglasAntecedentes = REGLAS_POR_DEFECTO) => evaluarAntecedentes(consultas, { reglas, hoy: HOY }).veredicto;

test("reglas: sin reglas todo hallazgo va a revisión, como antes de la entrega 3", () => {
  assert.equal(evaluarAntecedentes(LIMPIAS).veredicto, "limpio");
  assert.equal(evaluarAntecedentes(con("contraloria", fiscal())).veredicto, "revision");
  assert.equal(evaluarAntecedentes(con("rnmc", medidas(1))).veredicto, "revision");
  assert.equal(evaluarAntecedentes(LIMPIAS.slice(0, 3)).veredicto, "pendiente");
});

test("reglas por defecto (prudentes): Policía y Procuraduría a revisión, Contraloría descarta, RNMC tolera hasta 2", () => {
  assert.equal(veredicto(LIMPIAS), "limpio");
  assert.equal(veredicto(con("policia", { has_records: true })), "revision");
  assert.equal(veredicto(con("procuraduria", { found: true, has_records: true })), "revision");
  assert.equal(veredicto(con("contraloria", fiscal({ amount: 5_000_000, ruling_date: "2020-01-01" }))), "descarta");
  assert.equal(veredicto(con("rnmc", medidas(1))), "tolerable");
  assert.equal(veredicto(con("rnmc", medidas(2))), "tolerable");
  assert.equal(veredicto(con("rnmc", medidas(3))), "revision");
  // El resultado «con o sin hallazgo» no cambia con las reglas: lo sigue leyendo el Plan Padrino.
  assert.equal(evaluarAntecedentes(con("rnmc", medidas(1)), { reglas: REGLAS_POR_DEFECTO }).resultado, "hallazgo");
});

test("reglas: gana la acción más severa y un tolerable no tapa una fuente que falta", () => {
  const dos = [...con("rnmc", medidas(1)).filter((c) => c.fuente !== "policia"), ok("policia", { has_records: true })];
  assert.equal(veredicto(dos), "revision");
  const tres = [...dos.filter((c) => c.fuente !== "contraloria"), ok("contraloria", fiscal())];
  assert.equal(veredicto(tres), "descarta");
  assert.equal(veredicto(con("rnmc", medidas(1)).filter((c) => c.fuente !== "policia")), "pendiente");
  // Con la fuente que falta como opcional, sí queda tolerable.
  const ev = evaluarAntecedentes(con("rnmc", medidas(1)).filter((c) => c.fuente !== "policia"), { reglas: REGLAS_POR_DEFECTO, opcionales: ["policia"] });
  assert.equal(ev.veredicto, "tolerable");
});

test("reglas de Contraloría: tolerancia por valor y por antigüedad del fallo", () => {
  const porValor = { ...REGLAS_POR_DEFECTO, contraloriaValorTolerado: 2_000_000 };
  assert.equal(veredicto(con("contraloria", fiscal({ amount: 1_500_000, ruling_date: "2025-06-01" })), porValor), "tolerable");
  assert.equal(veredicto(con("contraloria", fiscal({ amount: 2_500_000, ruling_date: "2025-06-01" })), porValor), "descarta");
  // Todos los fallos deben caber: uno grande basta para no tolerar.
  assert.equal(veredicto(con("contraloria", fiscal({ amount: 100_000, ruling_date: "2025-06-01" }, { amount: 9_000_000, ruling_date: "2025-06-01" })), porValor), "descarta");
  const porFecha = { ...REGLAS_POR_DEFECTO, contraloriaAniosTolerado: 5 };
  assert.equal(veredicto(con("contraloria", fiscal({ amount: 9_000_000, ruling_date: "2019-03-10" })), porFecha), "tolerable");
  assert.equal(veredicto(con("contraloria", fiscal({ amount: 9_000_000, ruling_date: "2023-03-10" })), porFecha), "descarta");
  // Sin el detalle de los fallos (revisión a mano) no hay cómo tolerar: la acción general.
  assert.equal(veredicto(con("contraloria", { is_fiscal_responsible: true }), { ...porValor, ...porFecha }), "descarta");
  assert.equal(veredicto(con("contraloria", fiscal()), { ...REGLAS_POR_DEFECTO, contraloria: "tolera" }), "tolerable");
});

test("reglas del RNMC: máximo, exceso, palabras que nunca se toleran y hallazgo sin lista", () => {
  assert.equal(veredicto(con("rnmc", medidas(1)), { ...REGLAS_POR_DEFECTO, rnmcMaxToleradas: 0 }), "revision");
  assert.equal(veredicto(con("rnmc", medidas(3)), { ...REGLAS_POR_DEFECTO, rnmcExceso: "descarta" }), "descarta");
  const palabras = { ...REGLAS_POR_DEFECTO, rnmcPalabras: ["riña", "arma"] };
  const ev = evaluarAntecedentes(con("rnmc", medidas(1, "Art. 27 num. 1: RIÑAS en vía pública")), { reglas: palabras });
  assert.equal(ev.veredicto, "revision");
  assert.match(ev.fuentes.find((f) => f.fuente === "rnmc")!.motivo!, /«riña»/);
  assert.equal(veredicto(con("rnmc", medidas(1, "Consumo de bebidas en espacio público")), palabras), "tolerable");
  // «Lo revisé a mano» con hallazgo no trae la lista: no se cuenta, y nunca se tolera a ciegas.
  const manual = { found: true, full_name: "ANA PEREZ", has_pending_measures: true };
  assert.equal(veredicto(con("rnmc", manual)), "revision");
  assert.equal(veredicto(con("rnmc", manual), { ...REGLAS_POR_DEFECTO, rnmcExceso: "tolera" }), "revision");
});

test("reglasDeAjustes: lee los ajustes ant_* y lo que falta queda en revisión", () => {
  assert.deepEqual(reglasDeAjustes([]), REGLAS_TODO_A_REVISION);
  const ajustes = Object.entries(REGLAS_POR_DEFECTO).map(([campo, valor]) => ({ clave: AJUSTE_DE_REGLA[campo as keyof ReglasAntecedentes], valor }));
  assert.deepEqual(reglasDeAjustes(ajustes), REGLAS_POR_DEFECTO);
  assert.equal(reglasDeAjustes([{ clave: "ant_policia_accion", valor: "lo que sea" }]).policia, "revision");
  assert.equal(reglasDeAjustes([{ clave: "ant_rnmc_max_toleradas", valor: -3 }]).rnmcMaxToleradas, 0);
});

test("permiteSeguir: limpio o tolerable siguen; revisión y descarte, solo aprobados por una persona", () => {
  assert.equal(permiteSeguir("limpio"), true);
  assert.equal(permiteSeguir("tolerable"), true);
  assert.equal(permiteSeguir("revision"), false);
  assert.equal(permiteSeguir("descarta"), false);
  assert.equal(permiteSeguir("revision", "aprobado"), true);
  assert.equal(permiteSeguir("descarta", "aprobado"), true);
  assert.equal(permiteSeguir("tolerable", "rechazado"), false);
  // Aprobar no salta una fuente obligatoria que todavía no responde.
  assert.equal(permiteSeguir("pendiente", "aprobado"), false);
  assert.equal(permiteSeguir(null), false);
});

test("fuentes opcionales: la que no responde no frena, queda en «faltan»; con hallazgo sigue siendo hallazgo", () => {
  const limpia = (fuente: string, resultado: unknown) => ({ fuente, estado: "ok", resultado });
  const policia = limpia("policia", { has_records: false });
  const procu = limpia("procuraduria", { has_records: false });
  const contra = limpia("contraloria", { is_fiscal_responsible: false });
  const rnmc = limpia("rnmc", { found: true, full_name: "ANA", has_pending_measures: false });
  // La Contraloría caída y obligatoria: pendiente.
  const caida = { fuente: "contraloria", estado: "error", resultado: null, error: "timeout" };
  assert.equal(evaluarAntecedentes([policia, procu, caida, rnmc]).resultado, "pendiente");
  // Opcional: limpio, con la observación.
  const r = evaluarAntecedentes([policia, procu, caida, rnmc], { opcionales: ["contraloria"] });
  assert.equal(r.resultado, "limpio");
  assert.deepEqual(r.faltan, ["contraloria"]);
  // Opcional pero respondió limpia: no falta nada.
  assert.equal(evaluarAntecedentes([policia, procu, contra, rnmc], { opcionales: ["contraloria", "policia"] }).faltan, undefined);
  // Opcional y sin consultar todavía: tampoco frena.
  assert.deepEqual(evaluarAntecedentes([policia, rnmc], { opcionales: ["procuraduria", "contraloria"] }).faltan, ["procuraduria", "contraloria"]);
  // Opcional con hallazgo: manda el hallazgo.
  const h = evaluarAntecedentes([limpia("policia", { has_records: true }), procu, contra, rnmc], { opcionales: ["policia"] });
  assert.equal(h.resultado, "hallazgo");
  assert.equal(h.faltan, undefined);
  // Todas opcionales y ninguna respondió: limpio con las cuatro por revisar.
  assert.deepEqual(evaluarAntecedentes([], { opcionales: ["policia", "procuraduria", "contraloria", "rnmc"] }).faltan, ["policia", "procuraduria", "contraloria", "rnmc"]);
});
