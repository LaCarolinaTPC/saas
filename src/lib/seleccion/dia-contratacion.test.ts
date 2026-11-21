import { test } from "node:test";
import assert from "node:assert/strict";
import { psicotecnicaVigente, tocaRecordatorioPsicotecnica, validarPsicoExterna } from "./dia-contratacion";
import { condicionesContratar } from "./contratacion";
import type { Cita } from "./agenda";

test("psicotecnicaVigente: sin nada, sin concepto", () => {
  assert.deepEqual(psicotecnicaVigente(null, null), { resultado: null, fuente: null, detalle: "Sin concepto de psicología" });
});

test("psicotecnicaVigente: la IPS con observaciones cuenta como apto", () => {
  const v = psicotecnicaVigente(null, { resultado: "apto_con_observaciones", fecha: "2026-11-20", entidad: "IPS Vial" });
  assert.equal(v.resultado, "apto");
  assert.equal(v.fuente, "externa");
  assert.equal(v.detalle, "Apto con observaciones (IPS Vial, 2026-11-20)");
});

test("psicotecnicaVigente: vale la más reciente de las dos", () => {
  // Concepto de Gestivo el 18 (hora de Bogotá), IPS el 20: gana la IPS.
  const g = { concepto: "no_apto" as const, en: "2026-11-18T20:00:00Z" };
  assert.equal(psicotecnicaVigente(g, { resultado: "apto", fecha: "2026-11-20", entidad: null }).fuente, "externa");
  // IPS el 15: gana Gestivo.
  const v = psicotecnicaVigente(g, { resultado: "apto", fecha: "2026-11-15", entidad: null });
  assert.equal(v.fuente, "gestivo");
  assert.equal(v.resultado, "no_apto");
  assert.equal(v.detalle, "No apto (prueba de Gestivo)");
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

const cita = (p: Partial<Cita> = {}): Cita => ({
  id: "c",
  proceso_id: "p",
  tipo: "psicotecnica",
  fecha: "2026-11-20",
  hora: "10:00:00",
  estado: "programada",
  reprogramada_por: null,
  confirmada_at: null,
  llego_at: null,
  recordatorio_at: null,
  alerta_at: null,
  inasistencia_at: null,
  creada_por: null,
  created_at: "2026-11-19T12:00:00Z",
  ...p,
});
const a = { recordatorioCitaHora: "08:00" };
const bogota = (hora: string, dia = "2026-11-20") => new Date(`${dia}T${hora}:00-05:00`);

test("tocaRecordatorioPsicotecnica: el día de la cita, entre la hora del recordatorio y la cita", () => {
  assert.equal(tocaRecordatorioPsicotecnica(cita(), bogota("07:59"), a), false);
  assert.equal(tocaRecordatorioPsicotecnica(cita(), bogota("08:00"), a), true);
  assert.equal(tocaRecordatorioPsicotecnica(cita(), bogota("10:00"), a), false);
  assert.equal(tocaRecordatorioPsicotecnica(cita(), bogota("09:00", "2026-11-19"), a), false);
  assert.equal(tocaRecordatorioPsicotecnica(cita({ recordatorio_at: "x" }), bogota("09:00"), a), false);
  assert.equal(tocaRecordatorioPsicotecnica(cita({ estado: "cancelada" }), bogota("09:00"), a), false);
  assert.equal(tocaRecordatorioPsicotecnica(cita({ tipo: "prueba_manejo" }), bogota("09:00"), a), false);
});
