import { test } from "node:test";
import assert from "node:assert/strict";
import { versionNuevaEnMeta } from "./plantillas";

const texto = "Hola, {nombre}. El {fecha} te presentas a las {hora} en {laboratorio}.";
const cuerpo = "Hola, {{1}}. El {{2}} te presentas a las {{3}} en {{4}}.";

test("plantillas: adopta la «_vN» más nueva de Meta con el mismo texto (enviada desde otra base)", () => {
  const meta = [
    { nombre: "sel_examenes_fase1", cuerpo: "Hola, {{1}}. Mañana…" },
    { nombre: "sel_examenes_fase1_v2", cuerpo },
    { nombre: "sel_examenes_fase1_v3", cuerpo: "otro texto" },
    { nombre: "sel_examenes_fase10_v4", cuerpo },
  ];
  assert.deepEqual(versionNuevaEnMeta({ plantilla_nombre: "sel_examenes_fase1", texto }, meta), { nombre: "sel_examenes_fase1_v2" });
  // Si la activa ya es la v2, no hay nada más nuevo con ese texto.
  assert.equal(versionNuevaEnMeta({ plantilla_nombre: "sel_examenes_fase1_v2", texto }, meta), null);
  // Otro texto: no se adopta nada.
  assert.equal(versionNuevaEnMeta({ plantilla_nombre: "sel_examenes_fase1", texto: "Distinto {nombre}" }, meta), null);
});
