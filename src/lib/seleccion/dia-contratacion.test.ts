import { test } from "node:test";
import assert from "node:assert/strict";
import { psicotecnicaVigente, validarPsicoExterna } from "./dia-contratacion";
import { condicionesContratar } from "./contratacion";

test("psicotecnicaVigente: sin resultado registrado", () => {
  assert.deepEqual(psicotecnicaVigente(null), { resultado: null, fuente: null, detalle: "Sin resultado registrado" });
});

test("psicotecnicaVigente: con observaciones cuenta como apto", () => {
  const v = psicotecnicaVigente({ resultado: "apto_con_observaciones", fecha: "2026-11-20", entidad: "IPS Vial" });
  assert.equal(v.resultado, "apto");
  assert.equal(v.fuente, "externa");
  assert.equal(v.detalle, "Apto con observaciones (IPS Vial, 2026-11-20)");
  assert.equal(psicotecnicaVigente({ resultado: "no_apto", fecha: null, entidad: null }).detalle, "No apto (registrada a mano)");
});

test("validarPsicoExterna", () => {
  const hoy = "2026-11-20";
  assert.equal(validarPsicoExterna({ resultado: "x", fecha: hoy }, hoy).ok, false);
  assert.equal(validarPsicoExterna({ resultado: "apto", fecha: "" }, hoy).ok, false);
  assert.equal(validarPsicoExterna({ resultado: "apto", fecha: "2026-11-21" }, hoy).ok, false);
  assert.equal(validarPsicoExterna({ resultado: "apto", fecha: hoy, puntaje: "abc" }, hoy).ok, false);
  const r = validarPsicoExterna({ resultado: "no_apto", fecha: "2026-11-19", puntaje: "72,5", entidad: "  IPS  " }, hoy);
  assert.deepEqual(r, { ok: true, valor: { resultado: "no_apto", fecha: "2026-11-19", puntaje: 72.5, entidad: "IPS" } });
});

test("condicionesContratar muestra de dónde salió la psicotécnica", () => {
  const r = condicionesContratar({
    examenes: [],
    rutasAprendidas: 0,
    rutasMinimas: 2,
    reingreso: false,
    itemsCarpeta: [],
    carpeta: [],
    aprobada: true,
    exigePsicotecnica: true,
    psicotecnica: "apto",
    psicotecnicaDetalle: "Apto (IPS Vial, 2026-11-20)",
  });
  const c = r.condiciones.find((x) => x.id === "psicotecnica")!;
  assert.equal(c.cumple, true);
  assert.equal(c.detalle, "Apto (IPS Vial, 2026-11-20)");
});
