import { test } from "node:test";
import assert from "node:assert/strict";
import { caidasDe, duracionLegible, estadisticasProveedores, recomendar, type LlamadaStats } from "./estadisticas";

const ahora = new Date("2026-11-26T20:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
const ll = (fuente: string, ok: boolean, minAtras: number, ms: number | null = 5000, extra: Partial<LlamadaStats> = {}): LlamadaStats => ({
  servicio: "croma",
  proveedor: "croma",
  fuente,
  ok,
  at: hace(minAtras),
  duracionMs: ms,
  error: ok ? null : "The operation was aborted due to timeout",
  ...extra,
});

test("proveedores: el RNMC caído (26-nov) queda con caída en curso y la recomendación de revisar a mano", () => {
  const llamadas = [ll("rnmc", false, 60, 90_000), ll("rnmc", false, 55, 90_000), ll("rnmc", false, 50, 90_000), ll("rnmc", false, 5, 90_000), ll("runt", true, 7, 4000), ll("runt", true, 70, 6000)];
  const filas = estadisticasProveedores(llamadas, ["2026-11-26"], ahora);
  const rnmc = filas.find((f) => f.fuente === "rnmc")!;
  assert.equal(filas[0].fuente, "rnmc", "lo que tiene algo que decir va primero");
  assert.equal(rnmc.intentos, 4);
  assert.equal(rnmc.respondio, 0);
  assert.equal(rnmc.tasa, 0);
  assert.equal(rnmc.caidas.length, 1);
  assert.equal(rnmc.caidas[0].fin, null);
  assert.equal(rnmc.minutosCaida, 60);
  assert.match(rnmc.recomendacion ?? "", /Lo revisé a mano/);
  const runt = filas.find((f) => f.fuente === "runt")!;
  assert.equal(runt.tasa, 1);
  assert.equal(runt.p50, 4000);
  assert.equal(runt.recomendacion, null);
  assert.deepEqual(runt.porDia, [{ dia: "2026-11-26", intentos: 2, respondio: 2 }]);
});

test("proveedores: una caída cerrada dura hasta la primera respuesta buena; dos errores sueltos no son caída", () => {
  const c = caidasDe([
    { ok: false, at: hace(100) },
    { ok: false, at: hace(90) },
    { ok: true, at: hace(80) },
    { ok: false, at: hace(70) },
    { ok: false, at: hace(60) },
    { ok: false, at: hace(50) },
    { ok: true, at: hace(40) },
  ]);
  assert.equal(c.length, 1);
  assert.equal(c[0].inicio, hace(70));
  assert.equal(c[0].fin, hace(40));
  assert.equal(c[0].errores, 3);
});

test("proveedores: responde poco con suficientes intentos → buscar otro proveedor; lento → aviso de lentitud", () => {
  assert.match(recomendar({ servicio: "croma", fuente: "policia", intentos: 20, tasa: 0.6, p95: 10_000, caidas: [] }) ?? "", /otro proveedor/);
  assert.equal(recomendar({ servicio: "croma", fuente: "policia", intentos: 5, tasa: 0.6, p95: 10_000, caidas: [] }), null, "pocos intentos: puede ser casualidad");
  assert.match(recomendar({ servicio: "croma", fuente: "contraloria", intentos: 20, tasa: 0.95, p95: 75_000, caidas: [] }) ?? "", /Lento/);
  assert.match(recomendar({ servicio: "ia", fuente: "chat", intentos: 20, tasa: 0.5, p95: 3000, caidas: [] }) ?? "", /Selección › IA/);
});

test("proveedores: el histórico sin tiempos cuenta intentos pero no inventa tiempos", () => {
  const filas = estadisticasProveedores([ll("simit", true, 10, null), ll("simit", true, 20, null)], ["2026-11-26"], ahora);
  assert.equal(filas[0].p50, null);
  assert.equal(filas[0].intentos, 2);
});

test("proveedores: la IA se agrupa por uso y proveedor", () => {
  const ia = (proveedor: string, fuente: string, ok: boolean, min: number): LlamadaStats => ({ servicio: "ia", proveedor, fuente, ok, at: hace(min), duracionMs: 1500 });
  const filas = estadisticasProveedores([ia("anthropic", "chat", true, 1), ia("anthropic", "chat", true, 2), ia("openrouter", "voz", false, 3)], [], ahora);
  assert.deepEqual(filas.map((f) => f.nombre).sort(), ["Chat del asistente · Anthropic (Claude)", "Transcripción de audios · OpenRouter"]);
});

test("proveedores: duraciones legibles", () => {
  assert.equal(duracionLegible(45), "45 min");
  assert.equal(duracionLegible(200), "3 h 20 min");
  assert.equal(duracionLegible(60 * 52), "2 días 4 h");
});
