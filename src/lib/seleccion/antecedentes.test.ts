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
  // «El registro responde cualquier número»: limpio sin nombre no confirma a la persona.
  assert.equal(hallazgoDe("rnmc", { found: true, full_name: null, has_pending_measures: false }), null);
  assert.equal(hallazgoDe("rnmc", { found: true, full_name: "ANA PEREZ", has_pending_measures: true }), true);
  const sinNombre = evaluarAntecedentes([
    ok("policia", { has_records: false }),
    ok("procuraduria", { found: true, has_records: false }),
    ok("contraloria", { is_fiscal_responsible: false }),
    ok("rnmc", { found: true, full_name: null, has_pending_measures: false }),
  ]);
  assert.equal(sinNombre.resultado, "pendiente");
  assert.equal(hallazgoDe("policia", null), null);
});
