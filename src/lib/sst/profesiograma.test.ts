import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFESIOGRAMA, compararProfesiogramas, normalizarCargo, periodicidadPorCargo, personasAfectadas, tipoPorCargo, validarTablaProfesiograma, type TablaProfesiograma } from "./profesiograma";
import { leerProfesiograma, mesesDe, tablaDesdeLectura, tipoDe } from "./profesiograma-excel";
import type { PersonaExamen } from "./examenes";

test("profesiograma: 44 cargos de La Carolina, 6 de Metrorecaudo y 5 de Anaya Giraldo", () => {
  assert.equal(PROFESIOGRAMA.la_carolina.length, 44);
  assert.equal(PROFESIOGRAMA.metrorecaudo.length, 6);
  assert.equal(PROFESIOGRAMA.anaya_giraldo.length, 5);
});

test("normalizarCargo: tildes, erratas y femenino", () => {
  assert.equal(normalizarCargo("Auxliar de Tesorería"), "auxiliar tesoreria");
  assert.equal(normalizarCargo("Director de Getión Humana"), "director gestion humana");
  assert.equal(normalizarCargo("COORDINADORA SST"), "coordinador sst");
});

test("periodicidadPorCargo: administrativo 36, mixto 24, operativo 12", () => {
  assert.equal(periodicidadPorCargo("CAJERO", "administrativos").meses, 36);
  assert.equal(periodicidadPorCargo("AUXILIAR DE TESORERIA", "administrativos").meses, 36);
  assert.equal(periodicidadPorCargo("Coordinadora SST", "administrativos").meses, 36);
  assert.equal(periodicidadPorCargo("INSPECTOR DE PATIO", "administrativos").meses, 24);
  assert.equal(periodicidadPorCargo("AUXILIAR DE MANTENIMIENTO", "administrativos").meses, 12);
  assert.equal(periodicidadPorCargo("Vigilante", "anaya_giraldo").meses, 12);
  assert.equal(periodicidadPorCargo("Cajero", "metrorecaudo").meses, 36);
});

test("periodicidadPorCargo: conductores y reubicados", () => {
  const c = periodicidadPorCargo(null, "conductores");
  assert.deepEqual([c.meses, c.cargo?.tipo], [12, "oper"]);
  assert.equal(periodicidadPorCargo(null, "reubicados").meses, 12);
  assert.equal(periodicidadPorCargo("Asistente Operativo", "reubicados").meses, 36);
});

test("periodicidadPorCargo: coincidencia parcial y sin coincidencia", () => {
  assert.equal(periodicidadPorCargo("TECNICO ELECTRICO DE SENSOR Y CAMARAS II", "administrativos").cargo?.cargo, "Tecnico electrico de Sensor y camaras");
  const nada = periodicidadPorCargo("ASTRONAUTA", "administrativos");
  assert.deepEqual([nada.meses, nada.cargo], [12, null]);
  assert.deepEqual(periodicidadPorCargo("", "administrativos"), { meses: 12, cargo: null });
});

// ── Versiones, personas afectadas y validación ─────────────────────────────


const conCambio = (cambios: Partial<Record<string, number>>): TablaProfesiograma => ({
  ...PROFESIOGRAMA,
  la_carolina: PROFESIOGRAMA.la_carolina.map((c) => (cambios[c.cargo] ? { ...c, meses: cambios[c.cargo]!, tipo: "oper" as const } : c)),
});

test("tipoPorCargo: proceso del cargo", () => {
  assert.equal(tipoPorCargo("Cajero", "administrativos"), "admon");
  assert.equal(tipoPorCargo("Mensajero", "administrativos"), "admon_oper");
  assert.equal(tipoPorCargo(null, "conductores"), "oper");
  assert.equal(tipoPorCargo("Astronauta", "administrativos"), null);
});

test("compararProfesiogramas: agregados, quitados y cambiados", () => {
  const nuevo: TablaProfesiograma = {
    ...conCambio({ Cajero: 12 }),
    anaya_giraldo: [...PROFESIOGRAMA.anaya_giraldo.filter((c) => c.cargo !== "Escolta"), { cargo: "Conductor escolta", meses: 12, tipo: "oper" }],
  };
  const c = compararProfesiogramas(PROFESIOGRAMA, nuevo);
  assert.deepEqual(
    c.map((x) => [x.empresa, x.cargo, x.antes?.meses ?? null, x.despues?.meses ?? null]),
    [["la_carolina", "Cajero", 36, 12], ["anaya_giraldo", "Conductor escolta", null, 12], ["anaya_giraldo", "Escolta", 12, null]]
  );
});

const persona = (cedula: string, cargo: string, meses: number, extra: Partial<PersonaExamen> = {}): PersonaExamen => ({
  cedula, nombre: `P ${cedula}`, cargo, grupo: "administrativos", fechaIngreso: null, periodicidadMeses: meses, activo: true,
  motivoInactivo: null, inactivoDesde: null, observaciones: null, origen: "gestivo", ...extra,
});

test("personasAfectadas: propone marcadas solo las que tenían la del profesiograma anterior", () => {
  const r = personasAfectadas(
    [persona("1", "Cajero", 36), persona("2", "CAJERO", 24), persona("3", "Cajero", 12), persona("4", "Abogado", 36), persona("5", "Cajero", 36, { activo: false })],
    PROFESIOGRAMA,
    conCambio({ Cajero: 12 })
  );
  assert.deepEqual(r.map((x) => [x.cedula, x.actual, x.nueva, x.sugerida]), [["1", 36, 12, true], ["2", 24, 12, false]]);
});

test("validarTablaProfesiograma: rechaza repetidos, periodicidad fuera de rango y sin proceso", () => {
  assert.equal(validarTablaProfesiograma(PROFESIOGRAMA).ok, true);
  const rep = { ...PROFESIOGRAMA, metrorecaudo: [...PROFESIOGRAMA.metrorecaudo, { cargo: "cajero ", meses: 36, tipo: "admon" }] };
  assert.match((validarTablaProfesiograma(rep) as { error: string }).error, /repetido/);
  assert.match((validarTablaProfesiograma({ ...PROFESIOGRAMA, metrorecaudo: [{ cargo: "X", meses: 3, tipo: "admon" }] }) as { error: string }).error, /6 a 60/);
  assert.match((validarTablaProfesiograma({ ...PROFESIOGRAMA, metrorecaudo: [{ cargo: "X", meses: 12, tipo: "" }] }) as { error: string }).error, /proceso/);
});

test("leerProfesiograma: encabezado, periodicidad, proceso, pie y fecha", () => {
  assert.equal(mesesDe("Cada 36 meses"), 36);
  assert.equal(mesesDe("cada 12 meses"), 12);
  assert.equal(mesesDe("anual"), null);
  assert.equal(tipoDe("Admon - Oper", 24), "admon_oper");
  assert.equal(tipoDe(null, 36), "admon");
  const filas = [
    ["MATRIZ DE PROFESIOGRAMA – METROPOLITANA"],
    [],
    [],
    ["PROCESO", "CARGO", "FACTORES", null, "PERIOCIDAD DE LOS EXAMENES"],
    [null, null, "Tipo Proceso", "Periodicidad del EMO  (Res 1843)"],
    [null, null, null, null, "La audiometría se realizará cada cinco años"],
    ["ADMINISTRATIVOS", "Gerente General", "Admon", "Cada 36 meses"],
    [null, "Mensajero", "Admon - Oper", "cada 24 meses"],
    ["OPERATIVOS", "Conductor -  Cobrador", "Oper", "cada 12 meses"],
    [null, "Auxiliar raro", "Oper", "cuando toque"],
    [null, "FECHA DE ACTUALIZACION: 05/10/2025"],
    [null, "PROFESIONAL: Darwin"],
  ];
  const l = leerProfesiograma([{ nombre: "PORTADA", filas: [["x"]] }, { nombre: "LA CAROLINA", filas }]);
  if ("error" in l) throw new Error(l.error);
  assert.deepEqual(l.tabla.la_carolina.map((c) => [c.cargo, c.meses, c.tipo]), [
    ["Gerente General", 36, "admon"], ["Mensajero", 24, "admon_oper"], ["Conductor - Cobrador", 12, "oper"],
  ]);
  assert.equal(l.fecha, "2025-10-05");
  assert.equal(l.avisos.filter((a) => a.includes("Auxiliar raro")).length, 1);
  assert.equal(l.avisos.filter((a) => a.includes("se conservan")).length, 2);
  // Las empresas que no trae el archivo se conservan.
  const t = tablaDesdeLectura(PROFESIOGRAMA, l);
  assert.equal(t.la_carolina.length, 3);
  assert.equal(t.metrorecaudo, PROFESIOGRAMA.metrorecaudo);
  assert.match((leerProfesiograma([{ nombre: "Hoja1", filas: [] }]) as { error: string }).error, /no tiene hojas/);
});
