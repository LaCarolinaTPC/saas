import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionarLeidas, mismaEmpresa, normalizarEmpresa, resumenExperiencia, validarExperiencia, verificarPorEmpresa, type ExperienciaLaboral } from "./experiencia";

const HOY = "2026-11-21";
const exp = (p: Partial<ExperienciaLaboral>): ExperienciaLaboral => ({
  id: p.id ?? "e1",
  empresa: null,
  cargo: null,
  desde: null,
  hasta: null,
  vehiculo: null,
  conduccion: true,
  origen: "hoja_vida",
  verificacion: "sin_verificar",
  como: null,
  nota: null,
  verificada_por: null,
  verificada_at: null,
  ...p,
});

test("normalizarEmpresa y mismaEmpresa ignoran tildes, signos y la forma societaria", () => {
  assert.equal(normalizarEmpresa("Transportes Ficticios S.A.S."), "transportes ficticios");
  assert.ok(mismaEmpresa("TRANSPORTES FICTICIOS SAS", "Transportes Ficticios S.A.S"));
  assert.ok(mismaEmpresa("Sobusa", "Sobusa S.A."));
  assert.ok(mismaEmpresa("Coolitoral Ltda", "Cooperativa Coolitoral"));
  assert.ok(!mismaEmpresa("Sobusa", "Coolitoral"));
  assert.ok(!mismaEmpresa("", "Sobusa"));
  assert.ok(!mismaEmpresa("SA", "Sobusa SA"));
});

test("fusionarLeidas agrega los empleos nuevos sin verificar y conserva los que ya están", () => {
  const ya = [exp({ id: "a", empresa: "Sobusa", desde: "2022-01", verificacion: "verificada", como: "carta_laboral" })];
  const r = fusionarLeidas(ya, [
    { empresa: "Sobusa S.A.", cargo: "Conductor", desde: "2022-01", hasta: "2024-06", vehiculo: "bus", conduccion: true },
    { empresa: "Coolitoral", cargo: "Conductor de buseta", desde: "2024-07", hasta: "actual", vehiculo: "buseta", conduccion: true },
    { empresa: null, cargo: null, desde: null, hasta: null, vehiculo: null, conduccion: false },
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].verificacion, "verificada");
  assert.deepEqual([r[1].empresa, r[1].verificacion, r[1].origen], ["Coolitoral", "sin_verificar", "hoja_vida"]);
});

test("verificarPorEmpresa marca solo los de esa empresa que seguían sin verificar", () => {
  const items = [
    exp({ id: "a", empresa: "Transportes Ficticios SAS" }),
    exp({ id: "b", empresa: "Coolitoral" }),
    exp({ id: "c", empresa: "Transportes Ficticios", verificacion: "no_confirmada" }),
  ];
  const r = verificarPorEmpresa(items, "TRANSPORTES FICTICIOS S.A.S.", { como: "carta_laboral", por: "gh@x.co", at: "2026-11-21T10:00:00Z" });
  assert.equal(r.cambiados, 1);
  assert.deepEqual(r.items.map((e) => e.verificacion), ["verificada", "sin_verificar", "no_confirmada"]);
  assert.equal(r.items[0].como, "carta_laboral");
});

test("resumenExperiencia: sin verificar, parcial, verificada y con problema", () => {
  const a = exp({ id: "a", empresa: "Sobusa", desde: "2022-01", hasta: "2023-12" }); // 24 meses
  const b = exp({ id: "b", empresa: "Coolitoral", desde: "2024-01", hasta: "2024-12" }); // 12 meses
  const bodega = exp({ id: "c", empresa: "Bodega", desde: "2019-01", hasta: "2021-12", conduccion: false });
  const sin = resumenExperiencia([a, b, bodega], HOY);
  assert.equal(sin.estado, "sin_verificar");
  assert.match(sin.texto, /cartas laborales o de llamar a las referencias/);
  assert.deepEqual([sin.mesesDeclarados, sin.mesesVerificados], [36, 0]);
  const parcial = resumenExperiencia([{ ...a, verificacion: "verificada" }, b], HOY);
  assert.deepEqual([parcial.estado, parcial.mesesVerificados], ["parcial", 24]);
  assert.equal(resumenExperiencia([{ ...a, verificacion: "verificada" }, { ...b, verificacion: "verificada" }], HOY).estado, "verificada");
  assert.equal(resumenExperiencia([{ ...a, verificacion: "no_confirmada" }, b], HOY).estado, "con_problema");
  assert.equal(resumenExperiencia([bodega], HOY).estado, "sin_datos");
  assert.equal(resumenExperiencia([], HOY).texto, "Sin experiencia registrada.");
});

test("validarExperiencia", () => {
  assert.equal(validarExperiencia({}).ok, false);
  assert.equal(validarExperiencia({ empresa: "Sobusa", desde: "2022-13" }).ok, false);
  assert.equal(validarExperiencia({ empresa: "Sobusa", desde: "2023-01", hasta: "2022-01" }).ok, false);
  assert.equal(validarExperiencia({ empresa: "Sobusa", desde: "2022-01", hasta: "actual" }).ok, true);
});

// ── Constatar la carta laboral con la hoja de vida (21-nov-2026) ────────────
import { cartaDelAspirante, constatarCarta, diferenciasConCarta, resumenExperiencia as resumenExp, type ExperienciaLaboral as Exp } from "./experiencia";

const empleo = (p: Partial<Exp>): Exp => ({
  id: "e1", empresa: "Transportes Coolitoral S.A.", cargo: "Conductor de bus", desde: "2019-03", hasta: "2022-08", vehiculo: "bus", conduccion: true,
  origen: "hoja_vida", verificacion: "sin_verificar", como: null, nota: null, verificada_por: null, verificada_at: null, ...p,
});
const quien = { por: "gh@prueba", at: "2026-11-21T20:00:00Z" };
const ASPIRANTE = "CARLOS ANDRES GOMEZ RUIZ";

test("carta: coincide con la hoja de vida (misma empresa, fechas y cargo) → verificada sin diferencias", () => {
  const r = constatarCarta([empleo({})], { empresa: "COOLITORAL", cargo: "Conductor", desde: "2019-03-01", hasta: "2022-08-31", nombre: "Carlos Andrés Gómez Ruiz" }, ASPIRANTE, quien);
  assert.equal(r.resultado, "verificada");
  assert.equal(r.items[0].verificacion, "verificada");
  assert.equal(r.items[0].diferencias, null);
  assert.match(r.items[0].nota ?? "", /coincide/);
});

test("carta: otras fechas → verificada con las diferencias anotadas y las fechas de la carta", () => {
  const r = constatarCarta([empleo({ desde: "2017-01", hasta: "2019-02", empresa: "Sobusa" })], { empresa: "SOBUSA S.A.", cargo: "Conductor", desde: "2017-06-15", hasta: "2018-10-20", nombre: ASPIRANTE }, ASPIRANTE, quien);
  assert.equal(r.resultado, "con_diferencias");
  const e = r.items[0];
  assert.match(e.diferencias ?? "", /inicio: la hoja de vida dice 2017-01 y la carta 2017-06/);
  assert.match(e.diferencias ?? "", /fin: la hoja de vida dice 2019-02 y la carta 2018-10/);
  assert.deepEqual([e.desde, e.hasta, e.declarado], ["2017-06", "2018-10", "2017-01 a 2019-02"]);
  assert.match(resumenExp([e], "2026-11-21").texto, /Una carta no coincide del todo/);
});

test("carta: cargo distinto al de conducción, y diferencias pequeñas que no cuentan", () => {
  assert.deepEqual(diferenciasConCarta(empleo({}), { empresa: "x", cargo: "Auxiliar de bodega", desde: "2019-04", hasta: "2022-07" }), ["cargo: la hoja de vida dice Conductor de bus y la carta «Auxiliar de bodega»"]);
  // Hasta dos meses de diferencia se aceptan; «a la fecha» = actual.
  assert.deepEqual(diferenciasConCarta(empleo({ hasta: "actual" }), { empresa: "x", cargo: "Conductor", desde: "2019-05", hasta: "a la fecha" }), []);
});

test("carta: a nombre de otra persona no verifica; de otra empresa, se agrega verificada", () => {
  const otra = constatarCarta([empleo({})], { empresa: "Coolitoral", cargo: "Conductor", desde: "2019-03", hasta: "2022-08", nombre: "Pedro Pérez Díaz" }, ASPIRANTE, quien);
  assert.equal(otra.resultado, "otro_nombre");
  assert.equal(otra.items[0].verificacion, "sin_verificar");
  assert.equal(cartaDelAspirante("Gómez Ruiz Carlos", ASPIRANTE), true);
  const nueva = constatarCarta([empleo({})], { empresa: "Transmetro", cargo: "Operador de bus", desde: "2023-01", hasta: null, nombre: ASPIRANTE }, ASPIRANTE, quien);
  assert.equal(nueva.resultado, "agregada");
  assert.equal(nueva.items.length, 2);
  assert.equal(nueva.items[1].verificacion, "verificada");
  assert.equal(nueva.items[1].conduccion, true);
});
