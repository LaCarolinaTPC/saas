import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularKpis,
  contarFactoresPolitica,
  esResponsabilidadPropia,
  etiquetaMes,
  generarPrescriptivos,
  mesDe,
  pasaFiltros,
  porGravedad,
  porResponsabilidad,
  porRuta,
  rankingConductores,
  serieMensual,
  type FilaAccidente,
} from "./analisis";

// ── Factoría de filas ──────────────────────────────────────────────────────────

let seq = 0;
function fila(p: Partial<FilaAccidente> = {}): FilaAccidente {
  seq += 1;
  return {
    id: `id-${seq}`,
    consecutivo: seq,
    fecha: "2026-10-05T09:00:00-05:00",
    origen: "gestivo",
    conductorCedula: `C${seq}`,
    conductorNombre: `Conductor ${seq}`,
    direccion: "Calle 1",
    vehiculoCodigo: null,
    vehiculoPlaca: null,
    vehiculoRuta: null,
    tenencia: "empresa",
    clase: "simple",
    responsabilidad: "tercero",
    factores: [],
    factoresPolitica: { exceso_velocidad: false, uso_celular: false, no_distancia: false, fatiga: false },
    velocidad: null,
    costoReparacion: null,
    arregloMonto: null,
    casoEstado: null,
    estado: "aprobado",
    tieneIpat: null,
    aseguradora: null,
    ...p,
  };
}

// ── Utilidades ──────────────────────────────────────────────────────────────────

test("mesDe y etiquetaMes", () => {
  assert.equal(mesDe("2026-10-05T09:00:00-05:00"), "2026-10");
  assert.equal(etiquetaMes("2026-10"), "oct 26");
});

test("responsabilidad propia: directo y compartido", () => {
  assert.equal(esResponsabilidadPropia("directo"), true);
  assert.equal(esResponsabilidadPropia("compartido"), true);
  assert.equal(esResponsabilidadPropia("tercero"), false);
  assert.equal(esResponsabilidadPropia("en_estudio"), false);
  assert.equal(esResponsabilidadPropia(null), false);
});

// ── KPIs ─────────────────────────────────────────────────────────────────────

test("calcularKpis: conteos, gravedad, costo y reincidencia", () => {
  const rows = [
    fila({ conductorCedula: "A", responsabilidad: "directo", clase: "muerto", costoReparacion: 1000, tieneIpat: true, casoEstado: "abierto" }),
    fila({ conductorCedula: "A", responsabilidad: "compartido", clase: "lesionado", costoReparacion: 500 }),
    fila({ conductorCedula: "B", responsabilidad: "tercero", clase: "simple", costoReparacion: 0 }),
    fila({ conductorCedula: "C", responsabilidad: "en_estudio", clase: "simple" }),
  ];
  const k = calcularKpis(rows);
  assert.equal(k.total, 4);
  assert.equal(k.pctResponsabilidadPropia, 50); // A(directo)+A(compartido) = 2/4
  assert.equal(k.pctGraves, 50); // muerto + lesionado
  assert.equal(k.fatales, 1);
  assert.equal(k.costoReparacionTotal, 1500);
  assert.equal(k.costoReparacionPromedio, 750); // solo cuenta los 2 con costo > 0
  assert.equal(k.conductoresReincidentes, 1); // A tiene 2
  assert.equal(k.pctReincidencia, 50); // 2 de 4 accidentes son de A
  assert.equal(k.casosAbiertos, 1);
  assert.equal(k.pctConIpat, 25);
});

test("calcularKpis: variación vs periodo anterior", () => {
  const ahora = [fila(), fila(), fila()];
  const antes = [fila(), fila()];
  assert.equal(calcularKpis(ahora, antes).variacion, 50); // 3 vs 2 = +50%
  assert.equal(calcularKpis(ahora).variacion, null); // sin base
});

// ── Agregaciones ─────────────────────────────────────────────────────────────

test("serieMensual ordena en el tiempo y cuenta graves", () => {
  const s = serieMensual([
    fila({ fecha: "2026-09-10T08:00:00-05:00", clase: "simple" }),
    fila({ fecha: "2026-10-01T08:00:00-05:00", clase: "muerto" }),
    fila({ fecha: "2026-10-20T08:00:00-05:00", clase: "lesionado" }),
  ]);
  assert.deepEqual(s.map((p) => p.clave), ["2026-09", "2026-10"]);
  assert.equal(s[1].count, 2);
  assert.equal(s[1].graves, 2);
});

test("contarFactoresPolitica ordena por frecuencia", () => {
  const f = (pol: Partial<FilaAccidente["factoresPolitica"]>) =>
    fila({ factoresPolitica: { exceso_velocidad: false, uso_celular: false, no_distancia: false, fatiga: false, ...pol } });
  const r = contarFactoresPolitica([
    f({ exceso_velocidad: true }),
    f({ exceso_velocidad: true, uso_celular: true }),
    f({ uso_celular: true }),
    f({ exceso_velocidad: true }),
  ]);
  assert.equal(r[0].clave, "exceso_velocidad");
  assert.equal(r[0].count, 3);
  assert.equal(r[1].clave, "uso_celular");
  assert.equal(r[1].count, 2);
});

test("porResponsabilidad y porGravedad con 'Sin dato'", () => {
  const resp = porResponsabilidad([fila({ responsabilidad: "directo" }), fila({ responsabilidad: null })]);
  assert.ok(resp.some((p) => p.clave === "__sin__" && p.count === 1));
  const grav = porGravedad([fila({ clase: "muerto" }), fila({ clase: "muerto" }), fila({ clase: "simple" })]);
  assert.equal(grav[0].clave, "muerto");
  assert.equal(grav[0].count, 2);
});

test("porRuta agrupa el excedente en 'Otros'", () => {
  const rows = ["R1", "R1", "R2", "R3"].map((r) => fila({ vehiculoRuta: r }));
  const r = porRuta(rows, 2);
  assert.equal(r[0].clave, "R1");
  assert.ok(r.some((p) => p.clave === "__otros__"));
});

test("rankingConductores ordena por total y luego propias", () => {
  const rows = [
    fila({ conductorCedula: "A", conductorNombre: "Ana", responsabilidad: "directo" }),
    fila({ conductorCedula: "A", conductorNombre: "Ana", responsabilidad: "tercero" }),
    fila({ conductorCedula: "B", conductorNombre: "Beto", responsabilidad: "directo" }),
  ];
  const r = rankingConductores(rows);
  assert.equal(r[0].clave, "A");
  assert.equal(r[0].total, 2);
  assert.equal(r[0].propias, 1);
});

// ── Prescriptivo ───────────────────────────────────────────────────────────────

test("generarPrescriptivos: factor dominante, fatal y reincidencia", () => {
  const velz = (n: number) =>
    Array.from({ length: n }, () =>
      fila({ factoresPolitica: { exceso_velocidad: true, uso_celular: false, no_distancia: false, fatiga: false } })
    );
  const rows = [
    ...velz(4), // 4/6 ≈ 67% exceso velocidad → recomendación alta
    fila({ clase: "muerto" }),
    fila({ conductorCedula: "A", conductorNombre: "Ana" }),
    fila({ conductorCedula: "A", conductorNombre: "Ana" }),
  ];
  const recs = generarPrescriptivos(rows);
  assert.ok(recs.some((r) => /velocidad/i.test(r.titulo)));
  assert.ok(recs.some((r) => /fatal/i.test(r.titulo)));
  assert.ok(recs.some((r) => /reincidente/i.test(r.titulo)));
  // La primera recomendación debe ser de severidad alta.
  assert.equal(recs[0].severidad, "alta");
});

test("generarPrescriptivos: sin filas no recomienda nada", () => {
  assert.deepEqual(generarPrescriptivos([]), []);
});

// ── Filtros en memoria ───────────────────────────────────────────────────────

test("pasaFiltros: clase, responsabilidad (dictamen), factor y texto", () => {
  const f = fila({
    clase: "lesionado",
    responsabilidad: "directo",
    vehiculoRuta: "R10",
    conductorNombre: "Pedro Pérez",
    factoresPolitica: { exceso_velocidad: true, uso_celular: false, no_distancia: false, fatiga: false },
  });
  assert.equal(pasaFiltros(f, { clase: "lesionado" }), true);
  assert.equal(pasaFiltros(f, { clase: "simple" }), false);
  assert.equal(pasaFiltros(f, { responsabilidad: "directo" }), true);
  assert.equal(pasaFiltros(f, { responsabilidad: "tercero" }), false);
  assert.equal(pasaFiltros(f, { factor: "exceso_velocidad" }), true);
  assert.equal(pasaFiltros(f, { factor: "fatiga_comprobada" }), false);
  assert.equal(pasaFiltros(f, { conductor: "perez" }), true);
  assert.equal(pasaFiltros(f, { conductor: "xyz" }), false);
  assert.equal(pasaFiltros(f, { ruta: "R10" }), true);
});
