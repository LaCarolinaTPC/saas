import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cajaFrenteAforo, compararConAforo, corregirPorAforo, elegirFechaForms, esNombreReal, fechaInequivoca, leerFechaForms, normalizarNombre, resolverConductor,
  validarRevision,
  type TipoNovedad, type ViajeGema,
} from "./camaras-reglas";

const tipo = (
  clave: string, elemento: "camara" | "sensor", es_falla: boolean, exige_dfs = false, exige_aforo = false,
): TipoNovedad => ({ clave, elemento, nombre: clave, es_falla, exige_dfs, exige_aforo, activo: true, orden: 0 });
const TIPOS = [
  tipo("camara_normal", "camara", false, true, true),
  tipo("camara_no_bajo_info", "camara", true, false, true),
  tipo("camara_microsd", "camara", true),
  tipo("sensor_rutina", "sensor", false),
  { ...tipo("sensor_viejo", "sensor", true), activo: false },
];
const HOY = "2026-10-07";
const base = {
  fechaViaje: "2026-10-06", vehiculoCodigo: "537", viaje: "2", elemento: "camara",
  tipoNovedad: "camara_normal", aforo: 78,
};

test("semáforo: ≤ 3 pasajeros o ≤ 5 % cuadra", () => {
  assert.equal(compararConAforo(80, 78).nivel, "ok");
  assert.equal(compararConAforo(210, 200).nivel, "ok");
  assert.equal(compararConAforo(0, 0).nivel, "ok");
});

test("semáforo: hasta 15 % es revisar, más es descuadre", () => {
  const r = compararConAforo(110, 100);
  assert.equal(r.nivel, "alerta");
  assert.equal(r.diferencia, 10);
  assert.equal(r.porcentaje, 10);
  assert.equal(compararConAforo(60, 100).nivel, "critico");
  assert.equal(compararConAforo(20, 0).nivel, "critico");
});

test("semáforo: sin uno de los dos conteos no hay comparación", () => {
  assert.equal(compararConAforo(null, 50).nivel, "sin_dato");
  assert.equal(compararConAforo(50, undefined).nivel, "sin_dato");
});

test("revisión de cámara normal válida, sin falla", () => {
  const r = validarRevision(base, TIPOS, HOY);
  assert.equal(r.conFalla, false);
  assert.equal(r.aforo, 78);
  assert.deepEqual(r.avisos, []);
});

test("la cámara normal exige el aforo y ya no recibe el DFS", () => {
  assert.throws(() => validarRevision({ ...base, aforo: null }, TIPOS, HOY), /aforo/);
  // Aunque el navegador mande un DFS, no se lee ni se devuelve.
  const r = validarRevision({ ...base, dfsOptocontrol: 80 } as typeof base, TIPOS, HOY);
  assert.equal("dfsOptocontrol" in r, false);
});

test("no bajó información: falla y el aforo se exige", () => {
  const r = validarRevision({ ...base, tipoNovedad: "camara_no_bajo_info" }, TIPOS, HOY);
  assert.equal(r.conFalla, true);
  assert.equal(r.aforo, 78);
  assert.throws(() => validarRevision({ ...base, tipoNovedad: "camara_no_bajo_info", aforo: "" }, TIPOS, HOY), /aforo/);
});

test("cámara dañada: sin video no se exige ningún conteo", () => {
  const r = validarRevision({ ...base, tipoNovedad: "camara_microsd", aforo: null }, TIPOS, HOY);
  assert.equal(r.aforo, null);
});

test("el sensor no exige conteos", () => {
  const r = validarRevision(
    { ...base, elemento: "sensor", tipoNovedad: "sensor_rutina", aforo: null }, TIPOS, HOY,
  );
  assert.equal(r.elemento, "sensor");
  assert.equal(r.aforo, null);
});

test("conteos negativos, decimales o increíbles se rechazan", () => {
  assert.throws(() => validarRevision({ ...base, aforo: -42 }, TIPOS, HOY), /entero/);
  assert.throws(() => validarRevision({ ...base, aforo: "4.5" }, TIPOS, HOY), /entero/);
  assert.throws(() => validarRevision({ ...base, aforo: 6767 }, TIPOS, HOY), /creíble/);
});

test("el tipo debe ser del elemento y estar activo", () => {
  assert.throws(() => validarRevision({ ...base, tipoNovedad: "sensor_rutina" }, TIPOS, HOY), /no es una novedad/);
  assert.throws(
    () => validarRevision({ ...base, elemento: "sensor", tipoNovedad: "sensor_viejo" }, TIPOS, HOY), /Elija el tipo/,
  );
  assert.throws(() => validarRevision({ ...base, tipoNovedad: "inventado" }, TIPOS, HOY), /Elija el tipo/);
});

test("fecha futura se rechaza y fecha vieja solo avisa", () => {
  assert.throws(() => validarRevision({ ...base, fechaViaje: "2026-10-08" }, TIPOS, HOY), /futura/);
  assert.throws(() => validarRevision({ ...base, fechaViaje: "2026-02-30" }, TIPOS, HOY), /no es válida/);
  const r = validarRevision({ ...base, fechaViaje: "2026-08-01" }, TIPOS, HOY);
  assert.equal(r.avisos.length, 1);
});

test("viaje: 1 a 99 o C.U", () => {
  assert.equal(validarRevision({ ...base, viaje: "c.u" }, TIPOS, HOY).viaje, "C.U");
  assert.throws(() => validarRevision({ ...base, viaje: "0" }, TIPOS, HOY), /viaje/);
  assert.throws(() => validarRevision({ ...base, viaje: "1a" }, TIPOS, HOY), /viaje/);
});

test("nombres: la Ñ dañada del Excel coincide con la de GEMA", () => {
  assert.equal(normalizarNombre("BOLA�OS  SOTELO"), normalizarNombre("Bolaños Sotelo"));
  assert.equal(normalizarNombre(" Méndez "), "MENDEZ");
  assert.equal(esNombreReal("CARGUE MTTO BD SIN CONDUCTOR"), false);
  assert.equal(esNombreReal(""), false);
  assert.equal(esNombreReal("PARRA CARDENAS ERNESTO"), true);
});

const RANGO = { desde: "2024-12-01", hasta: "2026-10-07" };
const fechaForms = (valor: unknown, contexto: string | null) => {
  const p = leerFechaForms(valor);
  return p ? elegirFechaForms(p, contexto, RANGO) : null;
};

test("fecha del histórico: texto d/m/aaaa con la R de repetida", () => {
  assert.deepEqual(fechaForms("15/07/2026 R", "2026-07-16"), { fecha: "2026-07-15", repetida: true, corregida: false });
  assert.deepEqual(fechaForms("16/7/2026R", "2026-07-16"), { fecha: "2026-07-16", repetida: true, corregida: false });
  assert.deepEqual(fechaForms("14/07/2026", null), { fecha: "2026-07-14", repetida: false, corregida: false });
});

test("fecha del histórico: errores de digitación del año y la barra", () => {
  assert.deepEqual(fechaForms("15/7/0206", "2026-07-16"), { fecha: "2026-07-15", repetida: false, corregida: true });
  assert.deepEqual(fechaForms("19/07/2027 R", "2026-07-18"), { fecha: "2026-07-19", repetida: true, corregida: true });
  assert.deepEqual(fechaForms("18/82026", "2026-08-19"), { fecha: "2026-08-18", repetida: false, corregida: true });
  assert.equal(fechaForms("15/7/0206", null), null);
});

test("fecha del histórico: día y mes invertidos se deciden por las filas vecinas", () => {
  // Excel guardó 7-ago, pero las vecinas son de julio: era el 8 de julio.
  assert.deepEqual(fechaForms(new Date(Date.UTC(2026, 7, 7)), "2026-07-10"), { fecha: "2026-07-08", repetida: false, corregida: true });
  // Con vecinas de agosto se respeta.
  assert.deepEqual(fechaForms(new Date(Date.UTC(2026, 7, 7)), "2026-08-05"), { fecha: "2026-08-07", repetida: false, corregida: false });
  // 8-nov-2026 aún no ha pasado: solo cabe el 11 de agosto.
  assert.deepEqual(fechaForms(new Date(Date.UTC(2026, 10, 8)), null), { fecha: "2026-08-11", repetida: false, corregida: true });
});

const ev = (conductor: boolean, caja: "cerca" | "lejos" | null) => ({ conductor, caja });

test("fecha del histórico: el conductor digitado con caja que cuadra gana a las vecinas", () => {
  // Fila 907: digitaron 7/5/2025, las vecinas apuntan a julio, pero el 7 de
  // mayo el bus hizo el viaje con el conductor digitado y la caja fue el aforo.
  const p = leerFechaForms("7/5/2025")!;
  const gema = (f: string) => (f === "2025-05-07" ? ev(true, "cerca") : ev(false, "lejos"));
  assert.deepEqual(elegirFechaForms(p, "2025-06-10", RANGO, gema), { fecha: "2025-05-07", repetida: false, corregida: false });
});

test("fecha del histórico: el nombre no basta si la caja lo contradice", () => {
  // Fila 3835: con la lectura de las vecinas la caja es el aforo exacto.
  const p = leerFechaForms(new Date(Date.UTC(2026, 8, 8)))!;
  const gema = (f: string) => (f === "2026-09-08" ? ev(true, "lejos") : ev(false, "cerca"));
  assert.equal(elegirFechaForms(p, "2026-08-10", RANGO, gema)?.fecha, "2026-08-09");
});

test("fecha del histórico: la caja decide solo si la lectura por defecto claramente no cuadra", () => {
  const p = leerFechaForms("6/10/2025")!;
  const una = (otra: ReturnType<typeof ev>, def: ReturnType<typeof ev>) => (f: string) => (f === "2025-06-10" ? otra : def);
  // Sin vecinas que den contexto, la lectura principal (6 de octubre) es la de por defecto.
  assert.equal(elegirFechaForms(p, null, RANGO, una(ev(false, "cerca"), ev(false, "lejos")))?.fecha, "2025-06-10");
  assert.equal(elegirFechaForms(p, null, RANGO, una(ev(false, "cerca"), ev(false, null)))?.fecha, "2025-10-06");
  assert.equal(elegirFechaForms(p, null, RANGO, una(ev(false, "cerca"), ev(true, "lejos")))?.fecha, "2025-10-06");
  // Con vecinas de septiembre, junio queda a más de 45 días: no se mueve.
  assert.equal(elegirFechaForms(p, "2025-09-20", RANGO, una(ev(false, "cerca"), ev(false, "lejos")))?.fecha, "2025-10-06");
});

test("fecha del histórico: lejos de las vecinas ninguna evidencia mueve la fecha", () => {
  // Fila 3544: la caja de febrero cuadra, pero las vecinas son de julio.
  const p = leerFechaForms(new Date(Date.UTC(2026, 6, 2)))!;
  const gema = (f: string) => (f === "2026-02-07" ? ev(true, "cerca") : ev(false, "lejos"));
  assert.equal(elegirFechaForms(p, "2026-07-05", RANGO, gema)?.fecha, "2026-07-02");
});

test("caja frente al aforo", () => {
  assert.equal(cajaFrenteAforo(84, 86), "cerca");
  assert.equal(cajaFrenteAforo(18, 86), "lejos");
  assert.equal(cajaFrenteAforo(70, 86), null);
  assert.equal(cajaFrenteAforo(null, 86), null);
});

test("fecha del histórico: año imposible de Excel se toma del contexto", () => {
  assert.deepEqual(fechaForms(new Date(Date.UTC(2205, 9, 9)), "2025-10-07"), { fecha: "2025-10-09", repetida: false, corregida: true });
});

test("fecha del histórico: solo la que no admite otra lectura sirve de contexto", () => {
  assert.equal(fechaInequivoca(leerFechaForms("14/07/2026")!, RANGO), "2026-07-14");
  assert.equal(fechaInequivoca(leerFechaForms("8/7/2026")!, RANGO), null);
  assert.equal(fechaInequivoca(leerFechaForms("7/7/2026")!, RANGO), "2026-07-07");
  assert.equal(fechaInequivoca(leerFechaForms("14/07/2027")!, RANGO), null);
  assert.equal(leerFechaForms("ayer"), null);
});

const v = (numero: number, viaje: number, cedula: string, nombre: string): ViajeGema => ({
  numero, viaje, conductorCedula: cedula, conductorNombre: nombre,
});

test("conductor: el viaje exacto de GEMA completa el «SIN CONDUCTOR»", () => {
  const r = resolverConductor([v(11, 1, "1", "PEREZ JUAN"), v(12, 2, "1", "PEREZ JUAN")], "2", "CARGUE MTTO BD SIN CONDUCTOR", null);
  assert.deepEqual(r, { origen: "gema_viaje", cedula: "1", nombre: "PEREZ JUAN", despachoNumero: 12, alertas: [] });
});

test("conductor: si el digitado no coincide gana GEMA con alerta", () => {
  const r = resolverConductor([v(11, 1, "1", "PEREZ JUAN")], "1", "GOMEZ PEDRO", null);
  assert.equal(r.cedula, "1");
  assert.deepEqual(r.alertas, ["conductor_distinto"]);
});

test("conductor: sin el número de viaje, un solo conductor ese día", () => {
  const r = resolverConductor([v(11, 1, "1", "PEREZ JUAN")], "3", null, null);
  assert.equal(r.origen, "gema_dia");
  assert.equal(r.despachoNumero, null);
  assert.deepEqual(r.alertas, ["viaje_no_existe"]);
});

test("conductor: varios conductores ese día es ambiguo salvo que el digitado sea uno", () => {
  const dia = [v(11, 1, "1", "PEREZ JUAN"), v(12, 2, "2", "GOMEZ PEDRO")];
  assert.equal(resolverConductor(dia, "C.U", null, null).origen, "ambiguo");
  const r = resolverConductor(dia, "C.U", "Gómez Pedro", null);
  assert.equal(r.origen, "gema_dia");
  assert.equal(r.cedula, "2");
});

test("conductor: sin viajes en GEMA, el maestro o sin cruce", () => {
  assert.equal(resolverConductor([], "1", "PEREZ JUAN", { cedula: "1", nombre: "PEREZ JUAN" }).origen, "formulario");
  const r = resolverConductor([], "1", "CARGUE MTTO BD SIN CONDUCTOR", null);
  assert.equal(r.origen, "sin_cruce");
  assert.equal(r.nombre, null);
});

const vc = (numero: number, codigo: string, viaje: number, caja: number | null) => ({ numero, codigo, viaje, caja });

test("corrección por aforo: el bus estaba mal digitado", () => {
  // Excel: 556 viaje 3, aforo 86; la caja del 556 fue 18 y la del 566 (el conductor digitado) 84.
  const r = corregirPorAforo(86, vc(1, "556", 3, 18), [vc(2, "566", 3, 84)]);
  assert.equal(r?.codigo, "566");
});

test("corrección por aforo: si lo cargado ya cuadra no se toca", () => {
  assert.equal(corregirPorAforo(54, vc(1, "504", 1, 50), [vc(2, "556", 1, 125)]), null);
  assert.equal(corregirPorAforo(139, vc(1, "897", 1, 139), [vc(2, "622", 1, 140)]), null);
});

test("corrección por aforo: viaje sin caja cuenta como lejano", () => {
  assert.equal(corregirPorAforo(51, vc(1, "524", 5, null), [vc(2, "521", 5, 54)])?.codigo, "521");
});

test("corrección por aforo: sin aforo, con dos candidatos cerca o candidato de otro bus y viaje, nada", () => {
  assert.equal(corregirPorAforo(null, vc(1, "556", 3, 18), [vc(2, "566", 3, 84)]), null);
  assert.equal(corregirPorAforo(86, vc(1, "556", 3, 18), [vc(2, "566", 3, 84), vc(3, "556", 2, 88)]), null);
  assert.equal(corregirPorAforo(86, vc(1, "556", 3, 18), [vc(2, "566", 1, 84)]), null);
});

test("corrección por aforo: mismo bus, otro número de viaje", () => {
  assert.equal(corregirPorAforo(100, vc(1, "538", 1, 40), [vc(2, "538", 4, 97)])?.viaje, 4);
});
