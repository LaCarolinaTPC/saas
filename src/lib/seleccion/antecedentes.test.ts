import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarAntecedentes, hallazgoDe } from "./antecedentes";

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
