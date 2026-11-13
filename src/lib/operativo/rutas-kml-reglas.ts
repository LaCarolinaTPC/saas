/**
 * Operativo › Rutas: lectura del KML de Google My Maps / Google Earth.
 * Lógica pura (sin base de datos ni UI), compartida por servidor y cliente.
 *
 * Convención acordada con Operativo:
 *   - Un archivo = una ruta.
 *   - El recorrido es UNA sola línea que va y vuelve (no se separa ida y
 *     vuelta). Si el KML trae varias líneas (My Maps parte a veces el trazo),
 *     se empalman en el orden del documento, girando cada tramo si así queda
 *     más cerca del anterior, y se avisa.
 *   - Los puntos (Placemark con Point) son paradas.
 *
 * No se usa un parser XML: el KML de Google es regular (Placemark → name →
 * LineString/Point → coordinates) y así no se agrega ninguna dependencia.
 * KMZ (zip) se abre en `rutas-kml.ts` con jszip antes de llegar aquí.
 */

/** [lon, lat], el orden del KML y de GeoJSON. */
export type Coord = [number, number];

export interface ParadaKml {
  nombre: string;
  lon: number;
  lat: number;
}

export interface LineaKml {
  nombre: string;
  coords: Coord[];
}

export interface KmlLeido {
  nombreDocumento: string | null;
  lineas: LineaKml[];
  paradas: ParadaKml[];
  /** Geometrías que no se usan (polígonos, tracks…), para avisar. */
  ignoradas: number;
}

export interface RutaProcesada {
  nombreDocumento: string | null;
  linea: Coord[];
  paradas: ParadaKml[];
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
  longitudKm: number;
  numPuntos: number;
  circular: boolean;
  advertencias: string[];
}

export type ResultadoKml = { ok: true; ruta: RutaProcesada } | { ok: false; error: string };

/** Tamaño máximo del archivo subido (KML o KMZ). */
export const KML_MAX_BYTES = 5 * 1024 * 1024;
/** Por encima de esto se simplifica la línea (sin perder precisión útil). */
export const KML_MAX_PUNTOS = 5000;
/** Tolerancia de la simplificación: muy por debajo de la tolerancia de ruta (10 m). */
export const SIMPLIFICAR_M = 1;
/** Hasta dónde se considera que la línea "cierra" en su inicio. */
export const CIERRE_CIRCULAR_M = 100;
/** Hueco máximo al empalmar tramos antes de avisar. */
export const HUECO_EMPALME_M = 50;
/** Tolerancia por defecto para "en ruta" (decisión de Operativo). */
export const TOLERANCIA_DEFECTO_M = 10;

/** Caja amplia de Colombia: atrapa lat/lon invertidos y coordenadas basura. */
const COLOMBIA = { minLon: -82, maxLon: -66.8, minLat: -4.3, maxLat: 13.5 };

// ── XML mínimo ───────────────────────────────────────────────────────────────

/** Etiqueta con prefijo de espacio de nombres opcional (`kml:`, `gx:`…). */
const tag = (nombre: string) => `(?:[\\w-]+:)?${nombre}`;

function bloques(xml: string, nombre: string): string[] {
  const re = new RegExp(`<${tag(nombre)}\\b[^>]*>([\\s\\S]*?)</${tag(nombre)}>`, "g");
  const out: string[] = [];
  for (const m of xml.matchAll(re)) out.push(m[1]);
  return out;
}

function decodificar(texto: string): string {
  const cdata = texto.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const t = cdata ? cdata[1] : texto;
  return t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

/** Primer <name> del bloque que no esté dentro de una geometría o subcarpeta. */
function nombreDe(bloque: string): string {
  const limpio = bloque.replace(new RegExp(`<${tag("(?:Folder|Placemark|Style|StyleMap)")}\\b[\\s\\S]*$`), "");
  const m = limpio.match(new RegExp(`<${tag("name")}\\b[^>]*>([\\s\\S]*?)</${tag("name")}>`));
  return m ? decodificar(m[1]) : "";
}

/** "lon,lat[,alt] lon,lat[,alt] …" → coordenadas válidas. */
export function leerCoordenadas(texto: string): Coord[] {
  const out: Coord[] = [];
  for (const tupla of decodificar(texto).split(/\s+/)) {
    if (!tupla) continue;
    const [lon, lat] = tupla.split(",").map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) out.push([lon, lat]);
  }
  return out;
}

/** Lee líneas y paradas de un KML (texto). No valida; ver `procesarKml`. */
export function leerKml(xml: string): KmlLeido {
  const sinComentarios = xml.replace(/<!--[\s\S]*?-->/g, "");
  const documento = bloques(sinComentarios, "Document")[0] ?? sinComentarios;
  const nombreDocumento = nombreDe(documento) || null;
  const lineas: LineaKml[] = [];
  const paradas: ParadaKml[] = [];
  let ignoradas = 0;

  for (const pm of bloques(sinComentarios, "Placemark")) {
    const nombre = nombreDe(pm);
    for (const ls of bloques(pm, "LineString")) {
      const coords = bloques(ls, "coordinates").flatMap(leerCoordenadas);
      if (coords.length) lineas.push({ nombre, coords });
    }
    for (const pt of bloques(pm, "Point")) {
      const [c] = bloques(pt, "coordinates").flatMap(leerCoordenadas);
      if (c) paradas.push({ nombre, lon: c[0], lat: c[1] });
    }
    ignoradas += bloques(pm, "Polygon").length + bloques(pm, "Track").length;
  }
  return { nombreDocumento, lineas, paradas, ignoradas };
}

// ── Geometría ───────────────────────────────────────────────────────────────

const R_TIERRA_M = 6371008.8;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en metros entre dos coordenadas (haversine). */
export function distanciaM(a: Coord, b: Coord): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function longitudM(linea: Coord[]): number {
  let total = 0;
  for (let i = 1; i < linea.length; i++) total += distanciaM(linea[i - 1], linea[i]);
  return total;
}

export function bboxDe(coords: Coord[]): [number, number, number, number] {
  let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

/** Quita puntos repetidos consecutivos (My Maps los deja al empalmar). */
export function sinDuplicados(linea: Coord[]): Coord[] {
  return linea.filter((c, i) => i === 0 || c[0] !== linea[i - 1][0] || c[1] !== linea[i - 1][1]);
}

/**
 * Proyección local en metros alrededor de una latitud de referencia. A la
 * escala de una ruta urbana el error es despreciable frente a 10 m.
 */
export function proyector(latRef: number) {
  const kx = (Math.PI / 180) * R_TIERRA_M * Math.cos(rad(latRef));
  const ky = (Math.PI / 180) * R_TIERRA_M;
  return (c: Coord): [number, number] => [c[0] * kx, c[1] * ky];
}

/** Douglas-Peucker iterativo, tolerancia en metros. Conserva extremos. */
export function simplificar(linea: Coord[], toleranciaM: number): Coord[] {
  if (linea.length <= 2) return linea.slice();
  const p = proyector(linea[0][1]);
  const xy = linea.map(p);
  const guardar = new Uint8Array(linea.length);
  guardar[0] = guardar[linea.length - 1] = 1;
  const pila: [number, number][] = [[0, linea.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distPuntoSegmento(xy[k], xy[i], xy[j]).d;
      if (d > maxD) [maxD, idx] = [d, k];
    }
    if (idx >= 0 && maxD > toleranciaM) {
      guardar[idx] = 1;
      pila.push([i, idx], [idx, j]);
    }
  }
  return linea.filter((_, k) => guardar[k]);
}

/** Distancia de P al segmento AB en el plano y fracción t ∈ [0,1] del pie. */
export function distPuntoSegmento(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): { d: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

/**
 * Empalma varios tramos en una sola línea, en el orden del documento. Cada
 * tramo se gira si su final queda más cerca del final acumulado que su inicio.
 */
export function empalmar(tramos: Coord[][]): { linea: Coord[]; huecosM: number[] } {
  const linea: Coord[] = [];
  const huecosM: number[] = [];
  for (const tramo of tramos) {
    if (!tramo.length) continue;
    if (!linea.length) {
      linea.push(...tramo);
      continue;
    }
    const fin = linea[linea.length - 1];
    const directo = distanciaM(fin, tramo[0]);
    const girado = distanciaM(fin, tramo[tramo.length - 1]);
    const t = girado < directo ? tramo.slice().reverse() : tramo;
    huecosM.push(Math.min(directo, girado));
    linea.push(...t);
  }
  return { linea, huecosM };
}

const enColombia = ([lon, lat]: Coord) =>
  lon >= COLOMBIA.minLon && lon <= COLOMBIA.maxLon && lat >= COLOMBIA.minLat && lat <= COLOMBIA.maxLat;

// ── Validación completa ─────────────────────────────────────────────────────

/** Lee, valida y deja lista para guardar la ruta de un KML. */
export function procesarKml(xml: string): ResultadoKml {
  if (!/<(?:[\w-]+:)?kml\b/i.test(xml)) return { ok: false, error: "El archivo no es un KML." };
  const leido = leerKml(xml);
  if (!leido.lineas.length) {
    return { ok: false, error: "El KML no trae ninguna línea (LineString). Dibuje el recorrido como línea en My Maps." };
  }
  const advertencias: string[] = [];

  const { linea: empalmada, huecosM } = empalmar(leido.lineas.map((l) => l.coords));
  if (leido.lineas.length > 1) {
    advertencias.push(`El KML trae ${leido.lineas.length} líneas; se unieron en una sola en el orden del archivo.`);
    const grandes = huecosM.filter((h) => h > HUECO_EMPALME_M);
    if (grandes.length) {
      advertencias.push(
        `Hay ${grandes.length} salto(s) de más de ${HUECO_EMPALME_M} m entre líneas (máx. ${Math.round(Math.max(...grandes))} m). Revise el trazado en la vista previa.`
      );
    }
  }

  let linea = sinDuplicados(empalmada);
  if (linea.length < 2) return { ok: false, error: "La línea del recorrido tiene menos de dos puntos." };

  const fuera = linea.filter((c) => !enColombia(c)).length;
  if (fuera) {
    return {
      ok: false,
      error: `${fuera} punto(s) de la línea quedan fuera de Colombia. ¿Están invertidas latitud y longitud?`,
    };
  }

  if (linea.length > KML_MAX_PUNTOS) {
    const antes = linea.length;
    linea = simplificar(linea, SIMPLIFICAR_M);
    advertencias.push(`La línea traía ${antes} puntos; se simplificó a ${linea.length} (precisión ${SIMPLIFICAR_M} m).`);
  }

  const paradas = leido.paradas.filter((p) => enColombia([p.lon, p.lat]));
  if (paradas.length < leido.paradas.length) {
    advertencias.push(`${leido.paradas.length - paradas.length} parada(s) fuera de Colombia se descartaron.`);
  }
  if (leido.ignoradas) advertencias.push(`${leido.ignoradas} polígono(s) o track(s) se ignoraron.`);

  const longitudKm = Math.round(longitudM(linea)) / 1000;
  const circular = distanciaM(linea[0], linea[linea.length - 1]) <= CIERRE_CIRCULAR_M;
  if (!circular) {
    advertencias.push("La línea no termina donde empieza: se esperaba un recorrido de ida y vuelta.");
  }

  return {
    ok: true,
    ruta: {
      nombreDocumento: leido.nombreDocumento,
      linea,
      paradas,
      bbox: bboxDe(linea),
      longitudKm,
      numPuntos: linea.length,
      circular,
      advertencias,
    },
  };
}
