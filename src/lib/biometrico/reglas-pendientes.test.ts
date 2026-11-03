import assert from "node:assert/strict";
import test from "node:test";

import type { PrimerViaje } from "./despacho";
import type { Esperado, FilaMarco, ResumenDia } from "./dia";
import {
  REGLAS_POR_OMISION,
  cedulasReglaActual,
  evaluarReglas,
  parsearReglas,
  reglasPorOmision,
  rodarDescarta,
  tipoDeDia,
  validarReglas,
  type ReglasPendientes,
} from "./reglas-pendientes";

const LUNES = "2026-10-19";

function esp(cedula: string, origen: Esperado["origen"] = "despacho"): Esperado {
  return { cedula, nombre: "Nombre " + cedula, codigo: "C" + cedula, bus: "B" + cedula, origen };
}

function viaje(horaGema: string): PrimerViaje {
  return { hora: horaGema, bus: null, turno: null, viaje: 1, ruta: null, estado: "DESPACHADO", viajes: 1 };
}

/** Huella a la hora local de Colombia dada («HH:MM»). */
function huella(cedula: string, hhmm: string): FilaMarco {
  const iso = `${LUNES}T${hhmm}:00-05:00`;
  return {
    cedula, nombre: "Nombre " + cedula, codigo: "C" + cedula, primera: iso, ultima: iso,
    cantidad: 1, pines: ["1"], esperado: true, llegada: "lector",
  };
}

/**
 * Resumen de ejemplo:
 *  1 sin despacho, sin huella        → regla actual SÍ
 *  2 sin despacho, con huella 06:10  → regla actual NO (vino)
 *  3 rodó 05:00, sin huella
 *  4 rodó 10:30, con huella 09:45
 *  5 por salir, sin huella
 *  6 sin despacho, sin huella, origen plantilla
 */
function resumen(): ResumenDia {
  return {
    sinDespacho: [
      { ...esp("1"), porSalir: false, marco: false },
      { ...esp("2"), porSalir: false, marco: true },
      { ...esp("6", "maestro"), porSalir: false, marco: false },
    ],
    porSalir: [{ ...esp("5"), porSalir: true, marco: false }],
    trabajaron: [
      { ...esp("3"), primerViaje: viaje("05:00:00"), marco: false },
      { ...esp("4"), primerViaje: viaje("10:30:00"), marco: true },
    ],
    conNovedad: [],
    marcaron: [huella("2", "06:10"), huella("4", "09:45")],
    sinMaestro: { sinCedula: [], noEsperados: [] },
  };
}

function con(cambios: (r: ReglasPendientes) => void): ReglasPendientes {
  const r = reglasPorOmision();
  cambios(r);
  return r;
}

function evaluar(reglas: ReglasPendientes, extra: Partial<Parameters<typeof evaluarReglas>[0]> = {}) {
  return evaluarReglas({
    fecha: LUNES,
    reglas,
    resumen: resumen(),
    ultimoDiaRodado: new Map([["1", "2026-10-17"], ["3", LUNES], ["4", LUNES], ["5", "2026-09-30"]]),
    conPendiente: [],
    ...extra,
  });
}

const cedulas = (xs: { cedula: string }[]) => xs.map((x) => x.cedula).sort();

test("por omisión reproduce exactamente la regla actual", () => {
  const r = evaluar(REGLAS_POR_OMISION);
  assert.deepEqual(cedulas(r.candidatos), [...cedulasReglaActual(resumen())].sort());
  assert.deepEqual(cedulas(r.candidatos), ["1", "6"]);
  assert.equal(r.conteos.soloPrueba, 0);
  assert.equal(r.conteos.soloActual, 0);
  assert.equal(r.tipoDia, "habil");
  assert.equal(r.diaActivo, true);
  assert.equal(r.horaCorte, "09:00");
});

test("tipo de día: sábado, domingo y lunes festivo", () => {
  assert.equal(tipoDeDia("2026-10-31"), "sabado");
  assert.equal(tipoDeDia("2026-11-01"), "domingo");
  assert.equal(tipoDeDia("2026-11-02"), "festivo");
  assert.equal(tipoDeDia(LUNES), "habil");
});

test("en domingo se evalúa aunque esté apagado, y dice que no correría", () => {
  const r = evaluar(REGLAS_POR_OMISION, { fecha: "2026-11-01" });
  assert.equal(r.tipoDia, "domingo");
  assert.equal(r.diaActivo, false);
  assert.deepEqual(cedulas(r.candidatos), ["1", "6"]);
  const encendido = evaluar(con((x) => { x.dias.domingo = { activo: true, hora: "11:00" }; }), { fecha: "2026-11-01" });
  assert.equal(encendido.diaActivo, true);
  assert.equal(encendido.horaCorte, "11:00");
});

test("combinación O: basta con no tener huella o no tener despacho", () => {
  const r = evaluar(con((x) => { x.criterio.combinar = "o"; }));
  // 1 y 6 (ninguna), 2 (sin despacho), 3 (sin huella), 5 (sin huella). 4 tiene ambas.
  assert.deepEqual(cedulas(r.candidatos), ["1", "2", "3", "5", "6"]);
  assert.equal(r.conteos.soloPrueba, 3);
});

test("solo el criterio de huella", () => {
  const r = evaluar(con((x) => { x.criterio.sinDespacho = false; }));
  assert.deepEqual(cedulas(r.candidatos), ["1", "3", "5", "6"]);
});

test("hora límite de huella: la tardía cuenta como sin huella", () => {
  const r = evaluar(con((x) => { x.criterio.sinDespacho = false; x.horaLimiteHuella = "09:00"; }));
  assert.ok(cedulas(r.candidatos).includes("4"));
  const c4 = r.candidatos.find((c) => c.cedula === "4")!;
  assert.match(c4.motivos[0], /09:45/);
  assert.ok(!cedulas(r.candidatos).includes("2")); // 06:10 está a tiempo
});

test("hora límite de despacho: un primer viaje tardío cuenta como sin despacho", () => {
  const r = evaluar(con((x) => { x.criterio.sinHuella = false; x.horaLimiteDespacho = "09:00"; }));
  assert.deepEqual(cedulas(r.candidatos), ["1", "2", "4", "6"]);
});

test("por salir solo cuenta si se pide", () => {
  assert.ok(!cedulas(evaluar(REGLAS_POR_OMISION).candidatos).includes("5"));
  const r = evaluar(con((x) => { x.incluirPorSalir = true; }));
  assert.ok(cedulas(r.candidatos).includes("5"));
});

test("origen apagado excluye con razón y aparece en «solo actual»", () => {
  const r = evaluar(con((x) => { x.origenes.maestro = false; }));
  assert.deepEqual(cedulas(r.candidatos), ["1"]);
  assert.deepEqual(cedulas(r.excluidos), ["6"]);
  assert.match(r.excluidos[0].razon, /origen/);
  assert.deepEqual(cedulas(r.soloActual), ["6"]);
});

test("días sin rodar y quien nunca rodó", () => {
  const r = evaluar(con((x) => { x.criterio.combinar = "o"; x.incluirPorSalir = true; x.maxDiasSinRodar = 5; }));
  // 5 lleva 19 días sin rodar.
  assert.ok(!cedulas(r.candidatos).includes("5"));
  assert.match(r.excluidos.find((e) => e.cedula === "5")!.razon, /19 días/);
  const c1 = r.candidatos.find((c) => c.cedula === "1")!;
  assert.equal(c1.diasSinRodar, 2);

  const sinNunca = evaluar(con((x) => { x.incluirNuncaRodo = false; }));
  // 6 y 2 no tienen historial; 2 no cumplía de todos modos.
  assert.deepEqual(cedulas(sinNunca.candidatos), ["1"]);
});

test("marca quien ya tiene pendiente", () => {
  const r = evaluar(REGLAS_POR_OMISION, { conPendiente: ["1"] });
  assert.equal(r.candidatos.find((c) => c.cedula === "1")!.yaTienePendiente, true);
  assert.equal(r.candidatos.find((c) => c.cedula === "6")!.yaTienePendiente, false);
});

test("«solo actual» explica por qué la prueba no lo toma", () => {
  const r = evaluar(con((x) => { x.criterio.sinHuella = false; x.criterio.sinDespacho = true; x.incluirNuncaRodo = false; }));
  const r6 = r.soloActual.find((e) => e.cedula === "6");
  assert.ok(r6);
  assert.match(r6.razon, /histórico/);
});

test("parsearReglas perdona JSON dañado o incompleto", () => {
  assert.deepEqual(parsearReglas(null), REGLAS_POR_OMISION);
  // Sin nada guardado, lunes a viernes toma la hora del proceso real.
  assert.equal(parsearReglas(null, "08:00").dias.habil.hora, "08:00");
  assert.equal(parsearReglas(null, "8 am").dias.habil.hora, "09:00");
  assert.deepEqual(parsearReglas("{no es json"), REGLAS_POR_OMISION);
  assert.deepEqual(parsearReglas("[1,2]"), REGLAS_POR_OMISION);
  const p = parsearReglas(JSON.stringify({
    criterio: { sinHuella: false, sinDespacho: false },
    dias: { sabado: { activo: true, hora: "25:00" } },
    horaLimiteHuella: "07:30",
    maxDiasSinRodar: -3,
  }));
  assert.equal(p.criterio.sinHuella, true); // sin criterio vuelve a la regla actual
  assert.equal(p.criterio.sinDespacho, true);
  assert.deepEqual(p.dias.sabado, { activo: true, hora: "09:00" });
  assert.equal(p.horaLimiteHuella, "07:30");
  assert.equal(p.maxDiasSinRodar, null);
  // Ida y vuelta.
  const r = con((x) => { x.criterio.combinar = "o"; x.dias.festivo = { activo: true, hora: "10:15" }; x.maxDiasSinRodar = 7; });
  assert.deepEqual(parsearReglas(JSON.stringify(r)), r);
});

test("noCumplen: quien tiene evidencia de que vino, no quien quedó fuera por un filtro", () => {
  // Por omisión: 2 (huella), 3 y 4 (rodaron) y 5 (por salir) no cumplen.
  assert.deepEqual(evaluar(REGLAS_POR_OMISION).noCumplen, ["2", "3", "4", "5"]);
  // Con O, 3 (rodó sin huella) SÍ cumple: no se le puede retirar el pendiente.
  assert.deepEqual(evaluar(con((x) => { x.criterio.combinar = "o"; })).noCumplen, ["4"]);
  // 6 queda fuera por origen: eso es configuración, no evidencia.
  const r = evaluar(con((x) => { x.origenes.maestro = false; }));
  assert.ok(!r.noCumplen.includes("6"));
});

test("rodarDescarta: solo cuando el despacho es obligatorio y sin hora límite", () => {
  assert.equal(rodarDescarta(REGLAS_POR_OMISION), true);
  assert.equal(rodarDescarta(con((x) => { x.criterio.sinHuella = false; })), true);
  assert.equal(rodarDescarta(con((x) => { x.criterio.combinar = "o"; })), false);
  assert.equal(rodarDescarta(con((x) => { x.criterio.sinDespacho = false; })), false);
  assert.equal(rodarDescarta(con((x) => { x.horaLimiteDespacho = "08:00"; })), false);
});

test("validarReglas", () => {
  assert.equal(validarReglas(reglasPorOmision()), null);
  assert.match(validarReglas(con((x) => { x.criterio.sinHuella = false; x.criterio.sinDespacho = false; }))!, /criterio/);
  assert.match(validarReglas(con((x) => { x.dias.domingo.hora = "9"; }))!, /domingo/);
  assert.match(validarReglas(con((x) => { x.horaLimiteHuella = "aa"; }))!, /huella/);
  assert.match(validarReglas(con((x) => { x.maxDiasSinRodar = 1.5; }))!, /entero/);
  assert.match(validarReglas(con((x) => { for (const k of Object.keys(x.origenes)) x.origenes[k as keyof typeof x.origenes] = false; }))!, /origen/);
});
