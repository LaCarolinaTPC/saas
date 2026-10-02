import { test } from "node:test";
import assert from "node:assert/strict";
import { GRUPOS_PREOP, PUNTOS_PREOP } from "./preoperacional-lista";
import {
  calcularResultado, compararCodigo, conteoDia, ultimaPorVehiculo, validarFallas,
  type DocumentoPreop, type RevisionDia,
} from "./preoperacional-reglas";

const doc = (tipo: string, nivel: DocumentoPreop["nivel"]): DocumentoPreop => ({
  tipo, nombre: tipo, nivel, fecha: nivel === "sin_dato" ? null : "2026-12-31", dias: nivel === "sin_dato" ? null : 90,
});
const AL_DIA = [doc("soat", "al_dia"), doc("tecnomecanica", "al_dia"), doc("tarjeta_operacion", "al_dia")];

test("la lista conserva los 34 puntos del formulario de SharePoint, con claves únicas y grupos válidos", () => {
  assert.equal(PUNTOS_PREOP.length, 34);
  assert.equal(new Set(PUNTOS_PREOP.map((p) => p.key)).size, 34);
  const grupos = new Set(GRUPOS_PREOP.map((g) => g.key));
  assert.ok(PUNTOS_PREOP.every((p) => grupos.has(p.grupo)));
});

test("todo cumple y documentos al día: apto", () => {
  assert.deepEqual(calcularResultado(validarFallas([]), AL_DIA), {
    resultado: "apto", fallas: 0, fallasCriticas: 0, documentosVencidos: 0,
  });
});

test("una falla no crítica deja apto con observación", () => {
  const r = calcularResultado(validarFallas([{ key: "aseo" }]), AL_DIA);
  assert.equal(r.resultado, "apto_obs");
  assert.equal(r.fallas, 1);
  assert.equal(r.fallasCriticas, 0);
});

test("una falla crítica deja no apto aunque haya otras leves", () => {
  const r = calcularResultado(validarFallas([{ key: "aseo" }, { key: "freno_liquido" }]), AL_DIA);
  assert.equal(r.resultado, "no_apto");
  assert.equal(r.fallasCriticas, 1);
});

test("un documento vencido deja no apto sin ninguna falla marcada", () => {
  const r = calcularResultado([], [...AL_DIA, doc("poliza_rcc", "vencido")]);
  assert.equal(r.resultado, "no_apto");
  assert.equal(r.documentosVencidos, 1);
});

test("sin dato, crítico o próximo a vencer no bloquean la salida", () => {
  const docs = [doc("poliza_rce", "sin_dato"), doc("soat", "critico"), doc("tecnomecanica", "proximo")];
  assert.equal(calcularResultado([], docs).resultado, "apto");
});

test("rechaza un punto que no está en la lista", () => {
  assert.throws(() => validarFallas([{ key: "turbo" }]), /no está en la lista/);
});

test("rechaza una nota de más de 300 caracteres", () => {
  assert.throws(() => validarFallas([{ key: "aseo", nota: "x".repeat(301) }]), /300/);
});

test("concepto: el elegido si es del punto; si no, el primero; null si el punto no va a Mantenimiento", () => {
  const f = validarFallas([
    { key: "luces", concepto: "LUCES TRASERAS" },
    { key: "freno_embrague", concepto: "MOTOR" },
    { key: "cinturon", concepto: "FRENOS" },
  ]);
  const concepto = (key: string) => f.find((x) => x.key === key)?.concepto;
  assert.equal(concepto("luces"), "LUCES TRASERAS");
  assert.equal(concepto("freno_embrague"), "FRENOS");
  assert.equal(concepto("cinturon"), null);
});

test("un punto repetido cuenta una vez y la salida sigue el orden de la lista", () => {
  const f = validarFallas([{ key: "extintor" }, { key: "aceite", nota: "  bajo  " }, { key: "extintor" }]);
  assert.deepEqual(f.map((x) => x.key), ["aceite", "extintor"]);
  assert.equal(f[0].nota, "bajo");
});

test("tablero: rige la última revisión del día y los no revisados quedan pendientes", () => {
  const revs: RevisionDia[] = [
    { id: "1", codigo_vehiculo: "501", resultado: "no_apto", created_at: "2026-10-02T11:00:00Z" },
    { id: "2", codigo_vehiculo: "501", resultado: "apto", created_at: "2026-10-02T12:30:00Z" },
    { id: "3", codigo_vehiculo: "502", resultado: "apto_obs", created_at: "2026-10-02T11:05:00Z" },
  ];
  const ultimas = ultimaPorVehiculo(revs);
  assert.equal(ultimas.get("501")?.id, "2");
  assert.deepEqual(conteoDia(["501", "502", "503"], ultimas), { apto: 1, apto_obs: 1, no_apto: 0, pendiente: 1 });
});

test("los códigos numéricos se ordenan como números", () => {
  assert.deepEqual(["600", "99", "501", "A1"].sort(compararCodigo), ["99", "501", "600", "A1"]);
});
