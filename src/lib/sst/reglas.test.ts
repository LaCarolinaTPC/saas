import { test } from "node:test";
import assert from "node:assert/strict";
import { caracterizar, diaSemana, validarAccidenteTrabajo } from "./reglas";

const HOY = "2026-10-29";
const base = {
  fechaAt: "2026-03-12", hora: "05:00", fechaNotificacion: "", cedula: "1.048.205.409", nombre: " Salomon Lascar Pestana ",
  cargo: "Conductor - cobrador", empresaUsuaria: "MTLC", ciudad: "Soledad", sexo: "M", tipoLesion: "aplastamiento",
  parteCuerpo: "Mano izquierda", parteCuerpoGrupo: "manos", mecanismo: "atrapamiento", agente: "medios_transporte",
  descripcion: "Se machucó el dedo con la puerta", accidenteTransito: false, diasIncapacidad: "5", estadoInvestigacion: "pendiente",
  cierreAdministrativoArl: null, observaciones: "",
};

test("validarAccidenteTrabajo: normaliza un caso completo", () => {
  const r = validarAccidenteTrabajo(base, HOY);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.datos.cedula, "1048205409");
  assert.equal(r.datos.nombre, "Salomon Lascar Pestana");
  assert.equal(r.datos.diasIncapacidad, 5);
  assert.equal(r.datos.fechaNotificacion, null);
  assert.equal(r.datos.observaciones, null);
});

test("validarAccidenteTrabajo: rechaza lo inválido", () => {
  const err = (x: Record<string, unknown>) => {
    const r = validarAccidenteTrabajo({ ...base, ...x }, HOY);
    return r.ok ? "" : r.error;
  };
  assert.match(err({ fechaAt: "2026-11-01" }), /futura/);
  assert.match(err({ fechaAt: "12/03/2026" }), /fecha del accidente/);
  assert.match(err({ hora: "5pm" }), /HH:MM/);
  assert.match(err({ nombre: "  " }), /nombre/);
  assert.match(err({ tipoLesion: "raro" }), /tipo de lesión/);
  assert.match(err({ parteCuerpoGrupo: "" }), /parte del cuerpo/);
  assert.match(err({ diasIncapacidad: "2.5" }), /entero/);
  assert.match(err({ diasIncapacidad: "-1" }), /entero/);
  assert.match(err({ fechaNotificacion: "2026-03-01" }), /anterior al accidente/);
});

test("diaSemana: lunes = 0", () => {
  assert.equal(diaSemana("2026-01-05"), 0); // lunes
  assert.equal(diaSemana("2026-01-24"), 5); // sábado
  assert.equal(diaSemana("2026-01-25"), 6); // domingo
});

test("caracterizar: conteos, porcentajes, días y repetidos", () => {
  const caso = (x: Record<string, unknown>) => ({
    fechaAt: "2026-02-13", cedula: "1", nombre: "Ana", cargo: "Conductor - cobrador", sexo: "M" as const, tipoLesion: "golpe_contusion" as const,
    parteCuerpoGrupo: "manos" as const, mecanismo: "pisadas_choques_golpes" as const, agente: "medios_transporte" as const,
    accidenteTransito: false, diasIncapacidad: 3, ...x,
  });
  const c = caracterizar([
    caso({}),
    caso({ fechaAt: "2026-03-12", accidenteTransito: true, diasIncapacidad: 5 }),
    caso({ cedula: "2", nombre: "Luis", fechaAt: "2026-03-16", parteCuerpoGrupo: "pies", tipoLesion: "torcedura_esguince", diasIncapacidad: 1 }),
  ] as never);
  assert.equal(c.total, 3);
  assert.equal(c.diasIncapacidad, 9);
  assert.equal(c.promedioDias, 3);
  assert.equal(c.transito, 1);
  assert.equal(c.trabajadores, 2);
  assert.deepEqual(c.repetidos.map((r) => [r.nombre, r.n]), [["Ana", 2]]);
  assert.deepEqual(c.porMes.slice(0, 3).map((m) => m.n), [0, 1, 2]);
  assert.equal(c.porParteCuerpo.find((p) => p.key === "manos")?.pct, 66.7);
  assert.equal(c.porTipoLesion.length, 17); // todas las opciones, también las de 0
  assert.equal(c.porDia.find((d) => d.label === "Lunes")?.n, 1); // 16-mar-2026
});
