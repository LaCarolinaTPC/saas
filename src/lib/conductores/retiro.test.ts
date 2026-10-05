import { test } from "node:test";
import assert from "node:assert/strict";
import { CAUSAS_RETIRO, causaLabel, retiroVigente, validarRetiro, type RetiroRegistrado } from "./retiro";

test("las claves del catálogo no se repiten", () => {
  assert.equal(new Set(CAUSAS_RETIRO.map((c) => c.clave)).size, CAUSAS_RETIRO.length);
});

test("valida causa, nota obligatoria con OTRA y largo máximo", () => {
  assert.equal(validarRetiro("RENUNCIA_VOLUNTARIA", ""), null);
  assert.match(validarRetiro("NO_EXISTE", "x") ?? "", /Elija una causa/);
  assert.match(validarRetiro("OTRA", "  ") ?? "", /explique el motivo/);
  assert.equal(validarRetiro("OTRA", "Se fue a otra ciudad"), null);
  assert.match(validarRetiro("SALUD", "x".repeat(2001)) ?? "", /2000/);
});

test("etiqueta de causa conocida, desconocida y vacía", () => {
  assert.equal(causaLabel("PENSION"), "Pensión");
  assert.equal(causaLabel("VIEJA_CLAVE"), "VIEJA_CLAVE");
  assert.equal(causaLabel(null), "Sin registrar");
});

test("el retiro vigente es el de la fecha actual; si no, el más reciente", () => {
  const r = (fecha: string | null, at: string): RetiroRegistrado => ({
    cedula: "1", fechaRetiro: fecha, causa: "SALUD", nota: null, registradoPor: null, registradoAt: at, actualizadoPor: null, actualizadoAt: at,
  });
  const lista = [r("2025-03-01", "2025-03-02"), r("2026-08-10", "2026-08-11")];
  assert.equal(retiroVigente(lista, "2025-03-01")?.fechaRetiro, "2025-03-01");
  assert.equal(retiroVigente(lista, "2026-09-30")?.fechaRetiro, "2026-08-10");
  assert.equal(retiroVigente([], null), null);
});
