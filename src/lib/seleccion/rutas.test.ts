import { test } from "node:test";
import assert from "node:assert/strict";
import { avanceRutas, obligatoriasDe, validarNombreRuta } from "./rutas";
import { condicionesContratar } from "./contratacion";

test("rutas: cada nombre es una ruta distinta; las variaciones cuentan aparte", () => {
  const a = avanceRutas(["A - 16 MIRAMAR", "A - 16 MIRAMAR - GAVIOTAS"], 2, []);
  assert.equal(a.completas, true);
  assert.equal(a.detalle, "2 de 2 (A - 16 MIRAMAR, A - 16 MIRAMAR - GAVIOTAS)");
  // La misma ruta dos veces (aunque cambien mayúsculas o espacios) cuenta una.
  const b = avanceRutas(["B-17 MALLORQUIN", " b-17 mallorquin "], 2, []);
  assert.equal(b.aprendidas.length, 1);
  assert.equal(b.completas, false);
});

test("rutas: las obligatorias se exigen además del número", () => {
  const a = avanceRutas(["B-17 MALLORQUIN", "D - 6 ECOLOGICA - CALLE 30"], 2, ["A - 16 MIRAMAR"]);
  assert.equal(a.completas, false);
  assert.deepEqual(a.faltanObligatorias, ["A - 16 MIRAMAR"]);
  assert.match(a.detalle, /2 de 2 .* · falta la obligatoria A - 16 MIRAMAR/);
  assert.equal(avanceRutas(["a - 16 miramar", "B-17 MALLORQUIN"], 2, ["A - 16 MIRAMAR"]).completas, true);
});

test("rutas: si hay más obligatorias que el ajuste, se exigen todas", () => {
  const a = avanceRutas(["X"], 1, ["X", "Y", "Z"]);
  assert.equal(a.necesarias, 3);
  assert.equal(a.completas, false);
  assert.match(a.detalle, /^1 de 3 \(X\) · faltan las obligatorias Y, Z$/);
});

test("rutas: nombres de la lista (sin repetir, sin vacíos, máximo 80)", () => {
  const lista = [{ id: "1", nombre: "A - 16 MIRAMAR" }];
  assert.deepEqual(validarNombreRuta("  A  - 16   miramar ", lista), { ok: false, error: "Ya existe la ruta «A - 16 miramar»." });
  assert.deepEqual(validarNombreRuta("a - 16 miramar", lista, "1"), { ok: true, nombre: "a - 16 miramar" });
  assert.equal(validarNombreRuta("   ", lista).ok, false);
  assert.equal(validarNombreRuta("x".repeat(81), lista).ok, false);
  assert.deepEqual(obligatoriasDe([{ id: "1", nombre: "A", obligatoria: true, orden: 2 }, { id: "2", nombre: "B", obligatoria: false, orden: 1 }]), ["A"]);
});

test("contratar: la condición de rutas usa el avance con las obligatorias", () => {
  const base = {
    examenes: [],
    rutasAprendidas: 2,
    rutasMinimas: 2,
    reingreso: false,
    itemsCarpeta: [],
    carpeta: [],
    aprobada: true,
    exigePsicotecnica: false,
    psicotecnica: null,
  } as const;
  const conFalta = condicionesContratar({ ...base, rutas: avanceRutas(["B", "C"], 2, ["A"]) }).condiciones.find((c) => c.id === "rutas")!;
  assert.equal(conFalta.cumple, false);
  assert.match(conFalta.detalle, /falta la obligatoria A/);
  assert.equal(condicionesContratar({ ...base, rutas: avanceRutas(["A", "C"], 2, ["A"]) }).condiciones.find((c) => c.id === "rutas")!.cumple, true);
  // Reingreso: ya conoce las rutas.
  assert.equal(condicionesContratar({ ...base, reingreso: true, rutas: avanceRutas([], 2, ["A"]) }).condiciones.find((c) => c.id === "rutas")!.cumple, true);
});
