/**
 * Pruebas del requisito de semanas cotizadas para cobrar a la EPS
 * (migración 20260929221301). La regla de días corre en la base
 * (`incapacidad_requisito_semanas`, con sus casos de 27/28/29 días en la
 * comprobación de la migración); aquí se prueba lo que la app hace con el
 * resultado: bloquear, clasificar, contar y dejar a la ARL por fuera.
 *
 *   npm run test:incapacidades
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExpedienteVista } from "./expedientes";
import { resumirBandeja } from "./expedientes";
import { bajoUmbral, impedimentosParaRadicar, pestanaDe, type DatosRadicar, type FilaCobro } from "./radicacion-reglas";
import { acreditacionValida, faltanSemanas, mensajeSemanas, puedeAcreditar } from "./semanas-reglas";
import { agregarTablero, type FilaTablero } from "./tablero-reglas";

const listo: DatosRadicar = {
  estado: "liquidado", valor_reclamado: 130_000, liquidacion_id: "l1", entidad_catalogo_id: "e1", entidad_nombre: "SALUD TOTAL",
  cobrable: true, cumple_umbral: true, entidad_dias_min_cobro: 3, dias_incapacidad: 3, radicacion_id: null, radicacion_estado: null,
  matriz_eliminada_at: null, requisito_semanas: "cumple", semanas_min_cotizacion: 4, dias_previos_vinculacion: 400, fecha_vinculacion: "2025-08-01",
};

test("la EPS sin 4 semanas cotizadas no se habilita para cobro", () => {
  const v: DatosRadicar = { ...listo, cobrable: false, requisito_semanas: "no_cumple", dias_previos_vinculacion: 11, fecha_vinculacion: "2026-09-11" };
  const imp = impedimentosParaRadicar(v);
  assert.deepEqual(imp.map((i) => i.campo), ["semanas"]);
  assert.match(imp[0].mensaje, /11 día\(s\).*4 semanas \(28 días\)/);
  // No es un caso de umbral: la excepción escrita no aplica y no lo salta.
  assert.equal(bajoUmbral(v), false);
});

test("sin fecha de vinculación la EPS también queda bloqueada", () => {
  const v: DatosRadicar = { ...listo, cobrable: false, requisito_semanas: "sin_dato", dias_previos_vinculacion: null, fecha_vinculacion: null };
  assert.deepEqual(impedimentosParaRadicar(v).map((i) => i.campo), ["semanas"]);
  assert.match(mensajeSemanas(v)!, /No hay fecha de vinculación/);
});

test("la ARL nunca se bloquea por semanas, sin importar la antigüedad ni la falta de fecha", () => {
  for (const dias of [1, 27, null]) {
    const v: DatosRadicar = { ...listo, entidad_nombre: "ARL BOLIVAR", requisito_semanas: "no_aplica", dias_previos_vinculacion: dias, fecha_vinculacion: dias == null ? null : "2026-09-01" };
    assert.deepEqual(impedimentosParaRadicar(v), [], `ARL con ${dias ?? "sin"} días`);
    assert.equal(faltanSemanas(v), false);
    assert.equal(puedeAcreditar(v), false);
  }
});

test("cumple o acreditado por RRHH se radica como siempre", () => {
  assert.deepEqual(impedimentosParaRadicar(listo), []);
  assert.deepEqual(impedimentosParaRadicar({ ...listo, requisito_semanas: "acreditado", dias_previos_vinculacion: 5 }), []);
  assert.equal(puedeAcreditar({ requisito_semanas: "acreditado" }), false);
  assert.equal(puedeAcreditar({ requisito_semanas: "no_cumple" }), true);
});

test("sin la migración (columna ausente) no se bloquea nada y el umbral sale de cobrable", () => {
  const { requisito_semanas: _r, cumple_umbral: _u, ...antes } = listo;
  void _r; void _u;
  assert.deepEqual(impedimentosParaRadicar(antes as DatosRadicar), []);
  assert.equal(bajoUmbral({ cobrable: false }), true);
  assert.equal(bajoUmbral({ cobrable: true }), false);
});

test("el umbral y las semanas se miran por separado: bajo umbral con semanas sigue pidiendo excepción", () => {
  const v: DatosRadicar = { ...listo, cobrable: false, cumple_umbral: false, dias_incapacidad: 2 };
  assert.equal(bajoUmbral(v), true);
  assert.deepEqual(impedimentosParaRadicar(v), []);
});

const fila = (p: Partial<FilaCobro> & { id: string }): FilaCobro => ({
  estado: "liquidado", cobrable: true, liquidacion_id: "l", valor_reclamado: 100_000, radicacion_id: null, radicacion_estado: null,
  pendiente_homologacion: false, persona_fuente: "conductores", matriz_cambio_pendiente: false, matriz_eliminada_at: null, devoluciones: 0,
  entidad_catalogo_id: "e1", entidad_nombre: "EPS SURA", entidad_clase: "EPS", pagador_recibido: "EPS SURA", dias_incapacidad: 3, dias_entidad: 1,
  requisito_semanas: "cumple",
  ...p,
});

test("en la bandeja de cobro: sin radicar va a no cobrables; ya radicada o solicitada va a incidencias", () => {
  assert.equal(pestanaDe(fila({ id: "1", cobrable: false, requisito_semanas: "no_cumple" })), "no_cobrables");
  assert.equal(pestanaDe(fila({ id: "2", cobrable: false, requisito_semanas: "no_cumple", radicacion_id: "r", radicacion_estado: "radicada", estado: "radicado" })), "incidencias");
  assert.equal(pestanaDe(fila({ id: "3", cobrable: false, requisito_semanas: "sin_dato", radicacion_id: "r", radicacion_estado: "solicitada" })), "incidencias");
  assert.equal(pestanaDe(fila({ id: "4", requisito_semanas: "no_aplica", radicacion_id: "r", radicacion_estado: "radicada", estado: "radicado" })), "radicadas");
  assert.equal(pestanaDe(fila({ id: "5", requisito_semanas: "acreditado" })), "por_radicar");
});

test("la acreditación exige motivo y soporte", () => {
  assert.match(acreditacionValida("corto", "a1")!, /mínimo 10/);
  assert.match(acreditacionValida("Cotizaba con Coomotor hasta agosto", null)!, /soporte/);
  assert.equal(acreditacionValida("Cotizaba con Coomotor hasta agosto", "a1"), null);
});

test("la bandeja y el tablero cuentan solo las EPS sin semanas y su valor", () => {
  const base = { valor_reclamado_ajustado: null, persona_fuente: "conductores", pendiente_homologacion: false, salario_base: 1, matriz_cambio_pendiente: false, estado: "liquidado" };
  const filas = [
    { ...base, cobrable: false, requisito_semanas: "no_cumple", valor_reclamado: 90_000, valor_entidad: 90_000 },
    { ...base, cobrable: false, requisito_semanas: "sin_dato", valor_reclamado: null, valor_entidad: null },
    { ...base, cobrable: true, requisito_semanas: "no_aplica", valor_reclamado: 500_000, valor_entidad: 500_000 },
    { ...base, cobrable: true, requisito_semanas: "cumple", valor_reclamado: 70_000, valor_entidad: 70_000 },
  ] as unknown as ExpedienteVista[];
  const r = resumirBandeja(filas);
  assert.equal(r.sinSemanas, 2);
  assert.equal(r.valorSinSemanas, 90_000);

  const t = agregarTablero(filas as unknown as FilaTablero[]).total;
  assert.equal(t.sinSemanas, 2);
  assert.equal(t.valorSinSemanas, 90_000);
  // Lo que la EPS no paga no infla lo reclamado ni lo que queda sin radicar.
  assert.equal(t.reclamado, 570_000);
});
