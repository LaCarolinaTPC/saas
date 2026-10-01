import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avanceDia, consolidar, fechasDelRango, fotoDesdeResultado, puedeCerrarDia, ultimoCierrePorDia, INICIO_REVISION_GESTIVO,
  type CheckRevision, type CierreDia, type FotoDia,
} from "./revision-timbradas-consolidado";
import type { EstadoTimbrada, FilaRevision } from "./revision-timbradas-reglas";

const D = "2026-09-30";
const foto = (viajes: [number, EstadoTimbrada][], fecha = D): FotoDia => ({
  fecha, totalViajes: viajes.length + 10, porRevisar: viajes.length, alertas: 1,
  conteoEstados: {}, viajes: viajes.map(([numero, estado]) => ({ numero, estado, placa: "ABC123", viaje: 1 })),
  calculadoAt: "2026-10-01T09:00:00Z",
});
const check = (numero: number, email = "a@x.co", at = "2026-10-01T10:00:00Z", fecha = D): CheckRevision => ({ fecha, numero, revisadoPorEmail: email, revisadoAt: at });
const cierre = (numeros: number[], at = "2026-10-01T12:00:00Z", fecha = D): CierreDia => ({
  fecha, cerradoAt: at, cerradoPorEmail: "jefe@x.co", porRevisar: numeros.length, revisados: numeros.length, numeros,
});

test("foto del día: solo los viajes que requieren revisión", () => {
  const fila = (numero: number, estado: EstadoTimbrada) => ({ numero, estado, placa: "P", viaje: 1, difSR: null, difSB: null } as unknown as FilaRevision);
  const f = fotoDesdeResultado({ fecha: D, filas: [fila(1, "OK"), fila(2, "Diferencia Por Revisar"), fila(3, "N/A - No Despachado"), fila(4, "Sin Recaudo - Con Timbradas")] }, "t");
  assert.equal(f.totalViajes, 4);
  assert.deepEqual(f.viajes.map((v) => v.numero), [2, 4]);
  assert.equal(f.porRevisar, 2);
  assert.equal(f.alertas, 2); // diferencia y sin recaudo
  assert.deepEqual(f.conteoEstados, { OK: 1, "Diferencia Por Revisar": 1, "N/A - No Despachado": 1, "Sin Recaudo - Con Timbradas": 1 });
});

test("estados del día según checks y cierre", () => {
  const f = foto([[1, "Diferencia Por Revisar"], [2, "Revisar - Cartulina Con PV"], [3, "Diferencia Por Revisar"]]);
  assert.equal(avanceDia(D, null, [], null).estadoDia, "sin_calculo");
  assert.equal(avanceDia(D, foto([]), [], null).estadoDia, "sin_pendientes");
  assert.equal(avanceDia(D, f, [], null).estadoDia, "sin_revisar");

  const enCurso = avanceDia(D, f, [check(1)], null);
  assert.equal(enCurso.estadoDia, "en_curso");
  assert.deepEqual([enCurso.revisados, enCurso.pendientes, enCurso.avance], [1, 2, 33.3]);
  assert.deepEqual(enCurso.pendientesPorEstado, { "Revisar - Cartulina Con PV": 1, "Diferencia Por Revisar": 1 });

  const completo = avanceDia(D, f, [check(1), check(2), check(3)], null);
  assert.equal(completo.estadoDia, "completo");
  assert.equal(completo.avance, 100);
  assert.equal(puedeCerrarDia(completo), true);
  assert.equal(puedeCerrarDia(enCurso), false);

  const cerrado = avanceDia(D, f, [check(1), check(2), check(3)], cierre([1, 2, 3]));
  assert.equal(cerrado.estadoDia, "cerrado");
  assert.equal(puedeCerrarDia(cerrado), false);
});

test("check en viaje que GEMA ya resolvió no suma al avance", () => {
  const f = foto([[1, "Diferencia Por Revisar"]]);
  const a = avanceDia(D, f, [check(1), check(99)], null); // el 99 hoy está OK
  assert.deepEqual([a.revisados, a.pendientes, a.resueltosPorGema, a.estadoDia], [1, 0, 1, "completo"]);
});

test("pendiente que entra después del cierre reabre el día", () => {
  const f = foto([[1, "Diferencia Por Revisar"], [2, "Diferencia Por Revisar"], [5, "Diferencia Por Revisar"]]);
  // Se cerró con 1 y 2; luego un recaudo tardío volvió Diferencia el 5.
  const a = avanceDia(D, f, [check(1), check(2)], cierre([1, 2]));
  assert.deepEqual([a.estadoDia, a.pendientes, a.nuevosTrasCierre], ["reabierto", 1, 1]);
  // Quitar un check después del cierre también reabre, pero no es "nuevo".
  const b = avanceDia(D, foto([[1, "Diferencia Por Revisar"], [2, "Diferencia Por Revisar"]]), [check(1)], cierre([1, 2]));
  assert.deepEqual([b.estadoDia, b.pendientes, b.nuevosTrasCierre], ["reabierto", 1, 0]);
  // Tras revisar el nuevo se puede volver a cerrar, y el último cierre manda.
  const c = ultimoCierrePorDia([cierre([1, 2]), cierre([1, 2, 5], "2026-10-02T08:00:00Z")]);
  assert.deepEqual(c.get(D)?.numeros, [1, 2, 5]);
});

test("consolidado del periodo: totales, por estado y por revisor", () => {
  const d1 = "2026-09-30", d2 = "2026-10-01";
  const c = consolidar(
    [d1, d2],
    [foto([[1, "Diferencia Por Revisar"], [2, "Sin Recaudo - Con Timbradas"]], d1), foto([[3, "Diferencia Por Revisar"]], d2)],
    [check(1, "a@x.co", "2026-10-01T10:00:00Z", d1), check(2, "b@x.co", "2026-10-01T11:00:00Z", d1), check(7, "a@x.co", "2026-10-02T09:00:00Z", d2)],
    [cierre([1, 2], "2026-10-01T12:00:00Z", d1)],
  );
  assert.deepEqual(c.dias.map((d) => [d.fecha, d.estadoDia]), [[d2, "sin_revisar"], [d1, "cerrado"]]);
  assert.deepEqual(
    [c.totales.porRevisar, c.totales.revisados, c.totales.pendientes, c.totales.avance, c.totales.diasCerrados, c.totales.diasConPendientes],
    [3, 2, 1, 66.6, 1, 1],
  );
  const dif = c.porEstado.find((e) => e.estado === "Diferencia Por Revisar")!;
  assert.deepEqual([dif.porRevisar, dif.revisados, dif.pendientes], [2, 1, 1]);
  assert.equal(c.porEstado.some((e) => e.estado === "OK"), false);
  assert.deepEqual(c.porRevisor.map((r) => [r.email, r.checks, r.dias, r.diasCerrados]), [
    ["a@x.co", 2, 2, 0],
    ["b@x.co", 1, 1, 0],
    ["jefe@x.co", 0, 0, 1],
  ]);
});

test("rango de fechas recortado al inicio de la revisión en Gestivo", () => {
  assert.deepEqual(fechasDelRango("2026-09-01", "2026-10-02"), [INICIO_REVISION_GESTIVO, "2026-10-01", "2026-10-02"]);
  assert.deepEqual(fechasDelRango("2026-10-05", "2026-10-04"), []);
});
