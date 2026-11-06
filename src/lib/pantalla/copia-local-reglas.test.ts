import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COPIA_VIEJA_MS,
  MAX_MEDIO_LOCAL_BYTES,
  cabeEnLocal,
  copiaMuyVieja,
  copiaVigente,
  esperaRestante,
  hoyColombia,
  planMedios,
  prefijoDeClave,
} from "./copia-local-reglas";

const MIN = 60_000;
// 10:00 en Bogotá (15:00 UTC).
const AHORA = new Date("2026-11-06T15:00:00Z").getTime();
const base = { clavePrefijo: "dsp_abc123", recibidoAt: AHORA - 5 * MIN, hoy: "2026-11-06" };
const actual = { clavePrefijo: "dsp_abc123", ahora: AHORA, esperaMs: 15 * MIN };

test("copia: sirve con la misma clave, el mismo día y dentro del intervalo", () => {
  assert.equal(copiaVigente(base, actual), true);
});

test("copia: no sirve con otra clave, otro día, vencida o con el reloj movido", () => {
  assert.equal(copiaVigente({ ...base, clavePrefijo: "dsp_otra00" }, actual), false);
  assert.equal(copiaVigente({ ...base, hoy: "2026-11-05" }, actual), false);
  assert.equal(copiaVigente({ ...base, recibidoAt: AHORA - 15 * MIN }, actual), false);
  assert.equal(copiaVigente({ ...base, recibidoAt: AHORA + MIN }, actual), false);
});

test("copia: el día se cuenta en hora de Colombia, no en UTC", () => {
  // 02:00 UTC del 7 todavía son las 21:00 del 6 en Bogotá.
  assert.equal(hoyColombia(new Date("2026-11-07T02:00:00Z")), "2026-11-06");
  assert.equal(hoyColombia(new Date("2026-11-07T05:00:00Z")), "2026-11-07");
});

test("copia: espera restante acotada al intervalo", () => {
  assert.equal(esperaRestante(AHORA - 5 * MIN, AHORA, 15 * MIN), 10 * MIN);
  assert.equal(esperaRestante(AHORA - 20 * MIN, AHORA, 15 * MIN), 0);
  // Un reloj adelantado no debe alargar la espera más que un intervalo.
  assert.equal(esperaRestante(AHORA + 60 * MIN, AHORA, 15 * MIN), 15 * MIN);
});

test("copia: se avisa después de 24 horas", () => {
  assert.equal(copiaMuyVieja(AHORA - COPIA_VIEJA_MS, AHORA), false);
  assert.equal(copiaMuyVieja(AHORA - COPIA_VIEJA_MS - 1, AHORA), true);
});

test("medios: respeta el tope por archivo y la cuota", () => {
  assert.equal(cabeEnLocal(MAX_MEDIO_LOCAL_BYTES, null), true);
  assert.equal(cabeEnLocal(MAX_MEDIO_LOCAL_BYTES + 1, null), false);
  assert.equal(cabeEnLocal(100, { usado: 700, cuota: 1000 }), true);
  assert.equal(cabeEnLocal(101, { usado: 700, cuota: 1000 }), false);
});

test("medios: no repite lo guardado y limpia lo que ya no se usa", () => {
  assert.deepEqual(planMedios(["a", "b", "b"], ["b", "c"]), { descargar: ["a"], borrar: ["c"] });
  assert.deepEqual(planMedios([], []), { descargar: [], borrar: [] });
});

test("clave: solo se guarda el prefijo visible, nunca la clave", () => {
  assert.equal(prefijoDeClave("dsp_abcdefghijklmnopqrstuvwxyz012345"), "dsp_abcdef");
});
