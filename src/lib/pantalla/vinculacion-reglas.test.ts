import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Limitador,
  codigoLegible,
  estaVigente,
  filasALimpiar,
  generarCodigo,
  normalizarCodigo,
  segundosRestantes,
} from "./vinculacion-reglas";

test("generarCodigo: seis dígitos con ceros a la izquierda", () => {
  assert.equal(generarCodigo(() => 7), "000007");
  assert.equal(generarCodigo(() => 999999), "999999");
  assert.equal(generarCodigo(() => 1_000_007), "000007");
});

test("normalizarCodigo acepta espacios y guiones; rechaza lo demás", () => {
  assert.equal(normalizarCodigo("048 213"), "048213");
  assert.equal(normalizarCodigo("048-213"), "048213");
  assert.equal(normalizarCodigo(" 048213 "), "048213");
  assert.equal(normalizarCodigo("4821"), null);
  assert.equal(normalizarCodigo("04821a"), null);
  assert.equal(normalizarCodigo(48213), null);
  assert.equal(codigoLegible("048213"), "048 213");
});

test("vigencia y segundos restantes; el límite exacto ya venció", () => {
  const ahora = new Date("2026-10-26T15:00:00Z");
  assert.ok(estaVigente({ expira_at: "2026-10-26T15:00:01Z" }, ahora));
  assert.ok(!estaVigente({ expira_at: "2026-10-26T15:00:00Z" }, ahora));
  assert.equal(segundosRestantes({ expira_at: "2026-10-26T15:01:30Z" }, ahora), 90);
  assert.equal(segundosRestantes({ expira_at: "2026-10-26T14:00:00Z" }, ahora), 0);
});

test("filasALimpiar devuelve solo las vencidas", () => {
  const ahora = new Date("2026-10-26T15:00:00Z");
  const ids = filasALimpiar(
    [
      { id: "a", expira_at: "2026-10-26T14:59:00Z" },
      { id: "b", expira_at: "2026-10-26T15:05:00Z" },
      { id: "c", expira_at: "2026-10-25T00:00:00Z" },
    ],
    ahora
  );
  assert.deepEqual(ids, ["a", "c"]);
});

test("Limitador: permite max por ventana y vuelve a permitir al pasar la ventana", () => {
  let t = 0;
  const l = new Limitador(3, 1000, () => t);
  assert.ok(l.permite("ip"));
  assert.ok(l.permite("ip"));
  assert.ok(l.permite("ip"));
  assert.ok(!l.permite("ip"));
  assert.ok(l.permite("otra"));
  t = 1001;
  assert.ok(l.permite("ip"));
});

// ── Ritmo de sondeo del TV (cada consulta es una invocación de función) ──────

import { SONDEO_DISPLAY_NOCHE_MS, esperaSondeoDisplay, normalizarSondeoMin } from "./tipos-display";
import { MAX_CODIGOS_SEGUIDOS, POLL_TV_MS } from "./vinculacion-reglas";

test("sondeo del TV: el intervalo elegido de día y 30 minutos de noche, en hora de Colombia", () => {
  const QUINCE = 15 * 60_000;
  // 15:00 UTC = 10:00 en Bogotá; 05:00 UTC = 00:00; 08:59 UTC = 03:59; 09:00 UTC = 04:00.
  assert.equal(esperaSondeoDisplay(new Date("2026-11-05T15:00:00Z")), QUINCE);
  assert.equal(esperaSondeoDisplay(new Date("2026-11-05T15:00:00Z"), 30), 30 * 60_000);
  assert.equal(esperaSondeoDisplay(new Date("2026-11-06T05:00:00Z")), SONDEO_DISPLAY_NOCHE_MS);
  assert.equal(esperaSondeoDisplay(new Date("2026-11-06T08:59:00Z")), SONDEO_DISPLAY_NOCHE_MS);
  assert.equal(esperaSondeoDisplay(new Date("2026-11-06T09:00:00Z")), QUINCE);
  assert.equal(esperaSondeoDisplay(new Date("2026-11-06T04:00:00Z")), SONDEO_DISPLAY_NOCHE_MS); // 23:00
});

test("sondeo del TV: un valor inválido equivale a 15 minutos", () => {
  assert.equal(normalizarSondeoMin("30"), 30);
  assert.equal(normalizarSondeoMin(15), 15);
  for (const malo of ["5", 0, null, undefined, "abc", 1000]) assert.equal(normalizarSondeoMin(malo), 15, String(malo));
  assert.equal(esperaSondeoDisplay(new Date("2026-11-05T15:00:00Z"), 5), 15 * 60_000);
});

test("vinculación: un TV olvidado en la pantalla del código deja de consultar", () => {
  // Llamadas máximas sin que nadie lo toque: 3 códigos de 10 minutos cada 5 s.
  const maximo = (MAX_CODIGOS_SEGUIDOS * 10 * 60_000) / POLL_TV_MS + MAX_CODIGOS_SEGUIDOS;
  assert.ok(maximo <= 400, `demasiadas llamadas: ${maximo}`);
});
