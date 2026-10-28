import { test } from "node:test";
import assert from "node:assert/strict";
import { etiquetaMedida, etiquetaMotivo, resumenPorConductor, resumenPorMotivo, validarProceso, type Proceso } from "./reglas";

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
