import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaRunt, interpretarRuntCroma, interpretarSimitCroma, interpretarTrabajoCroma, interpretarTrabajoRunt } from "./proveedores";

test("SIMIT de Croma: sin cuenta, a paz y salvo y con deuda", () => {
  assert.deepEqual(interpretarSimitCroma({ found: false }).valor, 0);
  const limpio = interpretarSimitCroma({ found: true, clear: true, summary: { total: 0 } });
  assert.equal(limpio.estado, "ok");
  assert.equal(limpio.valor, 0);
  const deuda = interpretarSimitCroma({ found: true, clear: false, summary: { total: 1_250_000 } });
  assert.equal(deuda.estado, "hallazgo");
  assert.equal(deuda.valor, 1_250_000);
});

test("SIMIT de Croma: total nulo usa multas + acuerdos, o falla si no hay nada", () => {
  assert.equal(interpretarSimitCroma({ found: true, summary: { total: null, total_fines: 500_000, total_agreements: 200_000 } }).valor, 700_000);
  assert.equal(interpretarSimitCroma({ found: true, clear: true, summary: { total: null } }).valor, 0);
  assert.equal(interpretarSimitCroma({ found: true, summary: { total: null } }).estado, "error");
  assert.equal(interpretarSimitCroma(null).estado, "error");
  // La cédula nunca debe coincidir como placa.
  assert.equal(interpretarSimitCroma({ found: true, is_plate: true, summary: { total: 0 } }).estado, "error");
});

test("trabajo asíncrono de Croma: en curso, terminado y fallido", () => {
  const enCurso = interpretarTrabajoCroma({ job: { id: "job_1", status: "running" }, data: null, error: null });
  assert.equal(enCurso.estado, "pendiente");
  assert.equal(enCurso.trabajoId, "job_1");
  const listo = interpretarTrabajoCroma({ job: { id: "job_1", status: "completed" }, data: { found: true, summary: { total: 3_500_000 } }, error: null });
  assert.equal(listo.valor, 3_500_000);
  const fallo = interpretarTrabajoCroma({ job: { id: "job_1", status: "failed" }, data: null, error: { message: "upstream caído" } });
  assert.equal(fallo.estado, "error");
  assert.equal(fallo.error, "upstream caído");
});

test("RUNT de Croma: sin registro o sin licencias", () => {
  for (const data of [{ found: false }, { found: true, person: { has_licenses: false }, licenses: [] }, { found: true, licenses: [] }]) {
    const r = interpretarRuntCroma(data, "2026-11-14");
    assert.equal(r.estado, "ok");
    assert.equal(r.resumen?.tieneLicencia, false);
    // Sin registro no es lo mismo que sin licencia: la cédula puede estar mal escrita.
    assert.equal(r.resumen?.registrado, data.found !== false);
  }
  assert.equal(interpretarRuntCroma(null).estado, "error");
});

test("RUNT de Croma: categorías con su vencimiento y licencias que no están en firme", () => {
  const r = interpretarRuntCroma(
    {
      found: true,
      person: { has_licenses: true },
      licenses: [
        { status: "ACTIVA", is_retained: false, cancellation_date: null, categories: [{ category: "C2", expiry_date: "10/05/2029" }, { category: "B1", expiry_date: "2031-01-02T00:00:00" }] },
        { status: "CANCELADA", cancellation_date: "2020-01-01", categories: [{ category: "C3", expiry_date: "2027-01-01" }] },
        { status: "ACTIVA", suspension_start_date: "2026-10-01", suspension_end_date: "2027-04-01", categories: [{ category: "c-1", expiry_date: null, exam_expiry_date: "2028-03-03" }] },
      ],
    },
    "2026-11-14"
  );
  assert.equal(r.resumen?.tieneLicencia, true);
  assert.deepEqual(r.resumen?.categorias, [
    { categoria: "C2", vence: "2029-05-10", activa: true },
    { categoria: "B1", vence: "2031-01-02", activa: true },
    { categoria: "C3", vence: "2027-01-01", activa: false },
    { categoria: "C1", vence: "2028-03-03", activa: false },
  ]);
  assert.equal(fechaRunt("fecha rara"), null);
});

test("RUNT de Croma: trabajo asíncrono", () => {
  assert.equal(interpretarTrabajoRunt({ job: { id: "j", status: "queued" } }).estado, "pendiente");
  assert.equal(interpretarTrabajoRunt({ job: { id: "j", status: "completed" }, data: { found: false } }).resumen?.tieneLicencia, false);
  assert.equal(interpretarTrabajoRunt({ job: { id: "j", status: "failed" }, error: { message: "RUNT caído" } }).error, "RUNT caído");
});
