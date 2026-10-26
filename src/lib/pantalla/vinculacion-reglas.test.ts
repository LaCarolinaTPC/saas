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
