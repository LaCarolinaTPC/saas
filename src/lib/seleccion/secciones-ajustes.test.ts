import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SECCIONES_AJUSTES, agruparAjustes } from "./secciones-ajustes";
import type { AjusteSeleccion } from "./ajustes";

const ajuste = (clave: string, unidad = "numero", orden = 0): AjusteSeleccion => ({
  clave, grupo: "regla", nombre: `Nombre largo de ${clave}`, orden, valor: 1, valor_sugerido: 1, unidad, origen: null, entrega: 1, actualizado_por: null, updated_at: "",
});

test("cada ajuste sembrado en las migraciones tiene sección", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const claves = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const bloque of sql.split(/INSERT INTO seleccion_ajustes/i).slice(1)) {
      const valores = bloque.split(/ON CONFLICT|;\s*\n/i)[0];
      for (const m of valores.matchAll(/\(\s*'([a-z0-9_]+)',\s*'(tiempo|regla|dato)'/g)) claves.add(m[1]);
    }
  }
  assert.ok(claves.size > 20, "debería encontrar los ajustes sembrados");
  const conSeccion = new Set(SECCIONES_AJUSTES.flatMap((s) => Object.keys(s.ajustes)));
  const sin = [...claves].filter((c) => !conSeccion.has(c));
  assert.deepEqual(sin, [], `Agregue estos ajustes a SECCIONES_AJUSTES: ${sin.join(", ")}`);
});

test("agruparAjustes: orden de la sección, sufijo por unidad y desconocidos en «Otros»", () => {
  const s = agruparAjustes([ajuste("edad_maxima"), ajuste("edad_minima"), ajuste("reactivacion_aviso1_horas", "horas"), ajuste("nuevo_ajuste", "dias")]);
  assert.deepEqual(s.map((x) => x.id), ["reactivacion", "requisitos", "otros"]);
  assert.deepEqual(s[1].filas.map((f) => f.ajuste.clave), ["edad_minima", "edad_maxima"]);
  assert.equal(s[1].filas[0].sufijo, "años");
  assert.equal(s[0].filas[0].sufijo, "horas");
  assert.equal(s[2].filas[0].etiqueta, "Nombre largo de nuevo_ajuste");
  assert.equal(s[2].filas[0].sufijo, "días");
});
