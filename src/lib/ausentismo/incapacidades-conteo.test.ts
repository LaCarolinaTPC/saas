import { test } from "node:test";
import assert from "node:assert/strict";
import { conteoIncapacidades, type FilaIncapacidad } from "./incapacidades-conteo";

/** Una fila del Registro del día con su incapacidad médica. */
function fila(fecha: string, inicio: string | null, fin: string | null): FilaIncapacidad {
  return { fecha, fecha_inicio: fecha, fecha_fin: fecha, incapacidad_inicio: inicio, incapacidad_fin: fin };
}

const SEP = { desde: "2026-09-01", hasta: "2026-09-30" };

test("caso 72246879: 2 filas de una incapacidad de 2 días son 1 incapacidad y 2 días", () => {
  const filas = [fila("2026-09-24", "2026-09-24", "2026-09-25"), fila("2026-09-25", "2026-09-24", "2026-09-25")];
  assert.deepEqual(conteoIncapacidades(filas, SEP.desde, SEP.hasta), { incapacidades: 1, dias: 2 });
});

test("tres incapacidades de 2 días con 2 filas cada una: 3 y 6", () => {
  const filas = [
    fila("2026-09-24", "2026-09-24", "2026-09-25"), fila("2026-09-25", "2026-09-24", "2026-09-25"),
    fila("2026-10-02", "2026-10-02", "2026-10-03"), fila("2026-10-03", "2026-10-02", "2026-10-03"),
    fila("2026-10-20", "2026-10-20", "2026-10-21"), fila("2026-10-21", "2026-10-20", "2026-10-21"),
  ];
  assert.deepEqual(conteoIncapacidades(filas, "2026-09-01", "2026-10-28"), { incapacidades: 3, dias: 6 });
});

test("una incapacidad de 15 días con una fila por día da 15, no 225", () => {
  const filas = Array.from({ length: 15 }, (_, i) =>
    fila(`2026-09-${String(i + 1).padStart(2, "0")}`, "2026-09-01", "2026-09-15")
  );
  assert.deepEqual(conteoIncapacidades(filas, SEP.desde, SEP.hasta), { incapacidades: 1, dias: 15 });
});

test("solo cuentan los días dentro del periodo consultado", () => {
  // 25-sep a 5-oct, mirada solo en septiembre: 6 días.
  const filas = [fila("2026-09-25", "2026-09-25", "2026-10-05")];
  assert.deepEqual(conteoIncapacidades(filas, SEP.desde, SEP.hasta), { incapacidades: 1, dias: 6 });
});

test("una sola fila con el rango completo cuenta todos sus días", () => {
  const filas = [fila("2026-09-10", "2026-09-10", "2026-09-12")];
  assert.deepEqual(conteoIncapacidades(filas, SEP.desde, SEP.hasta), { incapacidades: 1, dias: 3 });
});

test("sin rango médico: cada fila es una incapacidad de su día", () => {
  const filas = [fila("2026-09-10", null, null), fila("2026-09-11", null, null)];
  assert.deepEqual(conteoIncapacidades(filas, SEP.desde, SEP.hasta), { incapacidades: 2, dias: 2 });
});

test("rangos que se solapan (prórroga) no repiten días", () => {
  const filas = [fila("2026-09-10", "2026-09-10", "2026-09-11"), fila("2026-09-11", "2026-09-11", "2026-09-14")];
  assert.deepEqual(conteoIncapacidades(filas, SEP.desde, SEP.hasta), { incapacidades: 2, dias: 5 });
});

test("rango al revés: la fila cuenta solo su día", () => {
  const filas = [fila("2026-09-10", "2026-09-12", "2026-09-10")];
  assert.deepEqual(conteoIncapacidades(filas, SEP.desde, SEP.hasta), { incapacidades: 1, dias: 1 });
});

test("sin filas, cero", () => {
  assert.deepEqual(conteoIncapacidades([], SEP.desde, SEP.hasta), { incapacidades: 0, dias: 0 });
});
