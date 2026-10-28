import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VENTANA_RANGO, errorRangoReincidentes, etiquetaRangoReincidentes, filtrarReincidentes,
  resolverRangoReincidentes, textoRangoReincidentes,
} from "./reincidentes-filtros";
import { CRITERIO_KEYS, NIVELES_ALERTA } from "./constants";
import type { Reincidente } from "./data";

const HOY = "2026-10-28";

test("sin parámetros: mes en curso hasta hoy", () => {
  assert.deepEqual(resolverRangoReincidentes({}, HOY), { desde: "2026-10-01", corte: HOY, ventana: "mes" });
});

test("enlace viejo con corte y ventana sigue funcionando", () => {
  assert.deepEqual(
    resolverRangoReincidentes({ corte: "2026-09-30", ventana: "30" }, HOY),
    { desde: "2026-09-01", corte: "2026-09-30", ventana: "30" }
  );
});

test("desde y hasta personalizados", () => {
  assert.deepEqual(
    resolverRangoReincidentes({ desde: "2026-08-15", corte: "2026-09-10", ventana: VENTANA_RANGO }, HOY),
    { desde: "2026-08-15", corte: "2026-09-10", ventana: VENTANA_RANGO }
  );
});

test("un desde que coincide con el atajo conserva el atajo", () => {
  assert.equal(resolverRangoReincidentes({ desde: "2026-10-01", corte: HOY, ventana: "mes" }, HOY).ventana, "mes");
  // El mismo desde con otra ventana no coincide: queda personalizado.
  assert.equal(resolverRangoReincidentes({ desde: "2026-10-01", corte: HOY, ventana: "90" }, HOY).ventana, VENTANA_RANGO);
});

test("corte futuro se recorta a hoy; desde posterior al corte se ignora", () => {
  assert.equal(resolverRangoReincidentes({ corte: "2027-01-01" }, HOY).corte, HOY);
  assert.deepEqual(
    resolverRangoReincidentes({ desde: "2026-10-20", corte: "2026-10-10", ventana: VENTANA_RANGO }, HOY),
    { desde: "2026-10-01", corte: "2026-10-10", ventana: "mes" }
  );
});

test("fechas basura caen al valor por defecto", () => {
  assert.deepEqual(
    resolverRangoReincidentes({ desde: "ayer", corte: "2026-13-45", ventana: "7" }, HOY),
    { desde: "2026-10-01", corte: HOY, ventana: "mes" }
  );
});

test("un rango de más de 366 días se recorta desde el corte", () => {
  const r = resolverRangoReincidentes({ desde: "2024-01-01", corte: HOY, ventana: VENTANA_RANGO }, HOY);
  assert.equal(r.desde, "2025-10-28");
  assert.equal(errorRangoReincidentes(r.desde, r.corte, HOY), null);
});

test("errores del formulario", () => {
  assert.equal(errorRangoReincidentes("2026-10-01", HOY, HOY), null);
  assert.match(errorRangoReincidentes("2026-10-10", "2026-10-01", HOY)!, /termina antes/);
  assert.match(errorRangoReincidentes("2026-10-01", "2026-10-29", HOY)!, /posterior a hoy/);
  assert.match(errorRangoReincidentes("2025-01-01", HOY, HOY)!, /reporte histórico/);
  assert.match(errorRangoReincidentes("", HOY, HOY)!, /dos fechas/);
});

test("textos y etiquetas del rango", () => {
  assert.equal(textoRangoReincidentes({ desde: "2026-10-01", corte: HOY, ventana: "mes" }), "el mes en curso (2026-10-01 a 2026-10-28)");
  assert.equal(textoRangoReincidentes({ desde: "2026-09-29", corte: HOY, ventana: "30" }), "los 30 días anteriores al 2026-10-28");
  assert.equal(textoRangoReincidentes({ desde: "2026-08-15", corte: "2026-09-10", ventana: VENTANA_RANGO }), "el rango del 2026-08-15 al 2026-09-10");
  assert.equal(etiquetaRangoReincidentes({ desde: "2026-08-15", corte: "2026-09-10", ventana: VENTANA_RANGO }), "2026-08-15 a 2026-09-10");
  assert.equal(etiquetaRangoReincidentes({ desde: "2026-09-29", corte: HOY, ventana: "30" }), "30 d");
});

function reincidente(p: Partial<Reincidente> & { cedula: string; nombre: string }): Reincidente {
  return {
    codigo: null, telefono: null, retirado: false, fechaRetiro: null, total: 3, noJustificadas: 0,
    soportesPendientes: 0, eps: 0, incapacidades: 0, diasIncapacidad: 0,
    racha: { dias: 0, desde: null, hasta: null }, notificaciones: { descargos: null, terminacion: null },
    seguimiento: { ultimo: null, total: 0 }, pendientes: [], tipos: {}, ultimaFecha: "2026-10-01",
    alerta: null, ausencias: [],
    ...p,
  } as Reincidente;
}

const LISTA = [
  reincidente({ cedula: "100", nombre: "Ana Peña", codigo: "C10", alerta: "terminacion", pendientes: ["terminacion"] }),
  reincidente({ cedula: "200", nombre: "Bruno Díaz", alerta: "descargos" }),
  reincidente({ cedula: "300", nombre: "Carla Ruiz", alerta: "critica" }),
  reincidente({ cedula: "400", nombre: "Darío Gómez", alerta: "alta", soportesPendientes: 2 }),
  reincidente({ cedula: "500", nombre: "Elena Mora", alerta: null }),
];
const ced = (l: Reincidente[]) => l.map((r) => r.cedula);

test("cada criterio devuelve solo lo que dice", () => {
  const f = (criterio: string, q = "") => ced(filtrarReincidentes(LISTA, { criterio, q }));
  assert.deepEqual(f(""), ["100", "200", "300", "400", "500"]);
  assert.deepEqual(f("alerta"), ["100", "200", "300", "400"]);
  assert.deepEqual(f("terminacion"), ["100"]);
  assert.deepEqual(f("descargos"), ["200"]);
  assert.deepEqual(f("critica"), ["300"]);
  assert.deepEqual(f("alta"), ["400"]);
  assert.deepEqual(f("sin_notificar"), ["100"]);
  assert.deepEqual(f("soportes"), ["400"]);
});

test("cada chip de nivel es un criterio válido de la URL", () => {
  for (const n of NIVELES_ALERTA) assert.ok(CRITERIO_KEYS.has(n), `falta el criterio ${n}`);
  assert.ok(CRITERIO_KEYS.has("sin_notificar") && CRITERIO_KEYS.has("soportes"));
});

test("búsqueda por nombre (sin tildes), cédula y código", () => {
  const f = (q: string) => ced(filtrarReincidentes(LISTA, { criterio: "", q }));
  assert.deepEqual(f("pena"), ["100"]);
  assert.deepEqual(f("DÍAZ"), ["200"]);
  assert.deepEqual(f("30"), ["300"]);
  assert.deepEqual(f("c10"), ["100"]);
  assert.deepEqual(f("zzz"), []);
  assert.deepEqual(f("darío"), ["400"]);
  assert.deepEqual(ced(filtrarReincidentes(LISTA, { criterio: "alta", q: "ana" })), []);
});
