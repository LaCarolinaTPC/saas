import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diaOperativo,
  diasEntreIso,
  resumenDelDia,
  type Esperado,
  type MarcacionDia,
} from "./dia";
import type { PrimerViaje } from "./despacho";

function esperado(cedula: string, nombre: string, extra: Partial<Esperado> = {}): Esperado {
  return { cedula, nombre, codigo: null, bus: null, origen: "despacho", ...extra };
}

function mapa(...lista: Esperado[]): Map<string, Esperado> {
  return new Map(lista.map((e) => [e.cedula, e]));
}

function marca(cedula: string | null, pin: string, hora: string): MarcacionDia {
  return { cedula, pin, momento: `2026-10-13T${hora}-05:00` };
}

function viaje(hora: string, extra: Partial<PrimerViaje> = {}): PrimerViaje {
  return {
    hora,
    bus: "514",
    turno: 1,
    viaje: 1,
    ruta: "A -- 16 MIRAMAR",
    estado: "DESPACHADO",
    viajes: 1,
    ...extra,
  };
}

/** Un día en que nadie salió a rodar ni tiene turno pendiente. */
const VACIO = {
  trabajaron: new Map<string, PrimerViaje>(),
  porSalir: new Set<string>(),
  novedades: new Set<string>(),
};

test("diaOperativo: la fecha local del momento", () => {
  assert.equal(diaOperativo("2026-10-13T06:42:10-05:00"), "2026-10-13");
  assert.equal(diaOperativo("2026-10-13 06:42:10"), "2026-10-13");
  assert.equal(diaOperativo("no es fecha"), null);
});

test("diasEntreIso cuenta días calendario", () => {
  assert.equal(diasEntreIso("2026-10-13", "2026-10-13"), 0);
  assert.equal(diasEntreIso("2026-10-13", "2026-10-19"), 6);
  // Cruzando mes y año.
  assert.equal(diasEntreIso("2026-12-30", "2027-01-02"), 3);
});

// ── La regla nueva: la presencia sale del despacho ──────────────────────────

test("un viaje que salió a rodar es la prueba de que vino", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana"), esperado("2", "Bruno")),
    trabajaron: new Map([["1", viaje("04:08:00")]]),
    porSalir: new Set(),
    novedades: new Set(),
    marcaciones: [],
  });
  assert.deepEqual(r.trabajaron.map((f) => f.nombre), ["Ana"]);
  assert.equal(r.trabajaron[0].primerViaje.hora, "04:08:00");
  assert.equal(r.trabajaron[0].primerViaje.bus, "514");
  assert.deepEqual(r.sinDespacho.map((f) => f.nombre), ["Bruno"]);
});

test("la huella NO decide: sin huella pero con viaje, trabajó", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    trabajaron: new Map([["1", viaje("05:00:00")]]),
    porSalir: new Set(),
    novedades: new Set(),
    marcaciones: [],
  });
  assert.equal(r.trabajaron.length, 1);
  assert.equal(r.trabajaron[0].marco, false);
  assert.equal(r.sinDespacho.length, 0);
});

test("la huella NO decide: con huella pero sin viaje, sigue sin despacho", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [marca("1", "27", "06:00:00")],
    ...VACIO,
  });
  assert.equal(r.sinDespacho.length, 1);
  // Pero queda marcado, que es la columna de estado de la pantalla.
  assert.equal(r.sinDespacho[0].marco, true);
  assert.equal(r.marcaron.length, 1);
});

test("un turno que todavía no sale no es una ausencia", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana"), esperado("2", "Bruno")),
    trabajaron: new Map(),
    porSalir: new Set(["1"]),
    novedades: new Set(),
    marcaciones: [],
  });
  assert.deepEqual(r.porSalir.map((f) => f.nombre), ["Ana"]);
  assert.equal(r.porSalir[0].porSalir, true);
  assert.deepEqual(r.sinDespacho.map((f) => f.nombre), ["Bruno"]);
  assert.equal(r.sinDespacho[0].porSalir, false);
});

test("un viaje que salió gana sobre el turno pendiente", () => {
  // Pasa todos los días: sacó el turno de la mañana y le quedan viajes por salir.
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    trabajaron: new Map([["1", viaje("04:00:00", { viajes: 3 })]]),
    porSalir: new Set(["1"]),
    novedades: new Set(),
    marcaciones: [],
  });
  assert.equal(r.trabajaron.length, 1);
  assert.equal(r.trabajaron[0].primerViaje.viajes, 3);
  assert.equal(r.porSalir.length, 0);
});

test("una novedad registrada explica la ausencia", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [],
    trabajaron: new Map(),
    porSalir: new Set(),
    novedades: new Set(["1"]),
  });
  assert.deepEqual(r.conNovedad.map((e) => e.nombre), ["Ana"]);
  assert.equal(r.sinDespacho.length, 0);
});

test("la novedad gana incluso sobre un viaje que rodó", () => {
  // Decidido el 2026-10-20: quien ya tiene su novedad sale de las cuentas.
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    trabajaron: new Map([["1", viaje("04:00:00")]]),
    porSalir: new Set(),
    novedades: new Set(["1"]),
    marcaciones: [],
  });
  assert.equal(r.trabajaron.length, 0);
  assert.equal(r.conNovedad.length, 1);
});

test("pero la contradicción no se esconde: queda anotado que rodó", () => {
  // Tiene novedad Y rodó: alguna de las dos está mal y alguien debe verlo.
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    trabajaron: new Map([["1", viaje("04:08:00", { bus: "514" })]]),
    porSalir: new Set(),
    novedades: new Set(["1"]),
    marcaciones: [],
  });
  assert.equal(r.conNovedad[0].trabajo, true);
  assert.equal(r.conNovedad[0].primerViaje?.hora, "04:08:00");
  assert.equal(r.conNovedad[0].primerViaje?.bus, "514");
});

test("una novedad sin viaje queda marcada como que no rodó", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [],
    trabajaron: new Map(),
    porSalir: new Set(),
    novedades: new Set(["1"]),
  });
  assert.equal(r.conNovedad[0].trabajo, false);
  assert.equal(r.conNovedad[0].primerViaje, null);
});

test("la novedad también saca a quien tiene turno pendiente", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    trabajaron: new Map(),
    porSalir: new Set(["1"]),
    novedades: new Set(["1"]),
    marcaciones: [],
  });
  assert.equal(r.porSalir.length, 0);
  assert.equal(r.conNovedad.length, 1);
});

test("los que trabajaron se ordenan por hora del primer viaje", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Zulema"), esperado("2", "Ana"), esperado("3", "Mario")),
    trabajaron: new Map([
      ["1", viaje("04:00:00")],
      ["2", viaje("12:00:00")],
      ["3", viaje("06:30:00")],
    ]),
    porSalir: new Set(),
    novedades: new Set(),
    marcaciones: [],
  });
  assert.deepEqual(r.trabajaron.map((f) => f.nombre), ["Zulema", "Mario", "Ana"]);
});

test("las listas de pendientes se ordenan por nombre", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Zulema"), esperado("2", "Ana"), esperado("3", "Mario")),
    marcaciones: [],
    ...VACIO,
  });
  assert.deepEqual(r.sinDespacho.map((f) => f.nombre), ["Ana", "Mario", "Zulema"]);
});

test("sin despacho PERO con huella va primero: esa persona vino", () => {
  // Es lo que no hay que registrar como ausencia. Medido: son hasta la mitad
  // de la lista (0 a 4 de los 2-8 candidatos diarios).
  const r = resumenDelDia({
    esperados: mapa(
      esperado("1", "Ana"),
      esperado("2", "Bruno"),
      esperado("3", "Carlos"),
      esperado("4", "Diana")
    ),
    // Bruno y Diana pasaron la huella aunque no los despacharan.
    marcaciones: [marca("2", "27", "05:10:00"), marca("4", "89", "06:00:00")],
    ...VACIO,
  });
  assert.deepEqual(r.sinDespacho.map((f) => f.nombre), ["Bruno", "Diana", "Ana", "Carlos"]);
  assert.deepEqual(r.sinDespacho.map((f) => f.marco), [true, true, false, false]);
});

test("el orden por huella no rompe el orden por nombre dentro de cada grupo", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Zulema"), esperado("2", "Ana"), esperado("3", "Mario")),
    marcaciones: [marca("1", "27", "05:00:00")],
    ...VACIO,
  });
  // Zulema primero por la huella; Ana y Mario después, alfabéticos.
  assert.deepEqual(r.sinDespacho.map((f) => f.nombre), ["Zulema", "Ana", "Mario"]);
});

test("la huella no cambia el bucket, solo el orden", () => {
  // Sigue siendo «sin despacho»: la presencia la decide el despacho.
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [marca("1", "27", "05:00:00")],
    ...VACIO,
  });
  assert.equal(r.sinDespacho.length, 1);
  assert.equal(r.trabajaron.length, 0);
  assert.equal(r.sinDespacho[0].marco, true);
});

test("conserva el origen y la confianza del esperado", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana", { origen: "historico", confianza: 0.8, bus: "514" })),
    marcaciones: [],
    ...VACIO,
  });
  assert.equal(r.sinDespacho[0].origen, "historico");
  assert.equal(r.sinDespacho[0].confianza, 0.8);
  assert.equal(r.sinDespacho[0].bus, "514");
});

// ── Las marcaciones, que siguen agrupándose como información ───────────────

test("agrupa las marcaciones por persona, con sus dos badges", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [
      marca("1", "27", "06:00:00"),
      marca("1", "89", "14:30:00"),
      marca("1", "27", "09:15:00"),
    ],
    ...VACIO,
  });
  assert.equal(r.marcaron.length, 1);
  assert.equal(r.marcaron[0].cantidad, 3);
  assert.equal(r.marcaron[0].primera, "2026-10-13T06:00:00-05:00");
  assert.equal(r.marcaron[0].ultima, "2026-10-13T14:30:00-05:00");
  assert.deepEqual(r.marcaron[0].pines, ["27", "89"]);
});

test("una marcación sin cédula va a «sin maestro», no a una persona", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [marca(null, "999", "06:00:00"), marca(null, "999", "07:00:00")],
    ...VACIO,
  });
  assert.equal(r.sinMaestro.sinCedula.length, 1);
  assert.equal(r.sinMaestro.sinCedula[0].pin, "999");
  assert.equal(r.sinMaestro.sinCedula[0].cantidad, 2);
  assert.equal(r.marcaron.length, 0);
});

test("quien marcó sin estar en la lista no ensucia los esperados", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [marca("777", "500", "06:00:00")],
    ...VACIO,
  });
  assert.equal(r.sinMaestro.noEsperados.length, 1);
  assert.equal(r.sinMaestro.noEsperados[0].cedula, "777");
  assert.equal(r.sinMaestro.noEsperados[0].esperado, false);
  assert.equal(r.marcaron.length, 0);
});

test("día sin nada: todo vacío, sin reventar", () => {
  const r = resumenDelDia({ esperados: new Map(), marcaciones: [], ...VACIO });
  assert.deepEqual(r.sinDespacho, []);
  assert.deepEqual(r.porSalir, []);
  assert.deepEqual(r.trabajaron, []);
  assert.deepEqual(r.conNovedad, []);
  assert.deepEqual(r.marcaron, []);
  assert.deepEqual(r.sinMaestro.sinCedula, []);
  assert.deepEqual(r.sinMaestro.noEsperados, []);
});

test("las cuentas cuadran: cada esperado cae en exactamente una lista", () => {
  const esperados = mapa(
    esperado("1", "Trabajó"),
    esperado("2", "Sin despacho"),
    esperado("3", "Con novedad"),
    esperado("4", "Turno por salir")
  );
  const r = resumenDelDia({
    esperados,
    trabajaron: new Map([["1", viaje("04:00:00")]]),
    porSalir: new Set(["4"]),
    novedades: new Set(["3"]),
    marcaciones: [marca("1", "27", "06:00:00"), marca(null, "999", "07:00:00")],
  });
  const total =
    r.trabajaron.length + r.sinDespacho.length + r.conNovedad.length + r.porSalir.length;
  assert.equal(total, esperados.size);
  // Y nadie aparece dos veces.
  const vistos = [
    ...r.trabajaron.map((f) => f.cedula),
    ...r.sinDespacho.map((f) => f.cedula),
    ...r.conNovedad.map((e) => e.cedula),
    ...r.porSalir.map((f) => f.cedula),
  ];
  assert.equal(new Set(vistos).size, vistos.length);
});
