import { test } from "node:test";
import assert from "node:assert/strict";
import { etiquetaSeguimiento, masReciente, sugeridos, validarSeguimiento } from "./seguimiento-reglas";

const valido = {
  tipo: "incapacidad",
  fecha: "2026-10-27",
  responsable: "asistente_gh",
  motivo: "incapacidad_recurrente",
  accion: "  Llamada y reunión  ",
  compromisoConductor: "Entregar soportes",
  compromisoEmpresa: "",
  fechaLimite: "2026-10-31",
  estado: "abierto",
  proximaRevision: "2026-11-07",
};

test("validarSeguimiento: limpia textos y fechas vacías", () => {
  const r = validarSeguimiento(valido);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.datos.accion, "Llamada y reunión");
  assert.equal(r.datos.compromisoEmpresa, null);
  assert.equal(r.datos.fechaLimite, "2026-10-31");
  const sinFechas = validarSeguimiento({ ...valido, fechaLimite: "", proximaRevision: null });
  assert.ok(sinFechas.ok && sinFechas.datos.fechaLimite === null && sinFechas.datos.proximaRevision === null);
});

test("validarSeguimiento: rechaza listas y fechas inválidas", () => {
  assert.match((validarSeguimiento({ ...valido, tipo: "otro" }) as { error: string }).error, /tipo/);
  assert.match((validarSeguimiento({ ...valido, responsable: "gerente" }) as { error: string }).error, /responsable/);
  assert.match((validarSeguimiento({ ...valido, motivo: "x" }) as { error: string }).error, /motivo/);
  assert.match((validarSeguimiento({ ...valido, estado: "cerrado" }) as { error: string }).error, /estado/);
  assert.match((validarSeguimiento({ ...valido, fecha: "27/10/2026" }) as { error: string }).error, /fecha del seguimiento/);
  assert.match((validarSeguimiento({ ...valido, fechaLimite: "2026-10-20" }) as { error: string }).error, /anterior/);
  assert.match((validarSeguimiento({ ...valido, accion: "x".repeat(1001) }) as { error: string }).error, /1000/);
});

test("etiquetaSeguimiento: estados y avisos del abierto", () => {
  const hoy = "2026-10-27";
  assert.equal(etiquetaSeguimiento(null, hoy).texto, "Sin seguimiento");
  assert.equal(etiquetaSeguimiento({ estado: "cumplido", fechaLimite: "2026-10-01", proximaRevision: null }, hoy).texto, "Compromiso cumplido");
  assert.equal(etiquetaSeguimiento({ estado: "incumplido", fechaLimite: null, proximaRevision: null }, hoy).texto, "Compromiso no cumplido");
  const abierto = (fechaLimite: string | null, proximaRevision: string | null) =>
    etiquetaSeguimiento({ estado: "abierto", fechaLimite, proximaRevision }, hoy);
  assert.deepEqual([abierto("2026-10-31", "2026-11-07").clave, abierto("2026-10-31", "2026-11-07").aviso], ["en_seguimiento", null]);
  assert.equal(abierto("2026-10-26", "2026-11-07").aviso, "vencido");
  assert.equal(abierto("2026-10-31", "2026-10-25").aviso, "revision_atrasada");
  assert.equal(abierto(null, "2026-10-27").aviso, "revisar_hoy");
  // El vencimiento manda sobre la revisión.
  assert.equal(abierto("2026-10-20", "2026-10-20").aviso, "vencido");
});

test("masReciente: por fecha y, a igual fecha, el último creado", () => {
  assert.equal(masReciente([]), null);
  const a = { fecha: "2026-10-20", createdAt: "2026-10-27T10:00:00Z", id: "a" };
  const b = { fecha: "2026-10-25", createdAt: "2026-10-25T10:00:00Z", id: "b" };
  const c = { fecha: "2026-10-25", createdAt: "2026-10-26T10:00:00Z", id: "c" };
  assert.equal(masReciente([a, b, c])?.id, "c");
});

test("sugeridos: faltas, luego incapacidades, luego EPS", () => {
  assert.deepEqual(sugeridos({ noJustificadas: 3, incapacidades: 1, eps: 0 }), { tipo: "ausentismo", motivo: "faltas_injustificadas" });
  assert.deepEqual(sugeridos({ noJustificadas: 0, incapacidades: 2, eps: 2 }), { tipo: "incapacidad", motivo: "incapacidad_recurrente" });
  assert.deepEqual(sugeridos({ noJustificadas: 0, incapacidades: 0, eps: 4 }), { tipo: "eps", motivo: "eps_recurrente" });
  assert.deepEqual(sugeridos({ noJustificadas: 0, incapacidades: 0, eps: 0 }), { tipo: "ausentismo", motivo: "faltas_injustificadas" });
});
