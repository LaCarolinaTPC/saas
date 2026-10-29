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

test("accidentes de ayer: día anterior, día de Colombia y fecha larga", async () => {
  const { diaAnterior, diaBogota, fechaLarga } = await import("./datos-reglas");
  assert.equal(diaAnterior("2026-10-26"), "2026-10-25");
  assert.equal(diaAnterior("2026-01-01"), "2025-12-31");
  assert.equal(diaAnterior("2028-03-01"), "2028-02-29");
  // 10 pm del 25 en Bogotá, devuelto en UTC: sigue siendo el 25.
  assert.equal(diaBogota("2026-10-26T03:00:00+00:00"), "2026-10-25");
  assert.equal(diaBogota("2026-10-25T22:00:00-05:00"), "2026-10-25");
  assert.equal(diaBogota("2026-10-25T08:00:00+00:00"), "2026-10-25");
  assert.equal(diaBogota("2026-10-25"), "2026-10-25");
  assert.equal(fechaLarga("2026-10-25"), "Domingo, 25 de octubre");
});

test("personasAfectadas: víctimas registradas o, sin ellas, al menos una según la clase", async () => {
  const { personasAfectadas } = await import("./datos-reglas");
  assert.deepEqual(personasAfectadas("simple", []), { lesionados: 0, fallecidos: 0, peatones: 0, pasajeros: 0 });
  assert.deepEqual(personasAfectadas("lesionado", []), { lesionados: 1, fallecidos: 0, peatones: 0, pasajeros: 0 });
  assert.deepEqual(personasAfectadas("muerto", []), { lesionados: 0, fallecidos: 1, peatones: 0, pasajeros: 0 });
  assert.deepEqual(
    personasAfectadas("lesionado", [
      { fallecido: false, condicion: "usuario" },
      { fallecido: false, condicion: "usuario" },
      { fallecido: false, condicion: "peaton" },
    ]),
    { lesionados: 3, fallecidos: 0, peatones: 1, pasajeros: 2 }
  );
  // Clase «muerto» con la víctima registrada: no se cuenta dos veces.
  assert.deepEqual(personasAfectadas("muerto", [{ fallecido: true, condicion: "peaton" }, { fallecido: false, condicion: null }]), {
    lesionados: 1,
    fallecidos: 1,
    peatones: 1,
    pasajeros: 0,
  });
});

test("horaBogota: hora de Colombia aunque la base la devuelva en UTC", async () => {
  const { horaBogota } = await import("./datos-reglas");
  assert.equal(horaBogota("2026-10-26T03:40:00+00:00")?.replace(/\s/g, " "), "10:40 p. m.");
  assert.equal(horaBogota("2026-10-25T08:05:00-05:00")?.replace(/\s/g, " "), "8:05 a. m.");
  assert.equal(horaBogota("2026-10-25"), null);
});

test("recomendacionDelDia: fallecidos, factor más repetido, peatones, pasajeros y general", async () => {
  const { recomendacionDelDia, CONSEJOS_FACTOR } = await import("./datos-reglas");
  const base = { hora: null, bus: null, ruta: null, lugar: null, clase: "simple" as const, lesionados: 0, fallecidos: 0, peatones: 0, pasajeros: 0, factores: [] as string[] };
  assert.equal(recomendacionDelDia([{ ...base, fallecidos: 1, factores: ["uso_celular"] }]).emoji, "🕊️");
  assert.equal(
    recomendacionDelDia([{ ...base, factores: ["fatiga"] }, { ...base, factores: ["uso_celular", "fatiga"] }]).texto,
    CONSEJOS_FACTOR.fatiga.consejo
  );
  assert.equal(recomendacionDelDia([{ ...base, peatones: 1, pasajeros: 2 }]).emoji, "🚶");
  assert.equal(recomendacionDelDia([{ ...base, pasajeros: 2 }]).emoji, "🧍");
  assert.equal(recomendacionDelDia([base]).emoji, "🛡️");
  assert.equal(recomendacionDelDia([{ ...base, factores: ["desconocido"] }]).emoji, "🛡️");
});

test("nombrePropio y recomendación por hipótesis", async () => {
  const { nombrePropio, recomendacionDelDia } = await import("./datos-reglas");
  assert.equal(nombrePropio("QUINTERO LOPEZ JHORDY JAVIER"), "Quintero Lopez Jhordy Javier");
  assert.equal(nombrePropio("  OSPINA PEDROZA ELKIN DE JESUS "), "Ospina Pedroza Elkin de Jesus");
  assert.equal(nombrePropio(""), null);

  const base = { hora: null, bus: null, ruta: null, lugar: null, clase: "simple" as const, lesionados: 0, fallecidos: 0, peatones: 0, pasajeros: 0, factores: [] as string[] };
  // La hipótesis repetida manda sobre el factor de la Política.
  const r = recomendacionDelDia([
    { ...base, factores: ["fatiga"], hipotesis: [{ codigo: "103", texto: "Adelantar cerrando", categoria: "conductor" }] },
    { ...base, hipotesis: [{ codigo: "103", texto: "Adelantar cerrando", categoria: "conductor" }] },
  ]);
  assert.match(r.texto, /adelantado completo/);
  // «Otra» (sin medida propia) no cuenta: cae al factor de la Política.
  const r2 = recomendacionDelDia([{ ...base, factores: ["fatiga"], hipotesis: [{ codigo: "157", texto: "Otra", categoria: "conductor" }] }]);
  assert.match(r2.texto, /sueño/);
});

test("panelesCarrusel: resumen, ficha de cada accidente y sus fotos solo si las tiene", async () => {
  const { panelesCarrusel } = await import("./datos-reglas");
  const { MAX_ACCIDENTES_CARRUSEL } = await import("./modelo");
  const a = { hora: null, bus: null, ruta: null, lugar: null, clase: "simple" as const, lesionados: 0, fallecidos: 0, peatones: 0, pasajeros: 0, factores: [] as string[] };
  assert.deepEqual(panelesCarrusel(null), [{ tipo: "resumen" }]);
  assert.deepEqual(panelesCarrusel({ fecha: "2026-10-25", total: 0, graves: 0, accidentes: [] }), [{ tipo: "resumen" }]);
  assert.deepEqual(
    panelesCarrusel({ fecha: "2026-10-25", total: 3, graves: 0, accidentes: [{ ...a, fotosUrls: ["u1"] }, a, { ...a, fotosUrls: [] }] }),
    [{ tipo: "resumen" }, { tipo: "accidente", i: 0 }, { tipo: "fotos", i: 0, grupo: 0 }, { tipo: "accidente", i: 1 }, { tipo: "accidente", i: 2 }]
  );
  // 6 fotos: dos grupos (4 + 2); más de 12 se recortan a 3 grupos.
  const seis = panelesCarrusel({ fecha: "x", total: 1, graves: 0, accidentes: [{ ...a, fotosUrls: ["1", "2", "3", "4", "5", "6"] }] });
  assert.deepEqual(seis.slice(1), [{ tipo: "accidente", i: 0 }, { tipo: "fotos", i: 0, grupo: 0 }, { tipo: "fotos", i: 0, grupo: 1 }]);
  const quince = panelesCarrusel({ fecha: "x", total: 1, graves: 0, accidentes: [{ ...a, fotosUrls: Array.from({ length: 15 }, (_, k) => String(k)) }] });
  assert.equal(quince.filter((x) => x.tipo === "fotos").length, 3);
  const muchos = Array.from({ length: 20 }, () => ({ ...a, fotosUrls: ["u"] }));
  assert.equal(panelesCarrusel({ fecha: "x", total: 20, graves: 0, accidentes: muchos }).length, 1 + MAX_ACCIDENTES_CARRUSEL * 2);
});

test("causasPrincipales: las 3 más frecuentes, una vez por accidente y sin «Otra»", async () => {
  const { causasPrincipales, panelesCarrusel } = await import("./datos-reglas");
  const h = (codigo: string, texto = `T${codigo}`) => ({ codigo, texto, categoria: "conductor" });
  const r = causasPrincipales([
    [h("121"), h("121")], // repetida en el mismo accidente: cuenta una vez
    [h("121"), h("139")],
    [h("139"), h("157", "Otra")],
    [h("103")],
    [h("157", "Otra"), h("112")],
  ]);
  assert.deepEqual(
    r.map((c) => [c.codigo, c.accidentes]),
    [["121", 2], ["139", 2], ["103", 1]]
  );
  assert.deepEqual(causasPrincipales([]), []);

  // El mes va de segundo, también cuando ayer no hubo accidentes.
  const mes = { clave: "2026-10", hasta: "2026-10-26", total: 0, lesionados: 0, fallecidos: 0, causas: [] };
  assert.deepEqual(panelesCarrusel({ fecha: "2026-10-26", total: 0, graves: 0, accidentes: [], mes }), [{ tipo: "resumen" }, { tipo: "mes" }]);
  const a = { hora: null, bus: null, ruta: null, lugar: null, clase: "simple" as const, lesionados: 0, fallecidos: 0, peatones: 0, pasajeros: 0, factores: [] as string[] };
  assert.deepEqual(panelesCarrusel({ fecha: "2026-10-26", total: 1, graves: 0, accidentes: [a], mes }), [
    { tipo: "resumen" },
    { tipo: "mes" },
    { tipo: "accidente", i: 0 },
  ]);
});
