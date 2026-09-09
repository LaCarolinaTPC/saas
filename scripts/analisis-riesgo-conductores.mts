/**
 * Análisis predictivo de riesgo por conductor: retiro y novedad posterior.
 *
 * Con el histórico de ausentes (ausentismo_registros, ene–sep 2026), el maestro
 * de conductores, los viajes perdidos, los cierres diarios y la matriz EPS arma
 * un panel conductor × mes y, para cada corte, calcula variables de los 30 y 90
 * días anteriores y dos resultados posteriores:
 *
 *   - retiro60: el conductor sale de la empresa en los 60 días siguientes
 *               (fecha_retiro del maestro).
 *   - novedad30: falta no justificada registrada (incluye "sin contacto") en
 *               los 30 días siguientes. Los viajes perdidos por ausencia del
 *               conductor no sirven como resultado: los tiene el 66% de los
 *               conductores cada mes y no discriminan; sí entran como variable.
 *
 * Entrena una regresión logística por resultado (implementada aquí, sin
 * dependencias), la evalúa con corte temporal (entrena en los meses viejos,
 * prueba en los recientes) y puntúa a los conductores activos a la fecha con
 * sus factores principales. Escribe un informe HTML y un CSV nominal.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.json scripts/analisis-riesgo-conductores.mts
 *   npx tsx --tsconfig tsconfig.json scripts/analisis-riesgo-conductores.mts --salida "<carpeta>" --corte 2026-09-09
 *
 * Solo lee la base (service_role desde .env.local o .env). La salida es
 * nominal: va a exports/ del vault (o a --salida), nunca al repositorio.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

// ── Utilidades ───────────────────────────────────────────────────────────────

function leerEnv(): Record<string, string> {
  const archivo = [".env.local", ".env"].map((n) => path.join(RAIZ, n)).find(existsSync);
  if (!archivo) throw new Error("No hay .env.local ni .env en la raíz del proyecto.");
  const out: Record<string, string> = {};
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    if (!linea || linea.startsWith("#") || !linea.includes("=")) continue;
    const i = linea.indexOf("=");
    out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function todo<T>(db: Db, tabla: string, cols: string, filtro?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = db.from(tabla).select(cols).range(desde, desde + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const DIA = 86_400_000;
const aFecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const aISO = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (iso: string, n: number) => aISO(new Date(aFecha(iso).getTime() + n * DIA));
const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / DIA);
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmtPct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmtNum = (x: number, d = 1) => x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// ── Datos ────────────────────────────────────────────────────────────────────

interface Conductor {
  cedula: string; nombre: string; codigo: string | null; tipo_conductor: string | null; estado: string;
  fecha_ingreso: string | null; fecha_retiro: string | null; fecha_nacimiento: string | null; num_hijos: number | null;
  estado_civil: string | null; nivel_educativo: string | null;
}
interface Registro { cedula: string; fecha: string; tipo: string; soporte: string; contacto: string | null }
interface ViajePerdido { cedula_conductor: string | null; fecha: string; novedad: string | null; tipologia: string | null }
interface Cierre { cedula_conductor: string | null; cod_conductor: string; fecha: string; viajes: number | null; bruto: number | null }
interface Incapacidad { cedula: string; fecha_inicio: string; fecha_fin: string | null; dias_it_pagados: number | null; origen: string | null }

/** Series por conductor, ordenadas por fecha, para ventanas rápidas. */
interface Serie {
  registros: Registro[];
  viajesPerdidos: string[];        // fechas de viajes perdidos por causa del conductor
  cierres: { fecha: string; viajes: number; bruto: number }[];
  incapacidades: Incapacidad[];
}

const enVentana = <T,>(xs: T[], fecha: (x: T) => string, desde: string, hasta: string) =>
  xs.filter((x) => fecha(x) >= desde && fecha(x) < hasta);

// ── Variables ────────────────────────────────────────────────────────────────

/** Variables explicativas, con su etiqueta para el informe. */
const VARIABLES: { key: string; etiqueta: string; grupo: string }[] = [
  { key: "antig_meses", etiqueta: "Antigüedad (meses)", grupo: "Perfil" },
  { key: "antig_menor_6m", etiqueta: "Menos de 6 meses en la empresa", grupo: "Perfil" },
  { key: "edad", etiqueta: "Edad (años)", grupo: "Perfil" },
  { key: "es_relevo", etiqueta: "Es relevo (no fijo)", grupo: "Perfil" },
  { key: "es_afiliado", etiqueta: "Vehículo afiliado (no de empresa)", grupo: "Perfil" },
  { key: "hijos", etiqueta: "Número de hijos", grupo: "Perfil" },
  { key: "aus30", etiqueta: "Ausencias registradas · 30 días", grupo: "Ausentismo" },
  { key: "aus90", etiqueta: "Ausencias registradas · 90 días", grupo: "Ausentismo" },
  { key: "nj30", etiqueta: "No justificadas / sin contacto · 30 días", grupo: "Ausentismo" },
  { key: "nj90", etiqueta: "No justificadas / sin contacto · 90 días", grupo: "Ausentismo" },
  { key: "inc90", etiqueta: "Ausencias por incapacidad · 90 días", grupo: "Ausentismo" },
  { key: "perm90", etiqueta: "Permisos · 90 días", grupo: "Ausentismo" },
  { key: "eps90", etiqueta: "Citas EPS · 90 días", grupo: "Ausentismo" },
  { key: "taller90", etiqueta: "Vehículo en taller · 90 días", grupo: "Ausentismo" },
  { key: "sop_pend90", etiqueta: "Soportes pendientes · 90 días", grupo: "Ausentismo" },
  { key: "reincidente30", etiqueta: "Reincidente (3+ ausencias en 30 días)", grupo: "Ausentismo" },
  { key: "dias_inc_eps90", etiqueta: "Días de incapacidad EPS · 90 días", grupo: "Salud" },
  { key: "vp_cond30", etiqueta: "Viajes perdidos por el conductor · 30 días", grupo: "Operación" },
  { key: "vp_cond90", etiqueta: "Viajes perdidos por el conductor · 90 días", grupo: "Operación" },
  { key: "dias_trab30", etiqueta: "Días con cierre · 30 días", grupo: "Producción" },
  { key: "sin_cierre30", etiqueta: "Sin ningún cierre en 30 días", grupo: "Producción" },
  { key: "viajes_prom30", etiqueta: "Viajes por día · 30 días", grupo: "Producción" },
  { key: "caida_viajes", etiqueta: "Caída de viajes/día frente a los 60 días previos", grupo: "Producción" },
  { key: "bruto_prom30", etiqueta: "Bruto por día · 30 días (miles)", grupo: "Producción" },
];
const KEYS = VARIABLES.map((v) => v.key);
const ETIQUETA = Object.fromEntries(VARIABLES.map((v) => [v.key, v.etiqueta]));

interface Fila {
  cedula: string; nombre: string; corte: string; x: Record<string, number>;
  retiro60: number | null; novedad30: number | null;
}

function variables(c: Conductor, s: Serie, t: string): Record<string, number> {
  const d30 = sumarDias(t, -30), d90 = sumarDias(t, -90);
  const reg30 = enVentana(s.registros, (r) => r.fecha, d30, t);
  const reg90 = enVentana(s.registros, (r) => r.fecha, d90, t);
  const nj = (r: Registro) => r.tipo === "no_justificada";
  const ci30 = enVentana(s.cierres, (x) => x.fecha, d30, t);
  const ci90 = enVentana(s.cierres, (x) => x.fecha, d90, d30);
  const diasTrab30 = new Set(ci30.map((x) => x.fecha)).size;
  const vprom30 = ci30.length ? media(ci30.map((x) => x.viajes)) : 0;
  const vprom60prev = ci90.length ? media(ci90.map((x) => x.viajes)) : 0;
  const caida = vprom60prev > 0 ? Math.max(0, (vprom60prev - vprom30) / vprom60prev) : 0;
  // Días de incapacidad EPS que caen dentro de la ventana de 90 días.
  let diasInc = 0;
  for (const i of s.incapacidades) {
    const fin = i.fecha_fin ?? i.fecha_inicio;
    const a = i.fecha_inicio > d90 ? i.fecha_inicio : d90;
    const b = fin < t ? fin : sumarDias(t, -1);
    if (b >= a) diasInc += diasEntre(a, b) + 1;
  }
  // Racha: 3 o más ausencias en cualquier ventana de 30 días termina en reincidencia.
  const antigMeses = c.fecha_ingreso ? Math.max(0, diasEntre(c.fecha_ingreso, t)) / 30.44 : 0;
  const edad = c.fecha_nacimiento ? diasEntre(c.fecha_nacimiento, t) / 365.25 : 0;
  const tipo = (c.tipo_conductor ?? "").toUpperCase();
  return {
    antig_meses: Math.min(antigMeses, 240),
    antig_menor_6m: antigMeses < 6 ? 1 : 0,
    edad: edad > 15 && edad < 80 ? edad : 0,
    es_relevo: tipo.includes("RELEVO") ? 1 : 0,
    es_afiliado: tipo.includes("AFILIADO") ? 1 : 0,
    hijos: c.num_hijos ?? 0,
    aus30: reg30.length,
    aus90: reg90.length,
    nj30: reg30.filter(nj).length,
    nj90: reg90.filter(nj).length,
    inc90: reg90.filter((r) => r.tipo === "incapacidad").length,
    perm90: reg90.filter((r) => r.tipo === "permiso").length,
    eps90: reg90.filter((r) => r.tipo === "eps").length,
    taller90: reg90.filter((r) => r.tipo === "taller").length,
    sop_pend90: reg90.filter((r) => r.soporte === "pendiente").length,
    reincidente30: reg30.length >= 3 ? 1 : 0,
    dias_inc_eps90: diasInc,
    vp_cond30: enVentana(s.viajesPerdidos, (f) => f, d30, t).length,
    vp_cond90: enVentana(s.viajesPerdidos, (f) => f, d90, t).length,
    dias_trab30: diasTrab30,
    sin_cierre30: diasTrab30 === 0 ? 1 : 0,
    viajes_prom30: vprom30,
    caida_viajes: caida,
    bruto_prom30: ci30.length ? media(ci30.map((x) => x.bruto)) / 1000 : 0,
  };
}

// ── Regresión logística ──────────────────────────────────────────────────────

interface Modelo {
  keys: string[]; mu: number[]; sd: number[]; w: number[]; b: number;
  auc: number; base: number; n: number; nTest: number; positivos: number;
  liftTop10: number; capturaTop20: number; precisionTop10: number;
}

function sigmoide(z: number) { return 1 / (1 + Math.exp(-z)); }

function auc(scores: number[], y: number[]): number {
  const pares = scores.map((s, i) => ({ s, y: y[i] })).sort((a, b) => a.s - b.s);
  let rango = 0, sumaPos = 0, nPos = 0, nNeg = 0;
  for (let i = 0; i < pares.length; ) {
    let j = i;
    while (j < pares.length && pares[j].s === pares[i].s) j++;
    const r = (i + j + 1) / 2; // rango promedio (1-based) de los empates
    for (let k = i; k < j; k++) { if (pares[k].y === 1) { sumaPos += r; nPos++; } else nNeg++; }
    rango = j; i = j;
  }
  void rango;
  if (!nPos || !nNeg) return 0.5;
  return (sumaPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function entrenar(train: Fila[], test: Fila[], objetivo: "retiro60" | "novedad30"): Modelo {
  const keys = KEYS;
  const X = train.map((f) => keys.map((k) => f.x[k]));
  const y = train.map((f) => f[objetivo] as number);
  const mu = keys.map((_, j) => media(X.map((r) => r[j])));
  const sd = keys.map((_, j) => Math.sqrt(media(X.map((r) => (r[j] - mu[j]) ** 2))) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const w = new Array(keys.length).fill(0);
  let b = Math.log((media(y) || 1e-3) / (1 - (media(y) || 1e-3)));
  const lr = 0.05, l2 = 0.02, iter = 1500;
  for (let it = 0; it < iter; it++) {
    const gw = new Array(keys.length).fill(0);
    let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      const p = sigmoide(Z[i].reduce((acc, v, j) => acc + v * w[j], b));
      const e = p - y[i];
      for (let j = 0; j < keys.length; j++) gw[j] += e * Z[i][j];
      gb += e;
    }
    for (let j = 0; j < keys.length; j++) w[j] -= lr * (gw[j] / Z.length + l2 * w[j]);
    b -= lr * (gb / Z.length);
  }
  const puntuar = (f: Fila) => sigmoide(keys.reduce((acc, k, j) => acc + ((f.x[k] - mu[j]) / sd[j]) * w[j], b));
  const scores = test.map(puntuar);
  const yt = test.map((f) => f[objetivo] as number);
  const base = media(yt);
  const orden = scores.map((s, i) => ({ s, y: yt[i] })).sort((a, b) => b.s - a.s);
  const top10 = orden.slice(0, Math.max(1, Math.round(orden.length * 0.1)));
  const top20 = orden.slice(0, Math.max(1, Math.round(orden.length * 0.2)));
  const positivos = yt.reduce((a, v) => a + v, 0);
  return {
    keys, mu, sd, w, b, auc: auc(scores, yt), base, n: train.length, nTest: test.length, positivos,
    precisionTop10: media(top10.map((p) => p.y)),
    liftTop10: base > 0 ? media(top10.map((p) => p.y)) / base : 0,
    capturaTop20: positivos > 0 ? top20.reduce((a, p) => a + p.y, 0) / positivos : 0,
  };
}

function puntuar(m: Modelo, x: Record<string, number>) {
  const contrib = m.keys.map((k, j) => ({ key: k, z: ((x[k] - m.mu[j]) / m.sd[j]) * m.w[j] }));
  const p = sigmoide(contrib.reduce((a, c) => a + c.z, m.b));
  return { p, factores: contrib.filter((c) => c.z > 0.15).sort((a, b) => b.z - a.z).slice(0, 3) };
}

/** Tasa del resultado por tramo de una variable, para las tablas descriptivas. */
function tasaPorTramo(filas: Fila[], key: string, objetivo: "retiro60" | "novedad30", tramos: { etiqueta: string; test: (v: number) => boolean }[]) {
  return tramos.map((t) => {
    const grupo = filas.filter((f) => f[objetivo] != null && t.test(f.x[key]));
    return { etiqueta: t.etiqueta, n: grupo.length, tasa: grupo.length ? media(grupo.map((f) => f[objetivo] as number)) : 0 };
  });
}

// ── Programa ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const valorDe = (b: string) => { const i = args.indexOf(b); return i >= 0 ? args[i + 1] ?? null : null; };
  const hoy = valorDe("--corte") ?? new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const salida = valorDe("--salida") ?? path.resolve(RAIZ, "../../exports");
  mkdirSync(salida, { recursive: true });

  const env = leerEnv();
  const db: Db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(`Corte ${hoy} · salida ${salida}`);

  const [conductores, registros, viajes, cierres, incapacidades] = await Promise.all([
    todo<Conductor>(db, "conductores", "cedula, nombre, codigo, tipo_conductor, estado, fecha_ingreso, fecha_retiro, fecha_nacimiento, num_hijos, estado_civil, nivel_educativo"),
    todo<Registro>(db, "ausentismo_registros", "cedula, fecha, tipo, soporte, contacto"),
    todo<ViajePerdido>(db, "viajes_perdidos", "cedula_conductor, fecha, novedad, tipologia", (q) => q.gte("fecha", "2025-10-01")),
    todo<Cierre>(db, "cierres_diarios", "cedula_conductor, cod_conductor, fecha, viajes, bruto", (q) => q.gte("fecha", "2025-10-01")),
    todo<Incapacidad>(db, "ausentismo", "cedula, fecha_inicio, fecha_fin, dias_it_pagados, origen", (q) => q.is("eliminado_at", null)),
  ]);
  console.log(`conductores ${conductores.length} · registros ${registros.length} · viajes perdidos ${viajes.length} · cierres ${cierres.length} · incapacidades ${incapacidades.length}`);

  // Series por cédula. Los cierres sin cédula se cruzan por código del conductor.
  const porCodigo = new Map(conductores.filter((c) => c.codigo).map((c) => [String(c.codigo).trim(), dig(c.cedula)]));
  const series = new Map<string, Serie>();
  const serie = (ced: string) => { let s = series.get(ced); if (!s) { s = { registros: [], viajesPerdidos: [], cierres: [], incapacidades: [] }; series.set(ced, s); } return s; };
  for (const r of registros) serie(dig(r.cedula)).registros.push(r);
  for (const v of viajes) {
    const esConductor = (v.tipologia ?? "").toUpperCase() === "CONDUCTOR" || /AUSENCIA CONDUCTOR|PERDIDA TURNO/i.test(v.novedad ?? "");
    if (esConductor && v.cedula_conductor) serie(dig(v.cedula_conductor)).viajesPerdidos.push(v.fecha);
  }
  let cierresSinCedula = 0;
  for (const c of cierres) {
    const ced = dig(c.cedula_conductor) || porCodigo.get(String(c.cod_conductor).trim()) || "";
    if (!ced) { cierresSinCedula++; continue; }
    serie(ced).cierres.push({ fecha: c.fecha, viajes: Number(c.viajes ?? 0), bruto: Number(c.bruto ?? 0) });
  }
  for (const i of incapacidades) if (i.fecha_inicio) serie(dig(i.cedula)).incapacidades.push(i);
  for (const s of series.values()) {
    s.registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
    s.viajesPerdidos.sort();
    s.cierres.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  console.log(`cierres sin cédula resoluble: ${cierresSinCedula}`);

  // Retiros con fecha futura son errores de digitación: se ignoran.
  const retiroDe = (c: Conductor) => (c.fecha_retiro && c.fecha_retiro <= hoy ? c.fecha_retiro : null);
  const vacia: Serie = { registros: [], viajesPerdidos: [], cierres: [], incapacidades: [] };

  /** Conductor "en plantilla" a la fecha t: ingresó antes y no se había retirado. */
  const enPlantilla = (c: Conductor, t: string) => {
    if (!c.fecha_ingreso || c.fecha_ingreso > t) return false;
    const r = retiroDe(c);
    return !r || r >= t;
  };

  // Panel: un corte el primer día de cada mes, de marzo a septiembre de 2026.
  const cortes: string[] = [];
  for (let m = 3; m <= 9; m++) cortes.push(`2026-${String(m).padStart(2, "0")}-01`);
  const filas: Fila[] = [];
  for (const t of cortes) {
    for (const c of conductores) {
      if (!enPlantilla(c, t)) continue;
      const s = series.get(dig(c.cedula)) ?? vacia;
      // Solo conductores con alguna huella operativa en los 90 días previos: sin
      // eso el maestro trae gente que ya no opera aunque no tenga fecha de retiro.
      const d90 = sumarDias(t, -90);
      const huella = s.cierres.some((x) => x.fecha >= d90 && x.fecha < t) || s.registros.some((x) => x.fecha >= d90 && x.fecha < t) || s.viajesPerdidos.some((x) => x >= d90 && x < t);
      if (!huella && c.estado !== "ACTIVO") continue;
      const r = retiroDe(c);
      const fin60 = sumarDias(t, 60), fin30 = sumarDias(t, 30);
      const retiro60 = fin60 <= hoy ? (r && r >= t && r < fin60 ? 1 : 0) : null;
      const novedad30 = fin30 <= hoy
        ? (s.registros.some((x) => x.fecha >= t && x.fecha < fin30 && x.tipo === "no_justificada") ? 1 : 0)
        : null;
      filas.push({ cedula: dig(c.cedula), nombre: c.nombre, corte: t, x: variables(c, s, t), retiro60, novedad30 });
    }
  }
  console.log(`panel: ${filas.length} filas conductor-mes en ${cortes.length} cortes`);

  // Entrenamiento con corte temporal: los dos últimos meses evaluables prueban.
  const evaluables = (obj: "retiro60" | "novedad30") => filas.filter((f) => f[obj] != null);
  const dividir = (fs: Fila[]) => {
    const meses = [...new Set(fs.map((f) => f.corte))].sort();
    const prueba = new Set(meses.slice(-2));
    return { train: fs.filter((f) => !prueba.has(f.corte)), test: fs.filter((f) => prueba.has(f.corte)), mesesTest: [...prueba] };
  };
  const dR = dividir(evaluables("retiro60"));
  const dN = dividir(evaluables("novedad30"));
  const mR = entrenar(dR.train, dR.test, "retiro60");
  const mN = entrenar(dN.train, dN.test, "novedad30");
  // Modelo final con todo lo evaluable, para puntuar hoy.
  const fR = entrenar(evaluables("retiro60"), dR.test, "retiro60");
  const fN = entrenar(evaluables("novedad30"), dN.test, "novedad30");
  const resumenModelo = (m: Modelo, d: { mesesTest: string[] }) =>
    `AUC ${m.auc.toFixed(3)} · base ${fmtPct(m.base)} · top 10% precisión ${fmtPct(m.precisionTop10)} (lift ${m.liftTop10.toFixed(1)}x) · top 20% captura ${fmtPct(m.capturaTop20, 0)} · entrena ${m.n} / prueba ${m.nTest} (${d.mesesTest.map((x) => x.slice(0, 7)).join(", ")})`;
  console.log("retiro60:  ", resumenModelo(mR, dR));
  console.log("novedad30: ", resumenModelo(mN, dN));

  // Puntuación de los conductores en plantilla hoy.
  const hoyFilas: Fila[] = conductores
    .filter((c) => enPlantilla(c, hoy) && (c.estado === "ACTIVO" || (series.get(dig(c.cedula))?.cierres.some((x) => x.fecha >= sumarDias(hoy, -30)) ?? false)))
    .map((c) => ({ cedula: dig(c.cedula), nombre: c.nombre, corte: hoy, x: variables(c, series.get(dig(c.cedula)) ?? vacia, hoy), retiro60: null, novedad30: null }));
  const puntuados = hoyFilas.map((f) => {
    const r = puntuar(fR, f.x), n = puntuar(fN, f.x);
    const c = conductores.find((x) => dig(x.cedula) === f.cedula)!;
    return { ...f, codigo: c.codigo, tipo: c.tipo_conductor, pRetiro: r.p, fRetiro: r.factores, pNovedad: n.p, fNovedad: n.factores, riesgo: Math.max(r.p / Math.max(fR.base, 1e-3), n.p / Math.max(fN.base, 1e-3)) };
  }).sort((a, b) => b.pRetiro - a.pRetiro);
  const nivel = (p: number, base: number) => (p >= base * 3 ? "Alto" : p >= base * 1.5 ? "Medio" : "Bajo");

  // Descriptivos por tramo.
  const tramosCount = (max: number) => [
    { etiqueta: "0", test: (v: number) => v === 0 },
    { etiqueta: "1", test: (v: number) => v === 1 },
    { etiqueta: "2", test: (v: number) => v === 2 },
    { etiqueta: `3 o más`, test: (v: number) => v >= 3 && v <= max },
  ];
  const tramosAntig = [
    { etiqueta: "Menos de 3 meses", test: (v: number) => v < 3 },
    { etiqueta: "3 a 6 meses", test: (v: number) => v >= 3 && v < 6 },
    { etiqueta: "6 a 12 meses", test: (v: number) => v >= 6 && v < 12 },
    { etiqueta: "1 a 3 años", test: (v: number) => v >= 12 && v < 36 },
    { etiqueta: "Más de 3 años", test: (v: number) => v >= 36 },
  ];
  const evR = evaluables("retiro60"), evN = evaluables("novedad30");
  const descriptivos = [
    { titulo: "Retiro en 60 días según antigüedad", datos: tasaPorTramo(evR, "antig_meses", "retiro60", tramosAntig) },
    { titulo: "Retiro en 60 días según no justificadas en 90 días", datos: tasaPorTramo(evR, "nj90", "retiro60", tramosCount(999)) },
    { titulo: "Retiro en 60 días según ausencias en 90 días", datos: tasaPorTramo(evR, "aus90", "retiro60", [
      { etiqueta: "0", test: (v) => v === 0 }, { etiqueta: "1 a 2", test: (v) => v >= 1 && v <= 2 }, { etiqueta: "3 a 5", test: (v) => v >= 3 && v <= 5 }, { etiqueta: "6 o más", test: (v) => v >= 6 }]) },
    { titulo: "Retiro en 60 días según viajes perdidos por el conductor en 90 días", datos: tasaPorTramo(evR, "vp_cond90", "retiro60", [
      { etiqueta: "0", test: (v) => v === 0 }, { etiqueta: "1 a 3", test: (v) => v >= 1 && v <= 3 }, { etiqueta: "4 a 10", test: (v) => v >= 4 && v <= 10 }, { etiqueta: "Más de 10", test: (v) => v > 10 }]) },
    { titulo: "Retiro en 60 días según tipo de conductor", datos: [
      ...tasaPorTramo(evR, "es_relevo", "retiro60", [{ etiqueta: "Fijo", test: (v) => v === 0 }, { etiqueta: "Relevo", test: (v) => v === 1 }]),
      ...tasaPorTramo(evR, "es_afiliado", "retiro60", [{ etiqueta: "Empresa", test: (v) => v === 0 }, { etiqueta: "Afiliado", test: (v) => v === 1 }])] },
    { titulo: "Falta no justificada en 30 días según no justificadas en los 30 días previos", datos: tasaPorTramo(evN, "nj30", "novedad30", tramosCount(999)) },
    { titulo: "Falta no justificada en 30 días según reincidencia (3+ ausencias en 30 días)", datos: tasaPorTramo(evN, "reincidente30", "novedad30", [{ etiqueta: "No", test: (v) => v === 0 }, { etiqueta: "Sí", test: (v) => v === 1 }]) },
    { titulo: "Falta no justificada en 30 días según soportes pendientes en 90 días", datos: tasaPorTramo(evN, "sop_pend90", "novedad30", tramosCount(999)) },
    { titulo: "Falta no justificada en 30 días según antigüedad", datos: tasaPorTramo(evN, "antig_meses", "novedad30", tramosAntig) },
  ];

  // Retiros por mes observados vs. población, para el gráfico de contexto.
  const retirosMes = cortes.filter((t) => sumarDias(t, 30) <= hoy).map((t) => {
    const pobl = filas.filter((f) => f.corte === t);
    const fin = sumarDias(t, 30);
    const ret = conductores.filter((c) => { const r = retiroDe(c); return r && r >= t && r < fin; }).length;
    return { mes: t.slice(0, 7), plantilla: pobl.length, retiros: ret, tasa: pobl.length ? ret / pobl.length : 0 };
  });

  // ── Salidas ──
  const csv = [
    ["cedula", "codigo", "nombre", "tipo_conductor", "prob_retiro_60d", "nivel_retiro", "factores_retiro", "prob_no_justificada_30d", "nivel_no_justificada", "factores_no_justificada", ...KEYS].join(";"),
    ...puntuados.map((p) => [
      p.cedula, p.codigo ?? "", `"${p.nombre.replace(/"/g, '""')}"`, p.tipo ?? "", (p.pRetiro * 100).toFixed(1).replace(".", ","), nivel(p.pRetiro, fR.base),
      `"${p.fRetiro.map((f) => ETIQUETA[f.key]).join(" · ")}"`, (p.pNovedad * 100).toFixed(1).replace(".", ","), nivel(p.pNovedad, fN.base),
      `"${p.fNovedad.map((f) => ETIQUETA[f.key]).join(" · ")}"`, ...KEYS.map((k) => String(Math.round(p.x[k] * 100) / 100).replace(".", ",")),
    ].join(";")),
  ].join("\r\n");
  writeFileSync(path.join(salida, `riesgo-conductores-${hoy}.csv`), "﻿" + csv + "\r\n", "utf8");

  const html = informeHtml({ hoy, mR, mN, fR, fN, dR, dN, puntuados, nivel, descriptivos, retirosMes, filas, conductores: hoyFilas.length });
  const rutaHtml = path.join(salida, `analisis-predictivo-ausentismo-conductores-${hoy}.html`);
  writeFileSync(rutaHtml, html, "utf8");
  console.log(`Informe: ${rutaHtml}`);
  console.log(`CSV:     ${path.join(salida, `riesgo-conductores-${hoy}.csv`)}`);
  console.log(`Conductores puntuados: ${puntuados.length} · retiro Alto ${puntuados.filter((p) => nivel(p.pRetiro, fR.base) === "Alto").length} · novedad Alto ${puntuados.filter((p) => nivel(p.pNovedad, fN.base) === "Alto").length}`);
}

// ── Informe HTML ─────────────────────────────────────────────────────────────

type Puntuado = Fila & { codigo: string | null; tipo: string | null; pRetiro: number; fRetiro: { key: string; z: number }[]; pNovedad: number; fNovedad: { key: string; z: number }[]; riesgo: number };

function informeHtml(p: {
  hoy: string; mR: Modelo; mN: Modelo; fR: Modelo; fN: Modelo;
  dR: { mesesTest: string[] }; dN: { mesesTest: string[] };
  puntuados: Puntuado[]; nivel: (p: number, base: number) => string;
  descriptivos: { titulo: string; datos: { etiqueta: string; n: number; tasa: number }[] }[];
  retirosMes: { mes: string; plantilla: number; retiros: number; tasa: number }[];
  filas: Fila[]; conductores: number;
}): string {
  const { hoy, mR, mN, fR, fN, puntuados, nivel, descriptivos, retirosMes } = p;
  const coefs = (m: Modelo) => m.keys.map((k, j) => ({ key: k, w: m.w[j] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const colorNivel: Record<string, string> = { Alto: "#DC2626", Medio: "#D97706", Bajo: "#059669" };
  const chip = (n: string) => `<span class="chip" style="background:${colorNivel[n]}1a;color:${colorNivel[n]}">${n}</span>`;
  const topRetiro = puntuados.filter((x) => nivel(x.pRetiro, fR.base) !== "Bajo").slice(0, 40);
  const topNovedad = [...puntuados].sort((a, b) => b.pNovedad - a.pNovedad).filter((x) => nivel(x.pNovedad, fN.base) !== "Bajo").slice(0, 40);
  const altoR = puntuados.filter((x) => nivel(x.pRetiro, fR.base) === "Alto").length;
  const medioR = puntuados.filter((x) => nivel(x.pRetiro, fR.base) === "Medio").length;
  const altoN = puntuados.filter((x) => nivel(x.pNovedad, fN.base) === "Alto").length;
  const medioN = puntuados.filter((x) => nivel(x.pNovedad, fN.base) === "Medio").length;

  const tablaCoef = (m: Modelo) => `
    <table><thead><tr><th>Variable</th><th class="r">Peso estandarizado</th><th>Lectura</th></tr></thead><tbody>
    ${coefs(m).slice(0, 12).map((c) => `<tr><td>${esc(ETIQUETA[c.key])}</td><td class="r ${c.w > 0 ? "mal" : "bien"}">${c.w > 0 ? "+" : ""}${c.w.toFixed(2)}</td><td>${c.w > 0 ? "A más valor, más riesgo" : "A más valor, menos riesgo"}</td></tr>`).join("")}
    </tbody></table>`;
  const tablaTramos = (d: { titulo: string; datos: { etiqueta: string; n: number; tasa: number }[] }) => `
    <div class="card"><h3>${esc(d.titulo)}</h3><table><thead><tr><th>Tramo</th><th class="r">Conductor-mes</th><th class="r">Tasa</th><th>Barra</th></tr></thead><tbody>
    ${d.datos.map((x) => `<tr><td>${esc(x.etiqueta)}</td><td class="r">${fmtNum(x.n, 0)}</td><td class="r">${fmtPct(x.tasa)}</td><td><div class="bar" style="width:${Math.min(100, x.tasa * 400).toFixed(0)}%"></div></td></tr>`).join("")}
    </tbody></table></div>`;
  const tablaRiesgo = (lista: Puntuado[], obj: "retiro" | "novedad") => `
    <table><thead><tr><th>#</th><th>Conductor</th><th>Tipo</th><th class="r">Probabilidad</th><th>Nivel</th><th>Factores que pesan</th><th class="r">Aus. 90d</th><th class="r">No just. 90d</th><th class="r">Viajes perdidos 90d</th><th class="r">Antig. (meses)</th></tr></thead><tbody>
    ${lista.map((x, i) => {
      const pr = obj === "retiro" ? x.pRetiro : x.pNovedad;
      const base = obj === "retiro" ? fR.base : fN.base;
      const fac = obj === "retiro" ? x.fRetiro : x.fNovedad;
      return `<tr><td>${i + 1}</td><td><strong>${esc(x.nombre)}</strong><br><span class="muted">${x.codigo ? `${esc(x.codigo)} · ` : ""}CC ${esc(x.cedula)}</span></td><td class="muted">${esc(x.tipo ?? "")}</td><td class="r"><strong>${fmtPct(pr)}</strong></td><td>${chip(nivel(pr, base))}</td><td class="muted">${fac.map((f) => esc(ETIQUETA[f.key])).join(" · ") || "—"}</td><td class="r">${x.x.aus90}</td><td class="r">${x.x.nj90}</td><td class="r">${x.x.vp_cond90}</td><td class="r">${fmtNum(x.x.antig_meses, 0)}</td></tr>`;
    }).join("")}
    </tbody></table>`;

  const hallazgos: string[] = [];
  const antigR = descriptivos[0].datos;
  if (antigR[0].tasa > antigR[antigR.length - 1].tasa * 1.5) hallazgos.push(`Los conductores con menos de 3 meses se retiran a una tasa de ${fmtPct(antigR[0].tasa)} en 60 días, frente a ${fmtPct(antigR[antigR.length - 1].tasa)} entre quienes llevan más de 3 años: la antigüedad es el primer factor de retención.`);
  const njR = descriptivos[1].datos;
  if (njR[3].n > 0 && njR[3].tasa > njR[0].tasa) hallazgos.push(`Con 3 o más faltas no justificadas en 90 días, la probabilidad de retiro en 60 días sube de ${fmtPct(njR[0].tasa)} a ${fmtPct(njR[3].tasa)}.`);
  const vpR = descriptivos[3].datos;
  if (vpR[3].n > 0 && vpR[3].tasa > vpR[0].tasa) hallazgos.push(`Más de 10 viajes perdidos por causa del conductor en 90 días multiplica el retiro: ${fmtPct(vpR[3].tasa)} frente a ${fmtPct(vpR[0].tasa)} sin viajes perdidos.`);
  const njN = descriptivos[5].datos;
  if (njN[1].tasa > njN[0].tasa) hallazgos.push(`Una sola falta no justificada en el último mes eleva la probabilidad de volver a faltar sin justificación en los 30 días siguientes de ${fmtPct(njN[0].tasa)} a ${fmtPct(njN[1].tasa)}${njN[3].n ? `; con 3 o más, ${fmtPct(njN[3].tasa)}` : ""}.`);
  const reinc = descriptivos[6].datos;
  if (reinc[1].n > 0) hallazgos.push(`Los reincidentes (3+ ausencias en 30 días) tienen ${fmtPct(reinc[1].tasa)} de probabilidad de una falta no justificada en el mes siguiente, frente a ${fmtPct(reinc[0].tasa)} del resto.`);
  hallazgos.push(`El modelo de retiro ordena bien el riesgo (AUC ${mR.auc.toFixed(2)} en meses no vistos): el 10% de conductores con mayor puntaje concentra ${mR.liftTop10.toFixed(1)} veces la tasa de retiro promedio y el 20% superior captura ${fmtPct(mR.capturaTop20, 0)} de los retiros.`);
  hallazgos.push(`El modelo de falta no justificada alcanza AUC ${mN.auc.toFixed(2)} en meses no vistos: el 10% con mayor puntaje tuvo ${fmtPct(mN.precisionTop10)} de faltas reales, ${mN.liftTop10.toFixed(1)} veces la tasa base.`);
  hallazgos.push(`Hoy hay ${altoR} conductores en riesgo alto de retiro y ${medioR} en riesgo medio; ${altoN} en riesgo alto de falta no justificada y ${medioN} en medio, sobre ${puntuados.length} en plantilla.`);

  const grafRetiros = JSON.stringify({ labels: retirosMes.map((r) => r.mes), retiros: retirosMes.map((r) => r.retiros), tasa: retirosMes.map((r) => +(r.tasa * 100).toFixed(1)) });
  const grafCoefR = JSON.stringify({ labels: coefs(fR).slice(0, 10).map((c) => ETIQUETA[c.key]), w: coefs(fR).slice(0, 10).map((c) => +c.w.toFixed(3)) });
  const grafCoefN = JSON.stringify({ labels: coefs(fN).slice(0, 10).map((c) => ETIQUETA[c.key]), w: coefs(fN).slice(0, 10).map((c) => +c.w.toFixed(3)) });

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Análisis predictivo de ausentismo y retiro de conductores · ${hoy}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{--ink:#1F2937;--muted:#64748B;--line:#E2E8F0;--bg:#F8FAFC;--brand:#4F46E5}
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;color:var(--ink);background:var(--bg);font-size:14px;line-height:1.45}
header{background:#111827;color:#fff;padding:28px 32px}header h1{margin:0 0 6px;font-size:22px}header p{margin:0;color:#CBD5E1}
main{max-width:1280px;margin:0 auto;padding:24px 32px 48px}
h2{font-size:18px;margin:32px 0 12px;border-left:4px solid var(--brand);padding-left:10px}h3{font-size:14px;margin:0 0 10px;color:var(--ink)}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(auto-fit,minmax(380px,1fr))}.g4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
.kpi .v{font-size:28px;font-weight:700}.kpi .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 8px;border-bottom:1px solid #F1F5F9;text-align:left;vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}td.r,th.r{text-align:right}
.muted{color:var(--muted);font-size:12px}.chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}
.bar{height:10px;background:var(--brand);border-radius:4px;min-width:2px}.mal{color:#DC2626;font-weight:600}.bien{color:#059669;font-weight:600}
ul.hallazgos li{margin:6px 0}.nota{background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 14px;color:#92400E;font-size:13px}
canvas{max-height:280px}
</style></head><body>
<header><h1>Análisis predictivo de ausentismo y retiro de conductores</h1>
<p>La Carolina De Transporte · Recursos Humanos · corte ${hoy} · histórico enero–septiembre 2026 · ${fmtNum(p.filas.length, 0)} observaciones conductor-mes</p></header>
<main>
<section class="grid g4">
  <div class="card kpi"><div class="v">${puntuados.length}</div><div class="l">Conductores en plantilla hoy</div></div>
  <div class="card kpi"><div class="v" style="color:#DC2626">${altoR}</div><div class="l">Riesgo alto de retiro (60 días)</div><div class="muted">${medioR} en riesgo medio</div></div>
  <div class="card kpi"><div class="v" style="color:#D97706">${altoN}</div><div class="l">Riesgo alto de falta no justificada (30 días)</div><div class="muted">${medioN} en riesgo medio</div></div>
  <div class="card kpi"><div class="v">${fmtPct(fR.base)}</div><div class="l">Tasa base de retiro en 60 días</div><div class="muted">${fmtPct(fN.base)} tasa base de falta no justificada en 30 días</div></div>
</section>

<h2>Hallazgos</h2>
<div class="card"><ul class="hallazgos">${hallazgos.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>

<h2>Qué mueve el riesgo</h2>
<div class="grid g2">
  <div class="card"><h3>Retiro en 60 días · peso de cada variable</h3><canvas id="coefR"></canvas>${tablaCoef(fR)}</div>
  <div class="card"><h3>Falta no justificada en 30 días · peso de cada variable</h3><canvas id="coefN"></canvas>${tablaCoef(fN)}</div>
</div>
<p class="muted" style="margin-top:8px">Peso estandarizado: cuánto cambia el logaritmo de la probabilidad cuando la variable sube una desviación estándar, con las demás fijas. Positivo empuja el riesgo; negativo protege.</p>

<h2>Tasas observadas por tramo</h2>
<div class="grid g2">${descriptivos.map(tablaTramos).join("")}</div>

<h2>Retiros observados por mes</h2>
<div class="card"><canvas id="retiros"></canvas>
<table><thead><tr><th>Mes</th><th class="r">Conductores en plantilla</th><th class="r">Retiros en el mes</th><th class="r">Tasa mensual</th></tr></thead><tbody>
${retirosMes.map((r) => `<tr><td>${r.mes}</td><td class="r">${r.plantilla}</td><td class="r">${r.retiros}</td><td class="r">${fmtPct(r.tasa)}</td></tr>`).join("")}
</tbody></table></div>

<h2>Conductores con mayor riesgo de retiro (60 días)</h2>
<div class="card">${topRetiro.length ? tablaRiesgo(topRetiro, "retiro") : '<p class="muted">Ningún conductor por encima del riesgo bajo.</p>'}</div>

<h2>Conductores con mayor riesgo de falta no justificada (30 días)</h2>
<div class="card">${topNovedad.length ? tablaRiesgo(topNovedad, "novedad") : '<p class="muted">Ningún conductor por encima del riesgo bajo.</p>'}</div>

<h2>Cómo leer y usar este análisis</h2>
<div class="card">
<ul>
<li><strong>Riesgo alto</strong> = probabilidad de al menos 3 veces la tasa base; <strong>medio</strong> = entre 1,5 y 3 veces. No es una sentencia: es una lista de prioridad para conversar con el conductor, revisar su asignación o su vehículo antes de que la novedad ocurra.</li>
<li><strong>Retiro:</strong> ${esc(`AUC ${mR.auc.toFixed(3)} en los meses de prueba (${p.dR.mesesTest.map((x) => x.slice(0, 7)).join(", ")}) con ${mR.nTest} conductor-mes y ${mR.positivos} retiros; el 10% de mayor puntaje tuvo ${fmtPct(mR.precisionTop10)} de retiro real.`)}</li>
<li><strong>Falta no justificada:</strong> ${esc(`AUC ${mN.auc.toFixed(3)} en (${p.dN.mesesTest.map((x) => x.slice(0, 7)).join(", ")}) con ${mN.nTest} conductor-mes y ${mN.positivos} faltas; el 10% de mayor puntaje tuvo ${fmtPct(mN.precisionTop10)} de falta real. Incluye las registradas como "sin contacto".`)}</li>
<li>Fuentes: registro diario de ausentes (histórico migrado y módulo), maestro de conductores, viajes perdidos por causa del conductor, cierres diarios y matriz EPS. Los cierres sin cédula se cruzaron por código de conductor.</li>
<li>Limitaciones: nueve meses de histórico, retiros con fecha del maestro (no distingue renuncia de despido), y variables sociodemográficas incompletas (estado civil y nivel educativo "sin definir" en la mitad del maestro, por eso no entran al modelo). Regenerar cada mes con <code>npm run riesgo:conductores</code>.</li>
</ul>
<p class="nota">Este informe contiene datos personales de trabajadores. Úselo dentro de RRHH y Gerencia; no lo reenvíe por correo ni lo suba a la wiki.</p>
</div>
</main>
<script>
const barras=(id,d,color)=>new Chart(document.getElementById(id),{type:'bar',data:{labels:d.labels,datasets:[{data:d.w,backgroundColor:d.w.map(w=>w>0?'#DC2626':'#059669')}]},options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:'#F1F5F9'}},y:{ticks:{font:{size:11}}}}}});
barras('coefR',${grafCoefR});barras('coefN',${grafCoefN});
const r=${grafRetiros};new Chart(document.getElementById('retiros'),{data:{labels:r.labels,datasets:[{type:'bar',label:'Retiros',data:r.retiros,backgroundColor:'#4F46E5',yAxisID:'y'},{type:'line',label:'Tasa mensual %',data:r.tasa,borderColor:'#DC2626',backgroundColor:'#DC2626',yAxisID:'y1'}]},options:{scales:{y:{position:'left',grid:{color:'#F1F5F9'}},y1:{position:'right',grid:{display:false},ticks:{callback:v=>v+'%'}}}}});
</script>
</body></html>`;
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
