import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularDetalleCostos, contarAudios, etiquetaModelo, pesosDetalle, rangoMesActual, rangoMesAnterior, resolverRangoCostos, type ConsumoCosto } from "./costos";

const consumo = (p: Partial<ConsumoCosto>): ConsumoCosto => ({
  concepto: "asistente",
  proveedor: "anthropic",
  modelo: "claude-haiku-5-5",
  tokens_entrada: 0,
  tokens_salida: 0,
  costo_usd: 0,
  proceso_id: null,
  conversacion_id: null,
  created_at: "2026-11-20T15:00:00Z",
  ...p,
});

test("costos: un audio con control son dos filas; sin control, una", () => {
  const filas = [
    { modelo: "openai/gpt-4o-mini-transcribe", conversacion_id: "c1", proceso_id: null, created_at: "2026-11-20T15:00:00Z" },
    { modelo: "openai/whisper-large-v3-turbo", conversacion_id: "c1", proceso_id: null, created_at: "2026-11-20T15:00:05Z" },
    // Audio sin texto: no hay control.
    { modelo: "openai/gpt-4o-mini-transcribe", conversacion_id: "c1", proceso_id: null, created_at: "2026-11-20T15:10:00Z" },
    // Otro audio en otra conversación, muy seguido: no se empareja con el anterior por el modelo igual.
    { modelo: "openai/gpt-4o-mini-transcribe", conversacion_id: "c2", proceso_id: null, created_at: "2026-11-20T15:10:01Z" },
    { modelo: "openai/whisper-large-v3-turbo", conversacion_id: "c2", proceso_id: null, created_at: "2026-11-20T15:10:04Z" },
  ];
  assert.equal(contarAudios(filas), 3);
  // Mismo par pero lejos en el tiempo: dos audios.
  assert.equal(contarAudios([filas[0], { ...filas[1], created_at: "2026-11-20T16:00:00Z" }]), 2);
});

test("costos: separa IA de Croma y da el costo por unidad", () => {
  const d = calcularDetalleCostos({
    rango: { desde: "2026-11-01", hasta: "2026-11-24" },
    consumos: [
      consumo({ concepto: "asistente", costo_usd: 0.002, tokens_entrada: 1000, tokens_salida: 100 }),
      consumo({ concepto: "asistente", costo_usd: 0.004 }),
      consumo({ concepto: "lectura", modelo: "claude-sonnet-5-5", costo_usd: 0.03 }),
      consumo({ concepto: "transcripcion", proveedor: "openrouter", modelo: "openai/gpt-4o-mini-transcribe", costo_usd: 0.0003, created_at: "2026-11-21T10:00:00Z" }),
      consumo({ concepto: "transcripcion", proveedor: "openrouter", modelo: "openai/whisper-large-v3-turbo", costo_usd: 0.0001, created_at: "2026-11-21T10:00:03Z" }),
    ],
    consultas: [
      { proveedor: "croma", fuente: "runt", estado: "ok", consultado_por: "Agente IA", created_at: "2026-11-20T15:00:00Z" },
      { proveedor: "croma", fuente: "simit", estado: "ok", consultado_por: "Sistema", created_at: "2026-11-20T15:00:00Z" },
      { proveedor: "croma", fuente: "simit", estado: "ok", consultado_por: "x@y.co (reutilizada del 18-nov)", created_at: "2026-11-21T15:00:00Z" },
      { proveedor: "croma", fuente: "rnmc", estado: "error", consultado_por: "Agente IA", created_at: "2026-11-21T15:00:00Z" },
    ],
    cromaCostoCop: 500,
    trm: 4000,
    aspirantes: 2,
    contratados: 0,
  });
  const c = (k: string) => d.conceptos.find((x) => x.clave === k)!;
  assert.equal(c("asistente").unidades, 2);
  assert.ok(Math.abs(c("asistente").porUnidadCop! - 12) < 1e-9); // 0,003 USD × 4000
  assert.equal(c("transcripcion").unidades, 1);
  assert.equal(c("transcripcion").llamadas, 2);
  assert.ok(Math.abs(c("transcripcion").porUnidadCop! - 1.6) < 1e-9);
  assert.equal(c("antecedentes").unidades, 2);
  assert.equal(c("antecedentes").cop, 1000);
  assert.equal(d.croma.cobradas, 2);
  assert.equal(d.croma.reutilizadas, 1);
  assert.equal(d.croma.conError, 1);
  assert.ok(Math.abs(d.ia.usd - 0.0364) < 1e-9);
  assert.ok(Math.abs(d.total.cop - (0.0364 * 4000 + 1000)) < 1e-6);
  assert.ok(Math.abs(d.porAspiranteCop! - d.total.cop / 2) < 1e-9);
  assert.equal(d.porContratadoCop, null);
  // Por fuente: el RUNT y el SIMIT cobrados; la reutilizada y el error, aparte.
  assert.deepEqual(
    d.fuentes.map((f) => [f.fuente, f.cobradas, f.reutilizadas, f.conError, f.cop]),
    [
      ["runt", 1, 0, 0, 500],
      ["simit", 1, 1, 0, 500],
      ["rnmc", 0, 0, 1, 0],
    ]
  );
  // Por modelo: el Sonnet de documentos va primero (el más caro).
  assert.equal(d.modelos[0].etiquetaModelo, "Claude Sonnet 5.5");
  // IA primero, luego Croma.
  assert.equal(d.conceptos[0].grupo, "ia");
  assert.equal(d.conceptos.find((x) => x.grupo === "croma")!.clave, "antecedentes");
  assert.deepEqual(
    d.porDia.map((x) => x.fecha),
    ["2026-11-20", "2026-11-21"]
  );
});

test("costos: Croma con valor 0 se cuenta pero no suma", () => {
  const d = calcularDetalleCostos({
    rango: { desde: "2026-11-01", hasta: "2026-11-24" },
    consumos: [],
    consultas: [{ proveedor: "croma", fuente: "runt", estado: "ok", consultado_por: "Agente IA", created_at: "2026-11-20T15:00:00Z" }],
    cromaCostoCop: 0,
    trm: 4000,
    aspirantes: 0,
    contratados: 0,
  });
  assert.equal(d.croma.cobradas, 1);
  assert.equal(d.croma.cop, 0);
  assert.equal(d.croma.sinValor, true);
  assert.equal(d.porAspiranteCop, null);
});

test("costos: periodo propio, el mes en curso por defecto", () => {
  const ahora = new Date("2026-11-24T03:00:00Z"); // 23-nov en Bogotá
  assert.deepEqual(rangoMesActual(ahora), { desde: "2026-11-01", hasta: "2026-11-23" });
  assert.deepEqual(rangoMesAnterior(ahora), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(rangoMesAnterior(new Date("2026-01-10T15:00:00Z")), { desde: "2025-12-01", hasta: "2025-12-31" });
  assert.deepEqual(resolverRangoCostos({}, ahora), { rango: { desde: "2026-11-01", hasta: "2026-11-23" }, aviso: null });
  assert.deepEqual(resolverRangoCostos({ desde: "2026-10-05", hasta: "2026-10-20" }, ahora), { rango: { desde: "2026-10-05", hasta: "2026-10-20" }, aviso: null });
  const malo = resolverRangoCostos({ desde: "2026-10-20", hasta: "2026-10-05" }, ahora);
  assert.deepEqual(malo.rango, { desde: "2026-11-01", hasta: "2026-11-23" });
  assert.match(malo.aviso!, /mes en curso/);
});

test("costos: etiquetas y pesos", () => {
  assert.equal(etiquetaModelo("anthropic/claude-sonnet-5.5"), "Claude Sonnet 5.5");
  assert.equal(etiquetaModelo("claude-haiku-5-5-20261101"), "Claude Haiku 5.5");
  assert.equal(etiquetaModelo("openai/whisper-large-v3-turbo"), "Whisper large v3 turbo");
  assert.equal(etiquetaModelo("openrouter/auto"), "openrouter/auto");
  assert.equal(pesosDetalle(0.3), "$0,30");
  assert.equal(pesosDetalle(1234.6), "$1.235");
  assert.equal(pesosDetalle(null), "—");
});
