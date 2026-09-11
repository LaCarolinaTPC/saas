/**
 * Pruebas de la etapa 2 (fase 3): qué falta para liquidar, la entrada desde el
 * expediente, las sobrescrituras y la lectura de reglas guardadas.
 *
 *   npm run test:incapacidades
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLAS, liquidar, IncidenciaMotor } from "./motor";
import {
  aplicarSobrescrituras,
  armarEntrada,
  faltantesParaLiquidar,
  motivoValido,
  reglaDesdeFila,
  type DatosLiquidar,
} from "./liquidacion-reglas";

const base: DatosLiquidar = {
  salario_base: 1_300_000,
  persona_fuente: "conductores",
  entidad_nombre: "NUEVA EPS",
  entidad_clase: "EPS",
  tipo_homologado: "EG",
  origen: "EG",
  indicador_prorroga: "INICIAL",
  modalidad_ajustada: null,
  fecha_inicio: "2026-09-01",
  fecha_fin: "2026-09-05",
  dias_incapacidad: 5,
  dias_entidad_ajustados: null,
  valor_reclamado_ajustado: null,
};

test("liquidar sin salario devuelve error por campo, no un cero", () => {
  const f = faltantesParaLiquidar({ ...base, salario_base: null });
  assert.deepEqual(f.map((x) => x.campo), ["salario_base"]);
  assert.match(f[0].mensaje, /salario/i);
});

test("qué falta para liquidar: cada requisito de 7.3 tiene su campo", () => {
  assert.deepEqual(faltantesParaLiquidar(base), []);
  const todo = faltantesParaLiquidar({
    ...base, salario_base: null, persona_fuente: "sin_resolver", entidad_nombre: null, tipo_homologado: null,
    indicador_prorroga: null, fecha_fin: null, dias_incapacidad: null,
  });
  assert.deepEqual(todo.map((x) => x.campo), ["salario_base", "persona", "entidad", "tipo", "modalidad", "fechas", "dias"]);
  // La modalidad ajustada suple la de la matriz.
  assert.deepEqual(faltantesParaLiquidar({ ...base, indicador_prorroga: null, modalidad_ajustada: "PRORROGA" }), []);
});

test("con datos completos reproduce el caso 13.2 de cinco días EG con la regla operativa", () => {
  const liq = liquidar(armarEntrada(base), REGLAS["gestivo-cobro-dias"]);
  assert.equal(liq.diasIncapacidad, 5);
  assert.equal(liq.diasEntidad, 3);
  assert.equal(liq.diasEmpresa, 2);
  assert.ok(Math.abs(liq.valorTotal - 216_666.666666667) < 1e-6);
  assert.ok(Math.abs(liq.valorEntidad - 130_000) < 1e-6);
});

test("la entrada lleva los días de la matriz como informados: si las fechas no cuadran, incidencia", () => {
  const e = armarEntrada({ ...base, dias_incapacidad: 4 });
  assert.equal(e.diasInformados, 4);
  assert.throws(() => liquidar(e), (x: unknown) => x instanceof IncidenciaMotor && x.codigo === "dias_no_coinciden");
});

test("la clase de la entidad manda sobre el tipo al armar la entrada", () => {
  const arl = armarEntrada({ ...base, entidad_nombre: "ARL BOLIVAR", entidad_clase: "ARL", tipo_homologado: "AT", origen: "AT" });
  assert.equal(arl.esArl, true);
  assert.equal(liquidar(arl).diasEntidad, 5, "la ARL responde por todos los días");
  const sinClase = armarEntrada({ ...base, entidad_clase: null, tipo_homologado: "AT" });
  assert.equal(sinClase.esArl, undefined, "sin clase, el motor deriva del tipo");
  assert.equal(liquidar(sinClase).diasEntidad, 5);
  // El tipo homologado prevalece sobre el origen crudo de la matriz.
  assert.equal(armarEntrada({ ...base, tipo_homologado: "LM", origen: "EG" }).tipo, "LM");
  assert.equal(armarEntrada({ ...base, tipo_homologado: null }).tipo, "EG");
});

test("sobrescritura de días a cargo: nunca por encima de los días totales; recalcula valores", () => {
  const liq = liquidar(armarEntrada(base));
  assert.throws(() => aplicarSobrescrituras(liq, { diasEntidad: 6 }), /superan los días de incapacidad/);
  assert.throws(() => aplicarSobrescrituras(liq, { diasEntidad: -1 }), /entero/);
  assert.throws(() => aplicarSobrescrituras(liq, { diasEntidad: 2.5 }), /entero/);
  const r = aplicarSobrescrituras(liq, { diasEntidad: 5 });
  assert.equal(r.liquidacion.diasEntidad, 5);
  assert.equal(r.liquidacion.diasEmpresa, 0);
  assert.ok(Math.abs(r.liquidacion.valorEntidad - liq.valorTotal) < 1e-6);
  assert.ok(Math.abs(r.liquidacion.valorEmpresa) < 1e-6);
  assert.deepEqual(r.sobrescrituras.dias_entidad, { calculado: 3, ajustado: 5 });
  assert.equal(r.valorReclamado, r.liquidacion.valorEntidad);
  assert.deepEqual(r.avisos, []);
  // Sin sobrescrituras, nada cambia y se reclama el valor entidad.
  const s = aplicarSobrescrituras(liq, {});
  assert.deepEqual(s.liquidacion, liq);
  assert.deepEqual(s.sobrescrituras, {});
  assert.ok(Math.abs(s.valorReclamado - 130_000) < 1e-6);
});

test("sobrescritura del valor reclamado: por encima del total avisa, no bloquea", () => {
  const liq = liquidar(armarEntrada(base));
  const r = aplicarSobrescrituras(liq, { valorReclamado: 300_000 });
  assert.equal(r.valorReclamado, 300_000);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /supera el valor total/);
  assert.ok(Math.abs(r.sobrescrituras.valor_reclamado.calculado - 130_000) < 1e-6);
  const ok = aplicarSobrescrituras(liq, { valorReclamado: 100_000 });
  assert.deepEqual(ok.avisos, []);
  assert.throws(() => aplicarSobrescrituras(liq, { valorReclamado: -1 }), /mayor o igual a cero/);
});

test("regla desde la base: acepta la forma de motor.ts y rechaza una mal guardada", () => {
  const fila = { id: "r1", codigo: "gestivo-cobro-dias", descripcion: "x", parametros: REGLAS["gestivo-cobro-dias"].parametros };
  const r = reglaDesdeFila(fila);
  assert.equal(r.id, "r1");
  assert.deepEqual(r.parametros, REGLAS["gestivo-cobro-dias"].parametros);
  assert.equal(liquidar(armarEntrada(base), r).diasEntidad, 3);
  // Misma liquidación con la regla leída de la base que con la del código.
  assert.deepEqual({ ...liquidar(armarEntrada(base), r), regla: "" }, { ...liquidar(armarEntrada(base)), regla: "" });
  assert.throws(() => reglaDesdeFila({ ...fila, parametros: null }), /no tiene parámetros/);
  assert.throws(() => reglaDesdeFila({ ...fila, parametros: { ...fila.parametros, divisorSalario: 0 } }), /divisorSalario/);
  assert.throws(() => reglaDesdeFila({ ...fila, parametros: { ...fila.parametros, diasEmpleador: { porEntidad: {}, porClaseArl: "x", porDefecto: 2 } } }), /porClaseArl/);
  // Las claves de factor se normalizan a mayúsculas.
  const min = reglaDesdeFila({ ...fila, parametros: { ...fila.parametros, factorPorTipo: { at: 1, eg: 1 } } });
  assert.deepEqual(min.parametros.factorPorTipo, { AT: 1, EG: 1 });
});

test("un motivo de ajuste necesita al menos cinco caracteres reales", () => {
  assert.equal(motivoValido("   ab  "), false);
  assert.equal(motivoValido("Cambio de EPS"), true);
  assert.equal(motivoValido(null), false);
});
