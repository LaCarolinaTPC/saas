import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseVelocidad,
  bienvenidasDelMes,
  elegirFactor,
  resumirVelocidad,
  semanasVelocidad,
  aniversariosDelMes,
  completarMeses,
  conteosDeResumen,
  cumpleanosDelMes,
  datosDeMuestra,
  diasSinAccidentes,
  etiquetaMes,
  mesActualYAnterior,
  nombreCorto,
  ultimosMeses,
} from "./datos-reglas";

test("mesActualYAnterior cruza el año", () => {
  assert.deepEqual(mesActualYAnterior("2026-01-15"), { actual: "2026-01", anterior: "2025-12" });
  assert.deepEqual(mesActualYAnterior("2026-10-26"), { actual: "2026-10", anterior: "2026-09" });
});

test("ultimosMeses devuelve n meses terminando en el actual", () => {
  const r = ultimosMeses("2026-03-10", 4);
  assert.deepEqual(r.meses, ["2025-12", "2026-01", "2026-02", "2026-03"]);
  assert.equal(r.desde, "2025-12-01");
  assert.equal(r.hasta, "2026-03-10");
});

test("completarMeses rellena ceros en orden", () => {
  const s = completarMeses([{ clave: "2026-02", count: 3, graves: 1 }], ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(s.map((p) => [p.clave, p.total, p.graves]), [["2026-01", 0, 0], ["2026-02", 3, 1], ["2026-03", 0, 0]]);
  assert.equal(s[1].etiqueta, etiquetaMes("2026-02"));
});

test("diasSinAccidentes: null sin accidente, 0 el mismo día, cuenta días calendario", () => {
  assert.equal(diasSinAccidentes(null, "2026-10-26"), null);
  assert.equal(diasSinAccidentes("2026-10-26T15:30:00", "2026-10-26"), 0);
  assert.equal(diasSinAccidentes("2026-10-20T23:59:00", "2026-10-26"), 6);
  assert.equal(diasSinAccidentes("2026-02-28", "2026-03-01"), 1);
});

test("nombreCorto según el orden del maestro", () => {
  assert.equal(nombreCorto("PATIÑO MORALES MARCIAL ENRIQUE", "apellidos_primero"), "Marcial Patiño");
  assert.equal(nombreCorto("MUÑOZ MUÑOZ HELIODORO", "apellidos_primero"), "Heliodoro Muñoz");
  assert.equal(nombreCorto("Juan Carlos Pérez Gómez", "nombre_primero"), "Juan Pérez");
  assert.equal(nombreCorto("ana ruiz"), "Ana Ruiz");
  assert.equal(nombreCorto("  "), "");
});

test("cumpleanosDelMes: solo de hoy en adelante, ordena por día, marca hoy y no repite", () => {
  const r = cumpleanosDelMes(
    [
      { nombre: "Delta Cuatro", fecha_nacimiento: "1991-10-30" },
      { nombre: "Beta Uno", fecha_nacimiento: "1990-10-26" },
      { nombre: "Alfa Dos", fecha_nacimiento: "1985-10-03" }, // ya pasó
      { nombre: "Beta Uno", fecha_nacimiento: "1990-10-26" },
      { nombre: "Gama Tres", fecha_nacimiento: "1985-11-03" }, // otro mes
      { nombre: "Sin Fecha", fecha_nacimiento: null },
    ],
    "2026-10-26"
  );
  assert.deepEqual(r, [
    { nombre: "Beta Uno", dia: 26, esHoy: true },
    { nombre: "Delta Cuatro", dia: 30, esHoy: false },
  ]);
});

test("el primero del mes se ven todos los cumpleaños del mes", () => {
  const r = cumpleanosDelMes([{ nombre: "Ana Ruiz", fecha_nacimiento: "1990-10-01" }, { nombre: "Eva Paz", fecha_nacimiento: "1990-10-31" }], "2026-10-01");
  assert.equal(r.length, 2);
});

test("cumpleaños del 29 de febrero se celebra el 28 en años no bisiestos", () => {
  const p = [{ nombre: "Leap Año", fecha_nacimiento: "2000-02-29" }];
  assert.equal(cumpleanosDelMes(p, "2027-02-10")[0].dia, 28);
  assert.equal(cumpleanosDelMes(p, "2028-02-10")[0].dia, 29);
  assert.equal(cumpleanosDelMes(p, "2027-02-28")[0].esHoy, true);
  assert.equal(cumpleanosDelMes(p, "2028-03-01").length, 0);
});

test("aniversariosDelMes: de hoy en adelante, calcula años y excluye ingresos del año en curso", () => {
  const r = aniversariosDelMes(
    [
      { nombre: "Uno Uno", fecha_ingreso: "2016-10-05" },
      { nombre: "Dos Dos", fecha_ingreso: "2026-10-09" }, // ingresó este año
      { nombre: "Tres Tres", fecha_ingreso: "2023-10-20" },
      { nombre: "Cinco Cinco", fecha_ingreso: "2019-10-02" }, // ya pasó
      { nombre: "Cuatro", fecha_ingreso: "2020-09-05" }, // otro mes
    ],
    "2026-10-05"
  );
  assert.deepEqual(r, [
    { nombre: "Uno Uno", dia: 5, anios: 10, esHoy: true },
    { nombre: "Tres Tres", dia: 20, anios: 3, esHoy: false },
  ]);
});

test("conteosDeResumen solo devuelve cifras", () => {
  const c = conteosDeResumen(
    { sinDespacho: [1, 2], porSalir: [1], trabajaron: [1, 2, 3], conNovedad: [], marcaron: [1, 2, 3, 4] },
    { fecha: "2026-10-26", esperados: 7, despachoSincronizadoHasta: null }
  );
  assert.deepEqual(c, {
    fecha: "2026-10-26", esperados: 7, trabajaron: 3, porSalir: 1, sinDespacho: 2, conNovedad: 0, marcaron: 4,
    despachoSincronizadoHasta: null,
  });
});

test("elegirFactor: el del mes y, si no hubo, el del trimestre", () => {
  const vacio = { conteo: [], total: 0 };
  const mes = { conteo: [{ clave: "uso_celular", etiqueta: "x", count: 2 }, { clave: "fatiga", etiqueta: "y", count: 1 }], total: 4 };
  const tri = { conteo: [{ clave: "fatiga", etiqueta: "Fatiga", count: 5 }], total: 9 };
  assert.deepEqual(elegirFactor(mes, tri), { clave: "uso_celular", etiqueta: "Uso del celular", accidentes: 2, total: 4, periodo: "mes" });
  assert.equal(elegirFactor({ conteo: [], total: 3 }, tri)?.periodo, "trimestre");
  assert.equal(elegirFactor(vacio, vacio), null);
});

test("semanasVelocidad: semana de lunes a hoy y la anterior completa", () => {
  // 2026-10-26 es lunes; 2026-10-29, jueves; 2026-11-01, domingo.
  assert.deepEqual(semanasVelocidad("2026-10-26"), {
    actual: { desde: "2026-10-26", hasta: "2026-10-26" },
    anterior: { desde: "2026-10-19", hasta: "2026-10-25" },
  });
  assert.equal(semanasVelocidad("2026-10-29").actual.desde, "2026-10-26");
  assert.equal(semanasVelocidad("2026-11-01").actual.desde, "2026-10-26");
});

test("baseVelocidad: si el GPS aún no trae datos de esta semana, muestra la última con datos", () => {
  // Lunes 26 con datos hasta el domingo 25: semana del 19 al 25.
  assert.deepEqual(baseVelocidad("2026-10-26", "2026-10-25"), { base: "2026-10-25", enCurso: false });
  assert.deepEqual(semanasVelocidad("2026-10-25").actual, { desde: "2026-10-19", hasta: "2026-10-25" });
  // Jueves 29 con datos hasta el miércoles 28: sigue siendo esta semana.
  assert.deepEqual(baseVelocidad("2026-10-29", "2026-10-28"), { base: "2026-10-29", enCurso: true });
  assert.deepEqual(baseVelocidad("2026-10-29", "2026-10-29"), { base: "2026-10-29", enCurso: true });
  assert.deepEqual(baseVelocidad("2026-10-29", null), { base: "2026-10-29", enCurso: true });
});

test("resumirVelocidad cuenta incidencias y conductores distintos de la semana", () => {
  const inc = [
    { fecha: "2026-10-26", cedula: "1" },
    { fecha: "2026-10-27", cedula: "1" },
    { fecha: "2026-10-27", cedula: "2" },
    { fecha: "2026-10-27", cedula: null },
    { fecha: "2026-10-20", cedula: "3" },
  ];
  assert.deepEqual(resumirVelocidad(inc, { desde: "2026-10-26", hasta: "2026-10-29" }), {
    desde: "2026-10-26",
    hasta: "2026-10-29",
    incidencias: 4,
    conductores: 2,
  });
});

test("bienvenidasDelMes: ingresos del mes hasta hoy, los más recientes primero", () => {
  const r = bienvenidasDelMes(
    [
      { nombre: "GOMEZ DIAZ ANA MARIA", fecha_ingreso: "2026-10-03", orden: "apellidos_primero" },
      { nombre: "Luis Perez", fecha_ingreso: "2026-10-26" },
      { nombre: "Futuro Uno", fecha_ingreso: "2026-10-30" },
      { nombre: "Viejo Dos", fecha_ingreso: "2026-09-30" },
    ],
    "2026-10-26"
  );
  assert.deepEqual(r, [
    { nombre: "Luis Perez", dia: 26, esHoy: true },
    { nombre: "Ana Gomez", dia: 3, esHoy: false },
  ]);
});

test("datosDeMuestra trae todas las familias y la serie de 12 meses", () => {
  const d = datosDeMuestra("2026-10-26");
  assert.equal(d.accidentabilidad?.serie.length, 12);
  assert.equal(d.accidentabilidad?.serie.at(-1)?.clave, "2026-10");
  assert.ok(d.ausentismo && d.marcaciones && d.cumpleanos && d.aniversarios);
  assert.ok(d.ausentismo.mensual.every((m) => m.mes.startsWith("2026")));
});
