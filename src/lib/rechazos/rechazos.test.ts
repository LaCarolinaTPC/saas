import { test } from "node:test";
import assert from "node:assert/strict";
import { CAUSA_OTRA, buscarCausa, causaElegida, normalizarCausa, validarRechazo } from "./causas";
import { SIN_CAUSA, SIN_FASE, mesBogota, resumirRechazos, type FilaRechazo } from "./reporte";

test("normaliza mayúsculas, tildes, eñes y espacios", () => {
  assert.equal(normalizarCausa("  Exámenes   MÉDICOS "), "examenes medicos");
  assert.equal(normalizarCausa("Ñoño"), "nono");
});

test("busca la causa existente aunque se escriba distinto", () => {
  const cat = [{ id: "1", nombre: "Desistimiento" }, { id: "2", nombre: "Exámenes médicos" }];
  assert.equal(buscarCausa(cat, "examenes medicos")?.id, "2");
  assert.equal(buscarCausa(cat, "Se fue a otra ciudad"), null);
  assert.equal(buscarCausa(cat, "   "), null);
});

test("valida causa obligatoria, Otra sin texto y largos", () => {
  assert.match(validarRechazo("") ?? "", /Elija la causa/);
  assert.match(validarRechazo(CAUSA_OTRA) ?? "", /causa nueva/);
  assert.match(validarRechazo("x".repeat(81)) ?? "", /80/);
  assert.match(validarRechazo("Desistimiento", "x".repeat(2001)) ?? "", /2000/);
  assert.equal(validarRechazo("Desistimiento", null), null);
});

test("Otra toma el texto escrito; el resto, la opción elegida", () => {
  assert.equal(causaElegida(CAUSA_OTRA, "  No tiene   licencia C2 "), "No tiene licencia C2");
  assert.equal(causaElegida(CAUSA_OTRA, ""), "");
  assert.equal(causaElegida("Desistimiento", "ignorado"), "Desistimiento");
});

test("el mes va en hora de Bogotá", () => {
  // 1-nov 03:00 UTC es todavía 31-oct en Bogotá.
  assert.equal(mesBogota("2026-11-01T03:00:00Z"), "2026-10");
});

const fila = (p: Partial<FilaRechazo>): FilaRechazo => ({
  id: Math.random().toString(36),
  registrado_at: "2026-10-10T15:00:00Z",
  nombre: null, cedula: null, vacante: "Conductor",
  fase_origen: null, fase_origen_label: null, causa: null, nota: null,
  origen: "pipeline", registrado_por_email: null,
  revertido_at: null, revertido_por_email: null, revertido_a_fase: null,
  ...p,
});

test("resume por fase en orden del pipeline, causa y matriz, sin contar revertidos", () => {
  const etapas = [
    { key: "recibido", label: "Recibido", orden: 0 },
    { key: "en_examenes", label: "Exámenes", orden: 2 },
  ];
  const filas = [
    fila({ fase_origen: "en_examenes", causa: "Exámenes médicos" }),
    fila({ fase_origen: "en_examenes", causa: "Exámenes médicos" }),
    fila({ fase_origen: "recibido", causa: "Desistimiento", registrado_at: "2026-09-05T15:00:00Z" }),
    fila({ fase_origen: null, causa: null, origen: "historico" }),
    fila({ fase_origen: "recibido", causa: "Desistimiento", revertido_at: "2026-10-11T00:00:00Z" }),
  ];
  const r = resumirRechazos(filas, etapas);
  assert.equal(r.total, 4);
  assert.equal(r.revertidos, 1);
  assert.deepEqual(r.porFase.map((c) => [c.etiqueta, c.total]), [["Recibido", 1], ["Exámenes", 2], [SIN_FASE, 1]]);
  assert.equal(r.porFase[1].pct, 50);
  assert.deepEqual(r.porCausa.map((c) => c.etiqueta), ["Exámenes médicos", "Desistimiento", SIN_CAUSA]);
  assert.deepEqual(r.matriz.celdas, [[0, 1, 0], [2, 0, 0], [0, 0, 1]]);
  assert.deepEqual(r.mensual, [{ mes: "2026-09", total: 1 }, { mes: "2026-10", total: 3 }]);
  assert.equal(r.sinFase, 1);
  assert.equal(r.sinCausa, 1);
  assert.match(r.analisis[0], /Exámenes: 2 de 4 \(50%\), sobre todo por "Exámenes médicos"/);
});

test("una fase que ya no existe usa la etiqueta guardada", () => {
  const r = resumirRechazos([fila({ fase_origen: "aprobado", fase_origen_label: "Aprobado", causa: "X" })], []);
  assert.equal(r.porFase[0].etiqueta, "Aprobado");
});

test("sin rechazos no hay análisis ni división por cero", () => {
  const r = resumirRechazos([], []);
  assert.equal(r.total, 0);
  assert.deepEqual(r.analisis, []);
  assert.deepEqual(r.matriz.celdas, []);
});
