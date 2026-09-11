/**
 * Pruebas de las reglas de radicación (fase 4).
 *
 *   npm run test:incapacidades
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorEntidad,
  bajoUmbral,
  contarPestanas,
  excepcionValida,
  impedimentosParaRadicar,
  normalizarCodigo,
  pestanaDe,
  type DatosRadicar,
  type FilaCobro,
} from "./radicacion-reglas";

const listo: DatosRadicar = {
  estado: "liquidado", valor_reclamado: 130_000, liquidacion_id: "l1", entidad_catalogo_id: "e1", entidad_nombre: "NUEVA EPS",
  cobrable: true, entidad_dias_min_cobro: 4, dias_incapacidad: 5, radicacion_id: null, radicacion_estado: null, matriz_eliminada_at: null,
};

test("radicar exige liquidación vigente, entidad homologada y ningún radicado activo", () => {
  assert.deepEqual(impedimentosParaRadicar(listo), []);
  const campos = (v: DatosRadicar) => impedimentosParaRadicar(v).map((i) => i.campo);
  assert.deepEqual(campos({ ...listo, estado: "en_completar", liquidacion_id: null, valor_reclamado: null }), ["estado", "liquidacion"]);
  assert.deepEqual(campos({ ...listo, entidad_catalogo_id: null }), ["entidad"]);
  assert.deepEqual(campos({ ...listo, radicacion_id: "r1", radicacion_estado: "radicada" }), ["radicacion_activa"]);
  assert.deepEqual(campos({ ...listo, radicacion_id: "r1", radicacion_estado: "solicitada" }), ["radicacion_activa"]);
  // Una devuelta o anulada no aparece como activa en la vista, así que no impide radicar otra vez.
  assert.deepEqual(campos({ ...listo, radicacion_id: null, radicacion_estado: null }), []);
  assert.deepEqual(campos({ ...listo, matriz_eliminada_at: "2026-09-10T00:00:00Z" }), ["matriz"]);
  // Estado radicado (tras una devolución) también permite radicar de nuevo.
  assert.deepEqual(campos({ ...listo, estado: "radicado" }), []);
});

test("bajo el umbral de su entidad se radica solo con excepción de al menos 10 caracteres", () => {
  assert.equal(bajoUmbral({ cobrable: false }), true);
  assert.equal(bajoUmbral({ cobrable: true }), false);
  assert.equal(excepcionValida("corto"), false);
  assert.equal(excepcionValida("La EPS acepta desde el día 1 por convenio"), true);
  assert.equal(excepcionValida(null), false);
});

test("el código de radicación se normaliza y se valida", () => {
  assert.equal(normalizarCodigo("  rad-2026/0001  "), "RAD-2026/0001");
  assert.equal(normalizarCodigo(""), null);
  assert.equal(normalizarCodigo(null), null);
  assert.throws(() => normalizarCodigo("ab"), /entre 3 y 40/);
  assert.throws(() => normalizarCodigo("código con ñ"), /entre 3 y 40/);
  assert.throws(() => normalizarCodigo("-123"), /entre 3 y 40/);
});

const fila = (p: Partial<FilaCobro> & { id: string }): FilaCobro => ({
  estado: "liquidado", cobrable: true, liquidacion_id: "l", valor_reclamado: 100_000, radicacion_id: null, radicacion_estado: null,
  pendiente_homologacion: false, persona_fuente: "conductores", matriz_cambio_pendiente: false, matriz_eliminada_at: null, devoluciones: 0,
  entidad_catalogo_id: "e1", entidad_nombre: "EPS SURA", entidad_clase: "EPS", pagador_recibido: "EPS SURA", dias_incapacidad: 5, dias_entidad: 3,
  ...p,
});

test("cada expediente cae en una sola pestaña de la bandeja de cobro", () => {
  assert.equal(pestanaDe(fila({ id: "1" })), "por_radicar");
  assert.equal(pestanaDe(fila({ id: "2", radicacion_id: "r", radicacion_estado: "solicitada" })), "solicitadas");
  assert.equal(pestanaDe(fila({ id: "3", radicacion_id: "r", radicacion_estado: "radicada", estado: "radicado" })), "radicadas");
  assert.equal(pestanaDe(fila({ id: "4", devoluciones: 1 })), "devueltas");
  assert.equal(pestanaDe(fila({ id: "5", pendiente_homologacion: true })), "incidencias");
  assert.equal(pestanaDe(fila({ id: "6", persona_fuente: "sin_resolver" })), "incidencias");
  assert.equal(pestanaDe(fila({ id: "7", matriz_cambio_pendiente: true })), "incidencias");
  assert.equal(pestanaDe(fila({ id: "8", cobrable: false })), "no_cobrables");
  // Sin liquidar todavía: es una incidencia de gestión, no "por radicar".
  assert.equal(pestanaDe(fila({ id: "9", estado: "recibido", liquidacion_id: null, valor_reclamado: null })), "incidencias");
  // Una radicada bajo umbral con excepción sigue siendo radicada, no "no cobrable".
  assert.equal(pestanaDe(fila({ id: "10", cobrable: false, radicacion_id: "r", radicacion_estado: "radicada", estado: "radicado" })), "radicadas");
  const c = contarPestanas([fila({ id: "a" }), fila({ id: "b" }), fila({ id: "c", cobrable: false })]);
  assert.equal(c.por_radicar, 2);
  assert.equal(c.no_cobrables, 1);
});

test("la bandeja agrupa por entidad con importes, de mayor a menor valor", () => {
  const g = agruparPorEntidad([
    fila({ id: "1", valor_reclamado: 100_000 }),
    fila({ id: "2", valor_reclamado: 50_000, dias_incapacidad: 3, dias_entidad: 1 }),
    fila({ id: "3", entidad_catalogo_id: "e2", entidad_nombre: "ARL BOLIVAR", entidad_clase: "ARL", valor_reclamado: 400_000 }),
    fila({ id: "4", entidad_catalogo_id: null, entidad_nombre: null, pagador_recibido: "SALUD TOTAL S.A.", valor_reclamado: null }),
  ]);
  assert.deepEqual(g.map((x) => x.entidad), ["ARL BOLIVAR", "EPS SURA", "SALUD TOTAL S.A."]);
  const sura = g[1];
  assert.equal(sura.incapacidades, 2);
  assert.equal(sura.dias, 8);
  assert.equal(sura.diasEntidad, 4);
  assert.equal(sura.valorReclamado, 150_000);
  assert.equal(g[2].entidadId, null, "sin homologar se agrupa por el pagador recibido");
  assert.equal(g[2].valorReclamado, 0);
});
