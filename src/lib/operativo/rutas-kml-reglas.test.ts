import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distanciaM, empalmar, leerCoordenadas, leerKml, procesarKml, simplificar, KML_MAX_PUNTOS, type Coord,
} from "./rutas-kml-reglas";
import {
  actualizarRachas, desvioConfirmado, difAngular, estadoBus, indexarLinea, proyectar, rumbo, viajeActual, type ViajeDespacho,
} from "./rutas-gps-reglas";

/** KML como lo exporta Google My Maps (capa, CDATA, tessellate, altitud 0). */
const kml = (placemarks: string, nombre = "Ruta 12") => `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${nombre}</name>
    <Style id="line-000000-1200"><LineStyle><width>1.2</width></LineStyle></Style>
    <Folder>
      <name>Capa sin nombre</name>
      ${placemarks}
    </Folder>
  </Document>
</kml>`;

const linea = (nombre: string, coords: Coord[]) => `
  <Placemark>
    <name><![CDATA[${nombre}]]></name>
    <styleUrl>#line-000000-1200</styleUrl>
    <LineString>
      <tessellate>1</tessellate>
      <coordinates>
        ${coords.map(([lon, lat]) => `${lon},${lat},0`).join("\n        ")}
      </coordinates>
    </LineString>
  </Placemark>`;

const parada = (nombre: string, [lon, lat]: Coord) =>
  `<Placemark><name>${nombre}</name><Point><coordinates>${lon},${lat},0</coordinates></Point></Placemark>`;

// Bucle de ida y vuelta en Bogotá: ~1,1 km al norte por un carril y regreso.
const IDA: Coord[] = [[-74.08, 4.6], [-74.08, 4.605], [-74.08, 4.61]];
const VUELTA: Coord[] = [[-74.0799, 4.61], [-74.0799, 4.605], [-74.0799, 4.6], [-74.08, 4.6]];
const BUCLE: Coord[] = [...IDA, ...VUELTA];

test("lee coordenadas con altitud, saltos de línea y basura", () => {
  assert.deepEqual(leerCoordenadas(" -74.1,4.6,0\n\t-74.2,4.7  x,y -74.3,4.8 "), [[-74.1, 4.6], [-74.2, 4.7], [-74.3, 4.8]]);
});

test("KML de My Maps: una línea y paradas, nombres con CDATA y entidades", () => {
  const leido = leerKml(kml(linea("Recorrido", BUCLE) + parada("Portal &amp; Calle 80", [-74.08, 4.6]), "Ruta 12 &amp; B"));
  assert.equal(leido.nombreDocumento, "Ruta 12 & B");
  assert.equal(leido.lineas.length, 1);
  assert.equal(leido.lineas[0].nombre, "Recorrido");
  assert.equal(leido.lineas[0].coords.length, BUCLE.length);
  assert.deepEqual(leido.paradas, [{ nombre: "Portal & Calle 80", lon: -74.08, lat: 4.6 }]);
});

test("acepta prefijo de espacio de nombres y MultiGeometry", () => {
  const xml = `<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Document><kml:Placemark><kml:name>X</kml:name>
    <kml:MultiGeometry><kml:LineString><kml:coordinates>-74.08,4.6 -74.08,4.61</kml:coordinates></kml:LineString>
    <kml:LineString><kml:coordinates>-74.08,4.61 -74.08,4.6</kml:coordinates></kml:LineString></kml:MultiGeometry>
    </kml:Placemark></kml:Document></kml:kml>`;
  const r = procesarKml(xml);
  assert.ok(r.ok);
  assert.equal(r.ruta.numPuntos, 3);
  assert.ok(r.ruta.circular);
});

test("ruta de ida y vuelta: longitud, bbox y circular, sin advertencias", () => {
  const r = procesarKml(kml(linea("R", BUCLE)));
  assert.ok(r.ok);
  assert.ok(r.ruta.circular);
  assert.deepEqual(r.ruta.advertencias, []);
  assert.ok(Math.abs(r.ruta.longitudKm - 2.23) < 0.02, `longitud ${r.ruta.longitudKm}`);
  assert.deepEqual(r.ruta.bbox, [-74.08, 4.6, -74.0799, 4.61]);
});

test("varias líneas se empalman en orden, girando las que vienen al revés", () => {
  const r = procesarKml(kml(linea("ida", IDA) + linea("vuelta al revés", VUELTA.slice().reverse())));
  assert.ok(r.ok);
  assert.deepEqual(r.ruta.linea[r.ruta.linea.length - 1], [-74.08, 4.6]);
  assert.ok(r.ruta.circular);
  assert.match(r.ruta.advertencias[0], /2 líneas/);
});

test("avisa de saltos grandes entre líneas", () => {
  const { huecosM } = empalmar([IDA, [[-74.07, 4.61], [-74.07, 4.6]]]);
  assert.ok(huecosM[0] > 1000);
  const r = procesarKml(kml(linea("a", IDA) + linea("b", [[-74.07, 4.61], [-74.07, 4.6]])));
  assert.ok(r.ok);
  assert.ok(r.ruta.advertencias.some((a) => /salto/.test(a)));
});

test("avisa si la línea no vuelve al inicio", () => {
  const r = procesarKml(kml(linea("solo ida", IDA)));
  assert.ok(r.ok);
  assert.equal(r.ruta.circular, false);
  assert.ok(r.ruta.advertencias.some((a) => /ida y vuelta/.test(a)));
});

test("rechaza archivos sin KML, sin línea o con lat/lon invertidas", () => {
  assert.equal(procesarKml("<html></html>").ok, false);
  assert.equal(procesarKml(kml(parada("P", [-74.08, 4.6]))).ok, false);
  const invertida = procesarKml(kml(linea("R", BUCLE.map(([lon, lat]) => [lat, lon] as Coord))));
  assert.equal(invertida.ok, false);
  if (!invertida.ok) assert.match(invertida.error, /invertidas/);
});

test("simplifica líneas enormes sin moverse más de 1 m", () => {
  const densa: Coord[] = [];
  for (let i = 0; i <= KML_MAX_PUNTOS + 1000; i++) densa.push([-74.08, 4.6 + i * 0.000002]);
  densa.push(...densa.slice().reverse());
  const r = procesarKml(kml(linea("densa", densa)));
  assert.ok(r.ok);
  assert.ok(r.ruta.numPuntos < 10, `quedaron ${r.ruta.numPuntos}`);
  assert.ok(r.ruta.advertencias.some((a) => /simplificó/.test(a)));
  const zigzag: Coord[] = [[-74.08, 4.6], [-74.07995, 4.6005], [-74.08, 4.601]];
  assert.equal(simplificar(zigzag, 1).length, 3, "un desvío de ~5 m no se pierde");
});

test("distancia y rumbo", () => {
  assert.ok(Math.abs(distanciaM([-74.08, 4.6], [-74.08, 4.61]) - 1112) < 2);
  assert.ok(difAngular(rumbo([-74.08, 4.6], [-74.08, 4.61]), 0) < 0.1);
  assert.ok(difAngular(rumbo([-74.08, 4.61], [-74.08, 4.6]), 180) < 0.1);
  assert.equal(difAngular(350, 10), 20);
});

// ── Cruce con GPS ──────────────────────────────────────────────────────────
const L = indexarLinea(BUCLE);
// Los dos carriles están a ~11 m (0,0001° de longitud).
const base = { programado: true, enViaje: true, linea: L, toleranciaM: 10, rumbo: null, velocidadKph: null, edadMin: 1 };

test("bus sobre la ida, subiendo: en ruta y con avance de ida", () => {
  const r = estadoBus({ ...base, lat: 4.605, lon: -74.08002, rumbo: 2, velocidadKph: 30 });
  assert.equal(r.estado, "en_ruta");
  assert.ok(r.proyeccion!.distanciaM < 3);
  assert.ok(Math.abs(r.proyeccion!.avanceM - 556) < 5);
});

test("en el carril de la vuelta, bajando: usa el rumbo para ubicarlo en la vuelta", () => {
  // Más cerca de la línea de ida (x = -74.08), pero va hacia el sur.
  const p = proyectar(L, [-74.07996, 4.605], 180, 30);
  assert.equal(p.sentidoOk, true);
  assert.ok(p.avanceM > 1500, `avance ${p.avanceM}`);
});

test("en la ida pero bajando, sin tramo cercano en ese sentido: sentido contrario", () => {
  const solaIda = indexarLinea([[-74.08, 4.6], [-74.08, 4.61], [-74.07, 4.61], [-74.07, 4.6], [-74.08, 4.6]]);
  const r = estadoBus({ ...base, linea: solaIda, lat: 4.605, lon: -74.08, rumbo: 180, velocidadKph: 30 });
  assert.equal(r.estado, "sentido_contrario");
});

test("a 30 m de la línea con tolerancia de 10 m: desviado", () => {
  const r = estadoBus({ ...base, lat: 4.605, lon: -74.08027 });
  assert.equal(r.estado, "desviado");
  assert.ok(Math.abs(r.proyeccion!.distanciaM - 30) < 2);
});

test("detenido: el rumbo no cuenta", () => {
  const r = estadoBus({ ...base, lat: 4.605, lon: -74.08, rumbo: 180, velocidadKph: 0 });
  assert.equal(r.estado, "en_ruta");
  assert.equal(r.proyeccion!.sentidoOk, null);
});

test("estados sin cruce", () => {
  assert.equal(estadoBus({ ...base, lat: null, lon: null }).estado, "sin_posicion");
  assert.equal(estadoBus({ ...base, programado: false, lat: 4.6, lon: -74.08 }).estado, "sin_programacion");
  assert.equal(estadoBus({ ...base, linea: null, lat: 4.6, lon: -74.08 }).estado, "sin_kml");
  assert.equal(estadoBus({ ...base, edadMin: 30, lat: 4.6, lon: -74.08 }).estado, "sin_senal");
});

test("fuera de viaje no se juzga el desvío", () => {
  const r = estadoBus({ ...base, enViaje: false, lat: 4.605, lon: -74.0805 });
  assert.equal(r.estado, "fuera_de_viaje");
});

const fila = (viaje: number, despacho: string, llegada: string, estado: string, prog: string, reprog: string): ViajeDespacho => ({
  viaje, hora_despacho: despacho, hora_llegada: llegada, estado, ruta_programada: prog, ruta_reprogramada: reprog,
});

test("viaje actual: el último despachado antes de ahora, con la ruta reprogramada", () => {
  const filas = [
    fila(1, "06:30:00", "11:02:37", "DESPACHADO", "D - 7", "D - 7"),
    fila(2, "11:24:00", "00:00:00", "DESPACHADO", "D - 7", "A - 16 MIRAMAR - GAVIOTAS"),
    fila(3, "00:00:00", "00:00:00", "POR_DESPACHAR", "D - 7", "D - 7"),
  ];
  assert.deepEqual(viajeActual(filas, "12:00:00"), {
    ruta: "A - 16 MIRAMAR - GAVIOTAS", viaje: 2, horaDespacho: "11:24:00", enViaje: true,
  });
  const antes = viajeActual(filas, "10:00:00");
  assert.equal(antes?.viaje, 1);
  assert.equal(antes?.enViaje, true, "a las 10 todavía no había llegado (llegó 11:02)");
});

test("viaje actual: terminado, no despachado o sin viajes", () => {
  assert.equal(viajeActual([fila(1, "06:30:00", "11:02:37", "DESPACHADO", "X", "X")], "12:00:00")?.enViaje, false);
  assert.equal(viajeActual([fila(1, "04:57:31", "00:00:00", "NO_DESPACHADO", "X", "X")], "12:00:00"), null);
  assert.equal(viajeActual([], "12:00:00"), null);
});

test("el desvío se confirma con 2 lecturas distintas seguidas", () => {
  const b = (estado: "desviado" | "en_ruta", fh: string) => [{ codigo: "523", estado, fechaHora: fh }];
  let r = actualizarRachas({}, b("desviado", "t1"));
  assert.equal(desvioConfirmado(r["523"]), false);
  r = actualizarRachas(r, b("desviado", "t1"));
  assert.equal(desvioConfirmado(r["523"]), false, "la misma lectura releída no cuenta dos veces");
  r = actualizarRachas(r, b("desviado", "t2"));
  assert.equal(desvioConfirmado(r["523"]), true);
  r = actualizarRachas(r, b("en_ruta", "t3"));
  assert.equal(r["523"], undefined, "al volver a la ruta la racha se borra");
});
