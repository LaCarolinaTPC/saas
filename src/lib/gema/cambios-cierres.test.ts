import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compararCierres,
  fechaLimite,
  llaveCierre,
  resumirCambios,
  type CierreComparable,
} from "./cambios-cierres";

const cierre = (over: Partial<CierreComparable> = {}): CierreComparable => ({
  cod_conductor: "C001",
  fecha: "2026-11-01",
  ruta: "R1",
  conductor_nombre: "PEREZ JUAN",
  viajes: 8,
  timbradas: 400,
  bruto: 300000,
  salario_bruto_dia: 120000,
  salario_neto_dia: 100000,
  ahorro: 5000,
  ahorro_obli: 2000,
  anticipo: 0,
  ...over,
});

const mapa = (...filas: CierreComparable[]) => new Map(filas.map((f) => [llaveCierre(f), f]));
const LIMITE = "2026-11-07";

test("fechaLimite: hoy menos los días de gracia", () => {
  assert.equal(fechaLimite("2026-11-09", 2), "2026-11-07");
  assert.equal(fechaLimite("2026-03-01", 2), "2026-02-27");
});

test("sin cambios no reporta nada", () => {
  assert.deepEqual(compararCierres(mapa(cierre()), mapa(cierre()), LIMITE), []);
});

test("diferencias de menos de 1 y nulo contra 0 se ignoran", () => {
  const nueva = cierre({ salario_neto_dia: 100000.4, anticipo: null });
  assert.deepEqual(compararCierres(mapa(cierre()), mapa(nueva), LIMITE), []);
});

test("modificado: solo los campos que cambiaron, con antes y después", () => {
  const nueva = cierre({ viajes: 6, salario_neto_dia: 80000 });
  const [c, ...resto] = compararCierres(mapa(cierre()), mapa(nueva), LIMITE);
  assert.equal(resto.length, 0);
  assert.equal(c.tipo, "modificado");
  assert.deepEqual(c.cambios, { viajes: [8, 6], salario_neto_dia: [100000, 80000] });
  assert.equal(c.delta_neto, -20000);
});

test("los cierres dentro de la gracia no se vigilan", () => {
  const vieja = cierre({ fecha: "2026-11-07" });
  const nueva = cierre({ fecha: "2026-11-07", salario_neto_dia: 1 });
  assert.deepEqual(compararCierres(mapa(vieja), mapa(nueva), LIMITE), []);
  // Ni nuevos ni borrados recientes.
  assert.deepEqual(compararCierres(mapa(), mapa(nueva), LIMITE), []);
  assert.deepEqual(compararCierres(mapa(vieja), mapa(), LIMITE), []);
});

test("nuevo: fila que GEMA agregó a un día viejo", () => {
  const nueva = cierre({ ruta: "R2", anticipo: 0 });
  const [c] = compararCierres(mapa(cierre()), mapa(cierre(), nueva), LIMITE);
  assert.equal(c.tipo, "nuevo");
  assert.equal(c.ruta, "R2");
  assert.deepEqual(c.cambios.salario_neto_dia, [null, 100000]);
  assert.equal(c.cambios.anticipo, undefined);
  assert.equal(c.delta_neto, 100000);
});

test("borrado: fila guardada que GEMA ya no reporta", () => {
  const [c] = compararCierres(mapa(cierre(), cierre({ ruta: "R2" })), mapa(cierre()), LIMITE);
  assert.equal(c.tipo, "borrado");
  assert.deepEqual(c.cambios.salario_neto_dia, [100000, null]);
  assert.equal(c.delta_neto, -100000);
});

test("cambio de ruta = un borrado y un nuevo", () => {
  const cambios = compararCierres(mapa(cierre()), mapa(cierre({ ruta: "R9" })), LIMITE);
  assert.deepEqual(cambios.map((c) => c.tipo).sort(), ["borrado", "nuevo"]);
  assert.equal(resumirCambios(cambios).deltaNeto, 0);
});

test("resumirCambios: cierres, conductores, días y delta", () => {
  const r = resumirCambios([
    { fecha: "2026-11-01", cod_conductor: "A", delta_neto: -1000 },
    { fecha: "2026-11-01", cod_conductor: "B", delta_neto: 500 },
    { fecha: "2026-11-02", cod_conductor: "A", delta_neto: -250.6 },
  ]);
  assert.deepEqual(r, { cierres: 3, conductores: 2, dias: 2, deltaNeto: -751 });
});
