import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FILTROS_VACIOS, anioDeRango, etiquetaMedida, etiquetaMotivo, filtrarProcesos, filtrosDesdeUrl, rangoAnio,
  resumenPorConductor, resumenPorMotivo, validarProceso, valoresDistintos, type Proceso,
} from "./reglas";

const base = {
  tipo: "citacion_descargos",
  fechaHecho: "2026-10-20",
  motivo: "faltas_injustificadas",
  motivoDetalle: "",
  descripcion: " Faltó 3 días seguidos ",
  fechaCitacion: "2026-10-22",
  fechaDescargos: "2026-10-24",
  asistio: true,
  resumenDescargos: "Dice que estaba enfermo",
  medida: "suspension",
  diasSuspension: "3",
  fechaMedida: "2026-10-25",
  medidaDetalle: "",
  responsable: "directora_gh",
};

test("validarProceso: normaliza una citación completa", () => {
  const r = validarProceso(base);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.datos.descripcion, "Faltó 3 días seguidos");
  assert.equal(r.datos.diasSuspension, 3);
  assert.equal(r.datos.asistio, true);
  assert.equal(r.datos.motivoDetalle, null);
});

test("validarProceso: un llamado de atención descarta los datos de descargos", () => {
  const r = validarProceso({ ...base, tipo: "llamado_atencion", medida: "llamado_escrito" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.datos.fechaCitacion, null);
  assert.equal(r.datos.asistio, null);
  assert.equal(r.datos.resumenDescargos, null);
  assert.equal(r.datos.diasSuspension, null);
});

test("validarProceso: errores de los campos obligatorios y coherencia de fechas", () => {
  const err = (x: Record<string, unknown>) => (validarProceso({ ...base, ...x }) as { error: string }).error;
  assert.match(err({ tipo: "x" }), /llamado de atención o citación/);
  assert.match(err({ motivo: "otro" }), /cuál es el motivo/);
  assert.match(err({ medida: "suspension", diasSuspension: "" }), /días de suspensión/);
  assert.match(err({ medida: "otra" }), /cuál fue la medida/);
  assert.match(err({ fechaCitacion: "2026-10-10" }), /anterior a los hechos/);
  assert.match(err({ fechaDescargos: "2026-10-21" }), /antes de la citación/);
  assert.match(err({ fechaHecho: "20/10/2026" }), /hechos no es válida/);
});

test("etiquetas con detalle", () => {
  assert.equal(etiquetaMotivo("otro", "Fumar en el bus"), "Otro: Fumar en el bus");
  assert.equal(etiquetaMedida("suspension", 1), "Suspensión de 1 día");
  assert.equal(etiquetaMedida("suspension", 3), "Suspensión de 3 días");
});

const p = (x: Partial<Proceso>): Proceso => ({
  id: Math.random().toString(),
  consecutivo: 1,
  cedula: "1",
  codigo: "500",
  nombre: "Ana",
  tipo: "citacion_descargos",
  fechaHecho: "2026-10-01",
  motivo: "faltas_injustificadas",
  motivoDetalle: null,
  descripcion: null,
  fechaCitacion: null,
  fechaDescargos: null,
  asistio: null,
  resumenDescargos: null,
  medida: "pendiente",
  diasSuspension: null,
  fechaMedida: null,
  medidaDetalle: null,
  responsable: null,
  normaIncumplida: null,
  cargo: null,
  area: null,
  realizadoPor: null,
  origen: "gestivo",
  createdByEmail: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedByEmail: null,
  updatedAt: null,
  ...x,
});

test("resumenPorConductor: conteos, asistencias, suspensiones y motivos", () => {
  const filas = resumenPorConductor([
    p({ asistio: true, medida: "suspension", diasSuspension: 3, fechaHecho: "2026-10-01" }),
    p({ asistio: false, motivo: "uso_celular", fechaHecho: "2026-10-15" }),
    p({ tipo: "llamado_atencion", medida: "llamado_escrito", fechaHecho: "2026-09-01" }),
    p({ cedula: "2", nombre: "Luis", tipo: "llamado_atencion", medida: "llamado_verbal" }),
  ]);
  assert.equal(filas[0].cedula, "1"); // más citaciones primero
  const ana = filas[0];
  assert.deepEqual(
    [ana.total, ana.llamados, ana.citaciones, ana.asistencias, ana.inasistencias, ana.suspensiones, ana.diasSuspension, ana.abiertos],
    [3, 1, 2, 1, 1, 1, 3, 1]
  );
  assert.equal(ana.ultimaFecha, "2026-10-15");
  assert.deepEqual(ana.motivos.map((m) => [m.motivo, m.cantidad]), [["faltas_injustificadas", 2], ["uso_celular", 1]]);
});

test("resumenPorMotivo: total, por tipo y conductores distintos", () => {
  const r = resumenPorMotivo([p({}), p({ cedula: "2" }), p({ tipo: "llamado_atencion" }), p({ motivo: "uso_celular" })]);
  assert.deepEqual(r[0], { motivo: "faltas_injustificadas", etiqueta: "Faltas injustificadas / ausentismo", total: 3, llamados: 1, citaciones: 2, conductores: 2 });
  assert.equal(r[1].motivo, "uso_celular");
});

test("validarProceso: campos del Excel (cargo, área, norma, realizado por)", () => {
  const r = validarProceso({ ...base, cargo: " Conductor-cobrador ", area: "operativa", normaIncumplida: "seguridad_vial", realizadoPor: "Yenifer Pinzón" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual([r.datos.cargo, r.datos.area, r.datos.normaIncumplida, r.datos.realizadoPor], ["Conductor-cobrador", "operativa", "seguridad_vial", "Yenifer Pinzón"]);
  const vacio = validarProceso({ ...base, area: "", normaIncumplida: "" });
  assert.equal(vacio.ok && vacio.datos.area === null && vacio.datos.normaIncumplida === null, true);
  assert.equal(validarProceso({ ...base, normaIncumplida: "inventada" }).ok, false);
  assert.equal(validarProceso({ ...base, area: "comercial" }).ok, false);
});

test("validarProceso: «no registrada» solo se conserva al editar un histórico", () => {
  assert.equal(validarProceso({ ...base, medida: "no_registrada" }).ok, false);
  assert.equal(validarProceso({ ...base, medida: "no_registrada", permitirNoRegistrada: true }).ok, true);
});

test("filtrosDesdeUrl: lee los parámetros y descarta fechas inválidas", () => {
  const f = filtrosDesdeUrl({ desde: "2025-01-01", hasta: "31/12/2025", norma: "normas_cst", por: "Yenifer Pinzón", q: "123" });
  assert.equal(f.desde, "2025-01-01");
  assert.equal(f.hasta, "");
  assert.equal(f.norma, "normas_cst");
  assert.equal(f.realizadoPor, "Yenifer Pinzón");
  assert.equal(f.q, "123");
});

test("rangoAnio / anioDeRango", () => {
  assert.deepEqual(rangoAnio("2025"), { desde: "2025-01-01", hasta: "2025-12-31" });
  assert.deepEqual(rangoAnio(""), { desde: "", hasta: "" });
  assert.equal(anioDeRango("2025-01-01", "2025-12-31"), "2025");
  assert.equal(anioDeRango("2025-02-01", "2025-12-31"), "");
});

test("filtrarProcesos: cada filtro y combinados", () => {
  const lista = [
    p({ id: "a", cedula: "1", fechaHecho: "2025-03-15", tipo: "llamado_atencion", medida: "llamado_escrito", normaIncumplida: "seguridad_vial", area: "operativa", cargo: "Conductor-cobrador", realizadoPor: "Yenifer Pinzón", origen: "historico", descripcion: "Falta: exceso de velocidad" }),
    p({ id: "b", cedula: "2", fechaHecho: "2026-01-10", asistio: true, medida: "suspension", diasSuspension: 2, normaIncumplida: "normas_cst", area: "administrativa", cargo: "Cajero", realizadoPor: "Edith Chiveta" }),
    p({ id: "c", cedula: "3", fechaHecho: "2026-02-01", asistio: false }),
    p({ id: "d", cedula: "4", fechaHecho: "2026-02-02" }),
  ];
  const ids = (f: Partial<typeof FILTROS_VACIOS>, sit?: Parameters<typeof filtrarProcesos>[2]) =>
    filtrarProcesos(lista, { ...FILTROS_VACIOS, ...f }, sit).map((x) => x.id);
  assert.deepEqual(ids({}), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(rangoAnio("2025")), ["a"]);
  assert.deepEqual(ids({ norma: "normas_cst" }), ["b"]);
  assert.deepEqual(ids({ medida: "suspension" }), ["b"]);
  assert.deepEqual(ids({ estado: "abiertos" }), ["c", "d"]);
  assert.deepEqual(ids({ estado: "cerrados" }), ["a", "b"]);
  assert.deepEqual(ids({ descargos: "asistio" }), ["b"]);
  assert.deepEqual(ids({ descargos: "no_asistio" }), ["c"]);
  assert.deepEqual(ids({ descargos: "sin_dato" }), ["d"]);
  assert.deepEqual(ids({ area: "administrativa" }), ["b"]);
  assert.deepEqual(ids({ cargo: "conductor-cobrador" }), ["a"]);
  assert.deepEqual(ids({ realizadoPor: "yenifer pinzon" }), ["a"]);
  assert.deepEqual(ids({ origen: "historico" }), ["a"]);
  assert.deepEqual(ids({ q: "velocidad" }), ["a"]);
  const sit = { activos: new Set(["1", "2"]), retirados: new Set(["3"]) };
  assert.deepEqual(ids({ situacion: "activo" }, sit), ["a", "b"]);
  assert.deepEqual(ids({ situacion: "retirado" }, sit), ["c"]);
  assert.deepEqual(ids({ ...rangoAnio("2026"), tipo: "citacion_descargos", estado: "abiertos" }), ["c", "d"]);
});

test("valoresDistintos: sin repetir por mayúsculas o tildes", () => {
  const v = valoresDistintos([p({ cargo: "Cajero" }), p({ cargo: "CAJERO" }), p({ cargo: "Vigilante" }), p({})], "cargo");
  assert.deepEqual(v, ["Cajero", "Vigilante"]);
});
