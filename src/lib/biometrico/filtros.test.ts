import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FILTRO_VACIO,
  aplicar,
  busesDelDia,
  cuantosConductores,
  describirFiltro,
  hayFiltro,
  type FiltroMarcaciones,
} from "./filtros";
import type { FilaMarco, FilaNovedad, FilaPendiente, FilaTrabajo, ResumenDia } from "./dia";
import type { PrimerViaje } from "./despacho";

const viaje: PrimerViaje = {
  hora: "05:12:00",
  bus: "118",
  turno: 3,
  viaje: 1,
  ruta: "A",
  estado: "DESPACHADO",
  viajes: 4,
};

function pendiente(
  cedula: string,
  nombre: string,
  extra: Partial<FilaPendiente> = {}
): FilaPendiente {
  return {
    cedula,
    nombre,
    codigo: null,
    bus: "112",
    origen: "despacho",
    porSalir: false,
    marco: false,
    ...extra,
  };
}

function trabajo(cedula: string, nombre: string, extra: Partial<FilaTrabajo> = {}): FilaTrabajo {
  return {
    cedula,
    nombre,
    codigo: null,
    bus: "112",
    origen: "despacho",
    primerViaje: viaje,
    marco: true,
    ...extra,
  };
}

function novedad(cedula: string, nombre: string, extra: Partial<FilaNovedad> = {}): FilaNovedad {
  return {
    cedula,
    nombre,
    codigo: null,
    bus: null,
    origen: "maestro",
    trabajo: false,
    primerViaje: null,
    marco: false,
    ...extra,
  };
}

function marco(cedula: string, nombre: string | null, extra: Partial<FilaMarco> = {}): FilaMarco {
  return {
    cedula,
    nombre,
    codigo: null,
    primera: "2026-10-20T10:00:00+00:00",
    ultima: "2026-10-20T20:00:00+00:00",
    cantidad: 2,
    pines: ["77"],
    esperado: true,
    llegada: "lector",
    ...extra,
  };
}

function resumen(p: Partial<ResumenDia> = {}): ResumenDia {
  return {
    sinDespacho: [],
    porSalir: [],
    trabajaron: [],
    conNovedad: [],
    marcaron: [],
    sinMaestro: { sinCedula: [], noEsperados: [] },
    ...p,
  };
}

function filtro(p: Partial<FiltroMarcaciones> = {}): FiltroMarcaciones {
  return { ...FILTRO_VACIO, ...p };
}

test("el filtro vacío no quita nada", () => {
  const r = resumen({
    sinDespacho: [pendiente("1", "Ana")],
    trabajaron: [trabajo("2", "Beto")],
    marcaron: [marco("2", "Beto")],
  });
  const out = aplicar(r, FILTRO_VACIO);
  assert.equal(out.sinDespacho.length, 1);
  assert.equal(out.trabajaron.length, 1);
  assert.equal(out.marcaron.length, 1);
  assert.equal(hayFiltro(FILTRO_VACIO), false);
  assert.deepEqual(describirFiltro(FILTRO_VACIO), []);
});

test("la búsqueda es tolerante a tildes y mayúsculas, y mira cédula y código", () => {
  const r = resumen({
    sinDespacho: [pendiente("1", "José Pérez", { codigo: "C-9" }), pendiente("88", "Ana")],
  });
  assert.equal(aplicar(r, filtro({ texto: "jose pe" })).sinDespacho.length, 1);
  assert.equal(aplicar(r, filtro({ texto: "C-9" })).sinDespacho.length, 1);
  assert.equal(aplicar(r, filtro({ texto: "88" })).sinDespacho[0].nombre, "Ana");
  assert.equal(aplicar(r, filtro({ texto: "zzz" })).sinDespacho.length, 0);
});

test("se busca también por el pin del biométrico", () => {
  const r = resumen({
    trabajaron: [trabajo("1", "Ana")],
    marcaron: [marco("1", "Ana", { pines: ["404"] })],
  });
  assert.equal(aplicar(r, filtro({ texto: "404" })).trabajaron.length, 1);
  assert.equal(aplicar(r, filtro({ texto: "405" })).trabajaron.length, 0);
});

test("el filtro de huella es global: corta en todas las secciones", () => {
  const r = resumen({
    sinDespacho: [pendiente("1", "Ana", { marco: true }), pendiente("2", "Beto")],
    trabajaron: [trabajo("3", "Caro", { marco: false })],
    marcaron: [marco("1", "Ana")],
  });
  const sin = aplicar(r, filtro({ huella: "sin" }));
  assert.deepEqual(
    sin.sinDespacho.map((x) => x.nombre),
    ["Beto"]
  );
  assert.equal(sin.trabajaron.length, 1);
  assert.equal(sin.marcaron.length, 0, "«sin huella» no puede dejar marcaciones");

  const con = aplicar(r, filtro({ huella: "con" }));
  assert.deepEqual(
    con.sinDespacho.map((x) => x.nombre),
    ["Ana"]
  );
  assert.equal(con.trabajaron.length, 0);
});

test("el bus mira el esperado y el que realmente rodó", () => {
  const r = resumen({ trabajaron: [trabajo("1", "Ana")] }); // esperado 112, rodó 118
  assert.equal(aplicar(r, filtro({ bus: "112" })).trabajaron.length, 1);
  assert.equal(aplicar(r, filtro({ bus: "118" })).trabajaron.length, 1);
  assert.equal(aplicar(r, filtro({ bus: "999" })).trabajaron.length, 0);
});

test("«llegó por» deja fuera a quien no marcó", () => {
  const r = resumen({
    sinDespacho: [pendiente("1", "Ana", { marco: true }), pendiente("2", "Beto")],
    marcaron: [marco("1", "Ana", { llegada: "access" })],
  });
  assert.equal(aplicar(r, filtro({ llegada: "access" })).sinDespacho.length, 1);
  assert.equal(aplicar(r, filtro({ llegada: "lector" })).sinDespacho.length, 0);
});

test("el origen filtra por de dónde salió el esperado", () => {
  const r = resumen({
    sinDespacho: [pendiente("1", "Ana"), pendiente("2", "Beto", { origen: "historico" })],
  });
  assert.deepEqual(
    aplicar(r, filtro({ origen: "historico" })).sinDespacho.map((x) => x.nombre),
    ["Beto"]
  );
});

test("con bus u origen puestos, «Marcaron» se recorta a los que quedaron visibles", () => {
  const r = resumen({
    trabajaron: [trabajo("1", "Ana")],
    marcaron: [marco("1", "Ana"), marco("9", "Relevo", { esperado: false })],
  });
  // Sin esos filtros la lista informativa queda completa, relevos incluidos.
  assert.equal(aplicar(r, FILTRO_VACIO).marcaron.length, 2);
  assert.deepEqual(
    aplicar(r, filtro({ bus: "112" })).marcaron.map((x) => x.cedula),
    ["1"]
  );
});

test("apagar una sección la vacía sin tocar las demás", () => {
  const r = resumen({
    sinDespacho: [pendiente("1", "Ana")],
    trabajaron: [trabajo("2", "Beto")],
  });
  const out = aplicar(r, filtro({ secciones: ["trabajaron"] }));
  assert.equal(out.sinDespacho.length, 0);
  assert.equal(out.trabajaron.length, 1);
});

test("filtrar nunca reclasifica: las filas salen del mismo bucket", () => {
  const r = resumen({
    sinDespacho: [pendiente("1", "Ana", { marco: true })],
    trabajaron: [trabajo("2", "Beto")],
    conNovedad: [novedad("3", "Caro")],
  });
  const out = aplicar(r, filtro({ huella: "con" }));
  assert.equal(out.sinDespacho.length, 1);
  assert.equal(out.trabajaron.length, 1);
  assert.equal(out.conNovedad.length, 0);
  assert.equal(cuantosConductores(out), 2);
});

test("los buses del día salen ordenados y sin repetir", () => {
  const r = resumen({
    sinDespacho: [pendiente("1", "Ana", { bus: "9" })],
    trabajaron: [trabajo("2", "Beto")], // 112 esperado, 118 rodado
  });
  assert.deepEqual(busesDelDia(r), ["9", "112", "118"]);
});

test("describirFiltro dice en palabras lo que está puesto", () => {
  const d = describirFiltro(filtro({ texto: " ana ", huella: "sin", bus: "112" }));
  assert.deepEqual(d, ["Búsqueda: «ana»", "Huella: sin huella", "Bus: 112"]);
});
