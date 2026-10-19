import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diaOperativo,
  diasEntreIso,
  resumenDelDia,
  type Esperado,
  type MarcacionDia,
} from "./dia";

function esperado(cedula: string, nombre: string, extra: Partial<Esperado> = {}): Esperado {
  return { cedula, nombre, codigo: null, bus: null, origen: "despacho", ...extra };
}

function mapa(...lista: Esperado[]): Map<string, Esperado> {
  return new Map(lista.map((e) => [e.cedula, e]));
}

function marca(cedula: string | null, pin: string, hora: string): MarcacionDia {
  return { cedula, pin, momento: `2026-10-13T${hora}-05:00` };
}

const VACIO = { novedades: new Set<string>(), despachados: new Set<string>() };

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

test("quien no marcó y no tiene novedad sale en sin marcación", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana"), esperado("2", "Bruno")),
    marcaciones: [marca("1", "27", "06:00:00")],
    ...VACIO,
  });
  assert.deepEqual(r.sinMarcacion.map((f) => f.cedula), ["2"]);
  assert.deepEqual(r.marcaron.map((f) => f.cedula), ["1"]);
  assert.equal(r.conNovedad.length, 0);
  assert.equal(r.trabajoSinMarcar.length, 0);
});

test("con novedad registrada ya no se pregunta por él", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana"), esperado("2", "Bruno")),
    marcaciones: [],
    novedades: new Set(["2"]),
    despachados: new Set(),
  });
  assert.deepEqual(r.sinMarcacion.map((f) => f.cedula), ["1"]);
  assert.deepEqual(r.conNovedad.map((e) => e.cedula), ["2"]);
});

test("despachado por GEMA y sin huella = trabajó sin marcar, no es ausencia", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana"), esperado("2", "Bruno")),
    marcaciones: [],
    novedades: new Set(),
    despachados: new Set(["2"]),
  });
  assert.deepEqual(r.sinMarcacion.map((f) => f.cedula), ["1"]);
  assert.deepEqual(r.trabajoSinMarcar.map((f) => f.cedula), ["2"]);
  assert.equal(r.trabajoSinMarcar[0].despachado, true);
  assert.equal(r.sinMarcacion[0].despachado, false);
});

test("dos badges de la misma persona se juntan en una fila", () => {
  // Caso real: diez cédulas están enroladas con dos pines.
  const r = resumenDelDia({
    esperados: mapa(esperado("72432031", "Francisco Ternera")),
    marcaciones: [
      marca("72432031", "628", "06:10:00"),
      marca("72432031", "813", "14:30:00"),
      marca("72432031", "628", "06:11:00"),
    ],
    ...VACIO,
  });
  assert.equal(r.marcaron.length, 1);
  const f = r.marcaron[0];
  assert.equal(f.cantidad, 3);
  assert.deepEqual(f.pines, ["628", "813"]);
  assert.equal(f.primera, "2026-10-13T06:10:00-05:00");
  assert.equal(f.ultima, "2026-10-13T14:30:00-05:00");
});

test("primera y última salen ordenadas aunque lleguen al revés", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [marca("1", "27", "18:00:00"), marca("1", "27", "05:30:00")],
    ...VACIO,
  });
  assert.equal(r.marcaron[0].primera, "2026-10-13T05:30:00-05:00");
  assert.equal(r.marcaron[0].ultima, "2026-10-13T18:00:00-05:00");
});

test("pin sin cédula va a «sin maestro», agrupado y por cantidad", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [
      marca(null, "999", "06:00:00"),
      marca(null, "999", "07:00:00"),
      marca(null, "888", "08:00:00"),
      marca("1", "27", "06:30:00"),
    ],
    ...VACIO,
  });
  assert.deepEqual(
    r.sinMaestro.sinCedula.map((s) => [s.pin, s.cantidad]),
    [["999", 2], ["888", 1]]
  );
  assert.equal(r.sinMaestro.noEsperados.length, 0);
});

test("marcó alguien que no estaba esperado (relevo o administrativo)", () => {
  const r = resumenDelDia({
    esperados: mapa(esperado("1", "Ana")),
    marcaciones: [marca("1", "27", "06:00:00"), marca("9", "500", "07:00:00")],
    ...VACIO,
  });
  assert.deepEqual(r.sinMaestro.noEsperados.map((f) => f.cedula), ["9"]);
  assert.equal(r.sinMaestro.noEsperados[0].nombre, null);
  assert.equal(r.sinMaestro.noEsperados[0].esperado, false);
  assert.equal(r.marcaron.length, 1);
});

test("las listas se ordenan por nombre", () => {
  const r = resumenDelDia({
    esperados: mapa(
      esperado("1", "Zulema"),
      esperado("2", "Ana"),
      esperado("3", "Mario")
    ),
    marcaciones: [],
    ...VACIO,
  });
  assert.deepEqual(r.sinMarcacion.map((f) => f.nombre), ["Ana", "Mario", "Zulema"]);
});

test("conserva el origen y la confianza del esperado", () => {
  const r = resumenDelDia({
    esperados: mapa(
      esperado("1", "Ana", { origen: "historico", confianza: 0.8, bus: "514" })
    ),
    marcaciones: [],
    ...VACIO,
  });
  assert.equal(r.sinMarcacion[0].origen, "historico");
  assert.equal(r.sinMarcacion[0].confianza, 0.8);
  assert.equal(r.sinMarcacion[0].bus, "514");
});

test("día sin nada: todo vacío, sin reventar", () => {
  const r = resumenDelDia({ esperados: new Map(), marcaciones: [], ...VACIO });
  assert.deepEqual(r.sinMarcacion, []);
  assert.deepEqual(r.marcaron, []);
  assert.deepEqual(r.conNovedad, []);
  assert.deepEqual(r.trabajoSinMarcar, []);
  assert.deepEqual(r.sinMaestro.sinCedula, []);
  assert.deepEqual(r.sinMaestro.noEsperados, []);
});

test("las cuentas cuadran: cada esperado cae en exactamente una lista", () => {
  const esperados = mapa(
    esperado("1", "Marcó"),
    esperado("2", "Sin marcación"),
    esperado("3", "Con novedad"),
    esperado("4", "Trabajó sin marcar")
  );
  const r = resumenDelDia({
    esperados,
    marcaciones: [marca("1", "27", "06:00:00"), marca(null, "999", "07:00:00")],
    novedades: new Set(["3"]),
    despachados: new Set(["4"]),
  });
  const total =
    r.marcaron.length + r.sinMarcacion.length + r.conNovedad.length + r.trabajoSinMarcar.length;
  assert.equal(total, esperados.size);
  // Y nadie aparece dos veces.
  const vistos = [
    ...r.marcaron.map((f) => f.cedula),
    ...r.sinMarcacion.map((f) => f.cedula),
    ...r.conNovedad.map((e) => e.cedula),
    ...r.trabajoSinMarcar.map((f) => f.cedula),
  ];
  assert.equal(new Set(vistos).size, vistos.length);
});
