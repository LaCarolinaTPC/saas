import { test } from "node:test";
import assert from "node:assert/strict";
import { efectoExamen, examenAplazado, examenNoApto, examenesAptos, type ExamenGuardado } from "./examenes";
import { antecedentesPermitenContratar, condicionesContratar, mensajeFaltan, type DatosContratar } from "./contratacion";

const apto1: ExamenGuardado = { fase: 1, resultado: "apto" };
const apto2: ExamenGuardado = { fase: 2, resultado: "apto" };

test("exámenes: fase 1 apta pasa a fase 2 con cita; fase 2 apta pasa a reconocimiento de ruta", () => {
  assert.deepEqual(efectoExamen(1, "apto", "en_examenes", []), { estado: "en_examenes_fase2", citarFase2: true, proponeCierre: false });
  assert.deepEqual(efectoExamen(2, "apto", "en_examenes_fase2", [apto1]), { estado: "reconocimiento_ruta", citarFase2: false, proponeCierre: false });
});

test("exámenes: no apto propone el cierre y nunca cierra solo", () => {
  assert.deepEqual(efectoExamen(1, "no_apto", "en_examenes", []), { estado: null, citarFase2: false, proponeCierre: true });
  assert.deepEqual(efectoExamen(2, "no_apto", "en_examenes_fase2", [apto1]), { estado: null, citarFase2: false, proponeCierre: true });
});

test("exámenes: aplazado no cierra ni avanza; después se registra el definitivo (Salud Ocupacional, 21-nov-2026)", () => {
  assert.deepEqual(efectoExamen(2, "aplazado", "en_examenes_fase2", [apto1]), { estado: null, citarFase2: false, proponeCierre: false });
  assert.deepEqual(efectoExamen(1, "aplazado", "en_examenes", []), { estado: null, citarFase2: false, proponeCierre: false });
  // La fase 1 aplazada no habilita la fase 2.
  assert.ok("error" in efectoExamen(2, "apto", "en_examenes", [{ fase: 1, resultado: "aplazado" }]));
  // Llega el definitivo: apto avanza como siempre.
  assert.deepEqual(efectoExamen(2, "apto", "en_examenes_fase2", [apto1, { fase: 2, resultado: "aplazado" }]), { estado: "reconocimiento_ruta", citarFase2: false, proponeCierre: false });
  assert.equal(examenAplazado([apto1, { fase: 2, resultado: "aplazado", observacion: "hemograma" }])?.observacion, "hemograma");
  assert.equal(examenesAptos([apto1, { fase: 2, resultado: "aplazado" }]), false);
});

test("exámenes: la fase 2 exige la 1 apta; corregir no mueve el proceso hacia atrás; cerrado no se toca", () => {
  assert.ok("error" in efectoExamen(2, "apto", "en_examenes", []));
  assert.ok("error" in efectoExamen(2, "apto", "en_examenes_fase2", [{ fase: 1, resultado: "no_apto" }]));
  assert.deepEqual(efectoExamen(1, "apto", "reconocimiento_ruta", [apto1, apto2]), { estado: null, citarFase2: false, proponeCierre: false });
  assert.ok("error" in efectoExamen(1, "apto", "cierre", []));
  assert.ok("error" in efectoExamen(1, "talvez" as never, "en_examenes", []));
});

test("examenesAptos y examenNoApto", () => {
  assert.equal(examenesAptos([apto1, apto2]), true);
  assert.equal(examenesAptos([apto1]), false);
  assert.equal(examenNoApto([apto1, { fase: 2, resultado: "no_apto" }])?.fase, 2);
  assert.equal(examenNoApto([apto1]), null);
});

const BASE: DatosContratar = {
  examenes: [apto1, apto2],
  rutasAprendidas: 2,
  rutasMinimas: 2,
  reingreso: false,
  itemsCarpeta: ["Hoja de vida", "Carta laboral"],
  carpeta: [{ item: "Hoja de vida", estado: "validado" }, { item: "Carta laboral", estado: "validado" }],
  aprobada: true,
  exigePsicotecnica: false,
  psicotecnica: null,
};

test("contratar: con todo cumplido se puede", () => {
  const r = condicionesContratar(BASE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.faltan, []);
  assert.ok(!r.condiciones.some((c) => c.id === "psicotecnica"));
});

test("contratar: cada condición que falta se dice", () => {
  const r = condicionesContratar({
    ...BASE,
    examenes: [apto1],
    rutasAprendidas: 1,
    carpeta: [{ item: "Hoja de vida", estado: "recibido" }],
    aprobada: false,
  });
  assert.equal(r.ok, false);
  assert.equal(r.faltan.length, 4);
  assert.match(r.faltan.join(" "), /fase 2: sin resultado/);
  assert.match(r.faltan.join(" "), /1 de 2/);
  // «Recibido» no basta: hay que validarlo.
  assert.match(r.faltan.join(" "), /Hoja de vida, Carta laboral/);
  assert.match(mensajeFaltan(r.faltan), /contratar con excepción/);
});

test("contratar: el reingreso no necesita rutas y la psicotécnica solo cuenta si se exige", () => {
  assert.equal(condicionesContratar({ ...BASE, rutasAprendidas: 0, reingreso: true }).ok, true);
  assert.equal(condicionesContratar({ ...BASE, exigePsicotecnica: true }).ok, false);
  assert.equal(condicionesContratar({ ...BASE, exigePsicotecnica: true, psicotecnica: "apto" }).ok, true);
  assert.equal(condicionesContratar({ ...BASE, exigePsicotecnica: true, psicotecnica: "no_apto" }).ok, false);
});

test("contratar: los antecedentes sin decidir frenan la contratación (23-nov-2026)", () => {
  const con = (veredicto: Parameters<typeof antecedentesPermitenContratar>[0]["veredicto"], decision: string | null = null, legado: string | null = null) =>
    condicionesContratar({ ...BASE, antecedentes: { veredicto, decision, legado } });
  assert.equal(con("limpio").ok, true);
  assert.equal(con("tolerable").ok, true);
  // Hallazgo en revisión o que descarta: solo con la aprobación de una persona.
  assert.equal(con("revision").ok, false);
  assert.equal(con("descarta").ok, false);
  assert.equal(con("revision", "aprobado").ok, true);
  assert.equal(con("descarta", "aprobado").ok, true);
  assert.equal(con("limpio", "rechazado").ok, false);
  // Faltan fuentes: no.
  assert.equal(con("pendiente").ok, false);
  assert.equal(con(null).ok, false);
  // Procesos de antes de la entrega 3, sin consultas: vale lo puesto a mano.
  assert.equal(con(null, null, "ok").ok, true);
  assert.equal(con(null, null, "con_antecedentes").ok, false);
  const r = con("revision");
  assert.equal(r.condiciones[0].id, "antecedentes");
  assert.match(r.faltan[0], /^antecedentes resueltos \(.*decisión de una persona\)$/);
  // Sin el dato (llamadas de antes) no se exige.
  assert.equal(condicionesContratar(BASE).condiciones.some((c) => c.id === "antecedentes"), false);
});
