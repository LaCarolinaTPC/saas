import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRAMOS_HORA,
  desdeReciente,
  estadoReporte,
  mapearPosicion,
  minutosSinReportar,
  por100km,
  resumirFlota,
  textoTiempo,
  diasEntre,
  eventoSeGuarda,
  kmSospechoso,
  sumarDias,
  tramosKm,
} from "./gps-reglas";

test("eventoSeGuarda: descarta pings y geocerca, guarda el resto (incluidos códigos nuevos)", () => {
  for (const cod of [0, 1, 100, 101]) assert.equal(eventoSeGuarda(cod), false, String(cod));
  for (const cod of [3, 16, 42, 45, 46, 47, 33, 34, 999]) assert.equal(eventoSeGuarda(cod), true, String(cod));
  assert.equal(eventoSeGuarda(null), false);
});

test("kmSospechoso: negativo o más de 600 km en un día", () => {
  assert.equal(kmSospechoso(208.1), false);
  assert.equal(kmSospechoso(0), false);
  assert.equal(kmSospechoso(600), false);
  assert.equal(kmSospechoso(600.1), true);
  assert.equal(kmSospechoso(-3), true);
  assert.equal(kmSospechoso(null), false);
});

test("TRAMOS_HORA cubren el día completo sin solaparse", () => {
  assert.equal(TRAMOS_HORA[0][0], "00:00:00");
  assert.equal(TRAMOS_HORA[TRAMOS_HORA.length - 1][1], "23:59:59");
  for (let i = 1; i < TRAMOS_HORA.length; i++) {
    const fin = TRAMOS_HORA[i - 1][1];
    const ini = TRAMOS_HORA[i][0];
    // El siguiente empieza un segundo después de donde terminó el anterior.
    const seg = (h: string) => h.split(":").reduce((a, x) => a * 60 + Number(x), 0);
    assert.equal(seg(ini) - seg(fin), 1);
  }
});

test("sumarDias y diasEntre cruzan meses y años", () => {
  assert.equal(sumarDias("2026-01-01", -1), "2025-12-31");
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29");
  assert.deepEqual(diasEntre("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(diasEntre("2026-10-02", "2026-10-01"), []);
});

test("desdeReciente: repasa N días o recupera desde el marcador si quedó atrás", () => {
  assert.equal(desdeReciente("2026-10-26", null, 3), "2026-10-24");
  assert.equal(desdeReciente("2026-10-26", "2026-10-26", 3), "2026-10-24");
  assert.equal(desdeReciente("2026-10-26", "2026-10-10", 3), "2026-10-10");
  assert.equal(desdeReciente("2026-10-26", null, 0), "2026-10-26");
});

test("tramosKm: tramos de como mucho 31 días, contiguos y sin pasarse", () => {
  assert.deepEqual(tramosKm("2026-10-20", "2026-10-26"), [{ desde: "2026-10-20", hasta: "2026-10-26" }]);
  const t = tramosKm("2026-01-01", "2026-03-15");
  assert.deepEqual(t, [
    { desde: "2026-01-01", hasta: "2026-01-31" },
    { desde: "2026-02-01", hasta: "2026-03-03" },
    { desde: "2026-03-04", hasta: "2026-03-15" },
  ]);
  for (const x of t) assert.ok(diasEntre(x.desde, x.hasta).length <= 31);
  assert.deepEqual(tramosKm("2026-02-01", "2026-01-01"), []);
});

test("minutosSinReportar y estadoReporte: cuánto lleva callado cada bus", () => {
  const ahora = "2026-10-28 11:30:00";
  assert.equal(minutosSinReportar("2026-10-28 11:29:00", ahora), 1);
  assert.equal(minutosSinReportar("2026-10-27 11:30:00", ahora), 24 * 60);
  assert.equal(minutosSinReportar("basura", ahora), null);
  assert.equal(minutosSinReportar(null, ahora), null);
  // Un reloj de GEMA unos segundos adelante no da negativo.
  assert.equal(minutosSinReportar("2026-10-28 11:31:00", ahora), 0);
  assert.equal(estadoReporte(15), "al_dia");
  assert.equal(estadoReporte(16), "atrasado");
  assert.equal(estadoReporte(120), "atrasado");
  assert.equal(estadoReporte(121), "sin_reportar");
  assert.equal(estadoReporte(24 * 60 + 1), "caido");
  assert.equal(estadoReporte(null), "caido");
});

test("textoTiempo", () => {
  assert.equal(textoTiempo(5), "5 min");
  assert.equal(textoTiempo(190), "3 h 10 min");
  assert.equal(textoTiempo(120), "2 h");
  assert.equal(textoTiempo(24 * 60 * 35), "35 días");
  assert.equal(textoTiempo(24 * 60), "1 día");
});

test("mapearPosicion: normaliza la fila de GEMA", () => {
  const p = mapearPosicion({
    codigo_vehiculo: "618", placa_vehiculo: "WPX036", imei_vehiculo: "1700014110",
    fecha: "2026-10-28", hora: "11:02:16", fecha_hora: "2026-10-28 11:02:16",
    latitud: "10.910182", longitud: "-74.793212", velocidad_kph: 0, rumbo_degrees: 0,
    direccion: " SIN DEFINIR SOLEDAD", evento: null, ultimo_evento_critico: "N/A",
  })!;
  assert.equal(p.codigo_vehiculo, "618");
  assert.equal(p.latitud, 10.910182);
  assert.equal(p.direccion, "SIN DEFINIR SOLEDAD");
  assert.equal(p.evento, null);
  assert.equal(p.ultimo_evento_critico, null);
  assert.equal(mapearPosicion({ codigo_vehiculo: "" }), null);
  assert.equal(mapearPosicion({ codigo_vehiculo: "1", latitud: 0, longitud: 0 })!.latitud, null);
});

test("resumirFlota: estados, en movimiento, detenidos y apagados", () => {
  const ahora = "2026-10-28 11:30:00";
  const base = mapearPosicion({ codigo_vehiculo: "1" })!;
  const r = resumirFlota(
    [
      { ...base, codigo_vehiculo: "1", fecha_hora: "2026-10-28 11:29:00", velocidad_kph: 30 },
      { ...base, codigo_vehiculo: "2", fecha_hora: "2026-10-28 11:25:00", velocidad_kph: 0, ultimo_evento_critico: "APAGADO DEL VEHICULO" },
      { ...base, codigo_vehiculo: "3", fecha_hora: "2026-10-28 10:00:00" },
      { ...base, codigo_vehiculo: "4", fecha_hora: "2026-10-28 05:00:00" },
      { ...base, codigo_vehiculo: "5", fecha_hora: "2026-08-10 11:02:16" },
    ],
    ahora
  );
  assert.deepEqual(r.porEstado, { al_dia: 2, atrasado: 1, sin_reportar: 1, caido: 1 });
  assert.deepEqual([r.total, r.enMovimiento, r.detenidos, r.apagados], [5, 1, 1, 1]);
});

test("por100km", () => {
  assert.equal(por100km(25, 1000), 2.5);
  assert.equal(por100km(1, 0), null);
});
