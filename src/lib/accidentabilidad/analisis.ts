// Accidentabilidad — Análisis (descriptivo, prescriptivo y KPIs)
// =============================================================================
// Parte PURA (sin base de datos): agregaciones, KPIs y reglas prescriptivas que
// se prueban en `analisis.test.ts`. El loader `getAccidentesAnalisis` (al final)
// es la única parte con E/S.
//
// Decisiones del dueño (2026-10-22):
//   1. El análisis combina reportes de Gestivo + histórico de la matriz GO-R-22.
//   2. La responsabilidad usa el DICTAMEN (accidente_evaluaciones.responsabilidad)
//      y cae a la REPORTADA (responsabilidad_reportada) cuando no hay dictamen.
//   3. Costo de reparación y monto del arreglo se tratan por SEPARADO.

import { createAdminClient } from "@/lib/supabase/admin";
import type { ClaseAccidente } from "./formato";
import { FACTORES_POLITICA } from "./formato";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type OrigenFiltro = "gestivo" | "historico" | "ambos";
export type Responsabilidad = "directo" | "compartido" | "tercero" | "en_estudio";

/** Filtros de segmentación; los comparte Consultar y Análisis vía URL. */
export interface FiltrosAccidente {
  desde?: string; // ISO date inclusive
  hasta?: string; // ISO date inclusive
  origen?: OrigenFiltro;
  clase?: ClaseAccidente;
  responsabilidad?: Responsabilidad;
  factor?: string; // política (exceso_velocidad…) o código de catálogo
  ruta?: string;
  tenencia?: "empresa" | "afiliado";
  caso?: "abierto" | "cerrado";
  aseguradora?: string;
  conductor?: string; // texto libre: cédula, nombre o código
  tieneIpat?: boolean;
  /** Estado del flujo de revisión (solo aplica a reportes de Gestivo). */
  estado?: string;
}

export interface FactoresPolitica {
  exceso_velocidad: boolean;
  uso_celular: boolean;
  no_distancia: boolean;
  fatiga: boolean;
}

/** Fila normalizada que consumen las funciones puras. */
export interface FilaAccidente {
  id: string;
  consecutivo: number;
  fecha: string; // ISO con hora
  origen: "gestivo" | "historico";
  conductorCedula: string | null;
  conductorNombre: string;
  direccion: string;
  vehiculoCodigo: string | null;
  vehiculoPlaca: string | null;
  vehiculoRuta: string | null;
  tenencia: "empresa" | "afiliado" | null;
  clase: ClaseAccidente | null;
  /** Responsabilidad efectiva: dictamen y, si no hay, la reportada. */
  responsabilidad: Responsabilidad | null;
  factores: string[];
  factoresPolitica: FactoresPolitica;
  velocidad: number | null;
  costoReparacion: number | null;
  arregloMonto: number | null;
  casoEstado: string | null;
  estado: string;
  tieneIpat: boolean | null;
  aseguradora: string | null;
}

// ── Utilidades ────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
/** minúsculas sin tildes, para búsquedas de texto tolerantes. */
const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const pct = (parte: number, total: number) => (total > 0 ? round2((parte / total) * 100) : 0);

/** YYYY-MM de la fecha (en horario local de Colombia, que es como se guarda). */
export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function etiquetaMes(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES_CORTOS[(m ?? 1) - 1]} ${String(a).slice(2)}`;
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const RESPONSABILIDAD_LABEL: Record<Responsabilidad, string> = {
  directo: "Conductor",
  compartido: "Compartida",
  tercero: "Tercero",
  en_estudio: "En estudio",
};

export const CLASE_LABEL: Record<ClaseAccidente, string> = {
  simple: "Simple",
  lesionado: "Con lesionado",
  muerto: "Con muerto",
};

/** La responsabilidad cuenta como propia cuando es del conductor o compartida. */
export function esResponsabilidadPropia(r: Responsabilidad | null): boolean {
  return r === "directo" || r === "compartido";
}

/** Campos de filtro que viajan por la URL (clave de query param → significado). */
export const CLASES: ClaseAccidente[] = ["simple", "lesionado", "muerto"];
export const RESPONSABILIDADES: Responsabilidad[] = ["directo", "compartido", "tercero", "en_estudio"];

/** Construye los filtros a partir de los searchParams (PURO). */
export function filtrosDesdeParams(p: Record<string, string | undefined>): FiltrosAccidente {
  const val = (s?: string) => (s && s.trim() ? s.trim() : undefined);
  const f: FiltrosAccidente = {};
  if (p.origen === "gestivo" || p.origen === "historico" || p.origen === "ambos") f.origen = p.origen;
  if (val(p.desde)) f.desde = p.desde;
  if (val(p.hasta)) f.hasta = p.hasta;
  if (p.clase && (CLASES as string[]).includes(p.clase)) f.clase = p.clase as ClaseAccidente;
  if (p.resp && (RESPONSABILIDADES as string[]).includes(p.resp)) f.responsabilidad = p.resp as Responsabilidad;
  if (val(p.factor)) f.factor = p.factor;
  if (val(p.ruta)) f.ruta = p.ruta;
  if (p.tenencia === "empresa" || p.tenencia === "afiliado") f.tenencia = p.tenencia;
  if (p.caso === "abierto" || p.caso === "cerrado") f.caso = p.caso;
  if (val(p.aseg)) f.aseguradora = p.aseg;
  if (val(p.q)) f.conductor = p.q;
  if (p.ipat === "si") f.tieneIpat = true;
  else if (p.ipat === "no") f.tieneIpat = false;
  if (val(p.estado) && p.estado !== "todos") f.estado = p.estado;
  return f;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export interface Kpis {
  total: number;
  /** Variación vs. el periodo inmediatamente anterior de igual duración. */
  variacion: number | null; // porcentaje (+/-), null si no hay con qué comparar
  pctResponsabilidadPropia: number;
  pctGraves: number; // con lesionado o muerto
  fatales: number;
  costoReparacionTotal: number;
  costoReparacionPromedio: number;
  arregloTotal: number;
  factorDominante: { clave: string; label: string; count: number } | null;
  pctReincidencia: number; // % de accidentes de conductores con ≥2 en el periodo
  conductoresReincidentes: number;
  casosAbiertos: number;
  pctConIpat: number;
}

/**
 * KPIs del periodo. `anteriores` son las filas del periodo previo de igual
 * duración (para la variación); si no se pasan, la variación es null.
 */
export function calcularKpis(rows: readonly FilaAccidente[], anteriores?: readonly FilaAccidente[]): Kpis {
  const total = rows.length;
  const propias = rows.filter((r) => esResponsabilidadPropia(r.responsabilidad)).length;
  const graves = rows.filter((r) => r.clase === "lesionado" || r.clase === "muerto").length;
  const fatales = rows.filter((r) => r.clase === "muerto").length;

  const costoReparacionTotal = round2(rows.reduce((s, r) => s + (r.costoReparacion ?? 0), 0));
  const conCosto = rows.filter((r) => r.costoReparacion != null && r.costoReparacion > 0).length;
  const arregloTotal = round2(rows.reduce((s, r) => s + (r.arregloMonto ?? 0), 0));

  const factores = contarFactoresPolitica(rows);
  const factorDominante =
    factores.length > 0 ? { clave: factores[0].clave, label: factores[0].etiqueta, count: factores[0].count } : null;

  // Reincidencia: conductores (por cédula) con ≥2 accidentes en el periodo.
  const porConductor = new Map<string, number>();
  for (const r of rows) {
    const k = r.conductorCedula ?? `nombre:${r.conductorNombre}`;
    porConductor.set(k, (porConductor.get(k) ?? 0) + 1);
  }
  let reincidentes = 0;
  let accidentesDeReincidentes = 0;
  for (const n of porConductor.values()) {
    if (n >= 2) {
      reincidentes += 1;
      accidentesDeReincidentes += n;
    }
  }

  const casosAbiertos = rows.filter((r) => r.casoEstado === "abierto").length;
  const conIpat = rows.filter((r) => r.tieneIpat === true).length;

  let variacion: number | null = null;
  if (anteriores && anteriores.length > 0) {
    variacion = round2(((total - anteriores.length) / anteriores.length) * 100);
  } else if (anteriores && anteriores.length === 0 && total > 0) {
    variacion = null; // sin base previa, no se puede expresar en %
  }

  return {
    total,
    variacion,
    pctResponsabilidadPropia: pct(propias, total),
    pctGraves: pct(graves, total),
    fatales,
    costoReparacionTotal,
    costoReparacionPromedio: conCosto > 0 ? round2(costoReparacionTotal / conCosto) : 0,
    arregloTotal,
    factorDominante,
    pctReincidencia: pct(accidentesDeReincidentes, total),
    conductoresReincidentes: reincidentes,
    casosAbiertos,
    pctConIpat: pct(conIpat, total),
  };
}

// ── Agregaciones descriptivas ──────────────────────────────────────────────────

export interface PuntoSerie {
  clave: string;
  etiqueta: string;
  count: number;
  graves?: number;
  pct?: number;
}

/** Serie mensual: total y graves (lesionado/muerto) por mes, ordenada en el tiempo. */
export function serieMensual(rows: readonly FilaAccidente[]): PuntoSerie[] {
  const mapa = new Map<string, { count: number; graves: number }>();
  for (const r of rows) {
    const ym = mesDe(r.fecha);
    const acc = mapa.get(ym) ?? { count: 0, graves: 0 };
    acc.count += 1;
    if (r.clase === "lesionado" || r.clase === "muerto") acc.graves += 1;
    mapa.set(ym, acc);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, v]) => ({ clave: ym, etiqueta: etiquetaMes(ym), count: v.count, graves: v.graves }));
}

/** Frecuencia de los 4 factores de la Política de Correctivos (orden desc). */
export function contarFactoresPolitica(rows: readonly FilaAccidente[]): PuntoSerie[] {
  const conteo: Record<keyof FactoresPolitica, number> = {
    exceso_velocidad: 0,
    uso_celular: 0,
    no_distancia: 0,
    fatiga: 0,
  };
  for (const r of rows) {
    if (r.factoresPolitica.exceso_velocidad) conteo.exceso_velocidad += 1;
    if (r.factoresPolitica.uso_celular) conteo.uso_celular += 1;
    if (r.factoresPolitica.no_distancia) conteo.no_distancia += 1;
    if (r.factoresPolitica.fatiga) conteo.fatiga += 1;
  }
  const label = (k: string) =>
    FACTORES_POLITICA.find((f) => f.value === k || (k === "no_distancia" && f.value === "no_guardar_distancia"))
      ?.label ?? k;
  return (Object.keys(conteo) as (keyof FactoresPolitica)[])
    .map((k) => ({ clave: k, etiqueta: label(k), count: conteo[k] }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Conteo por una clave categórica con etiquetas legibles. */
function agrupar<T extends string>(
  rows: readonly FilaAccidente[],
  clave: (r: FilaAccidente) => T | null,
  label: (k: T) => string
): PuntoSerie[] {
  const mapa = new Map<T, number>();
  let sinDato = 0;
  for (const r of rows) {
    const k = clave(r);
    if (k == null) sinDato += 1;
    else mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  const total = rows.length;
  const out: PuntoSerie[] = [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => ({ clave: k, etiqueta: label(k), count: c, pct: pct(c, total) }));
  if (sinDato > 0) out.push({ clave: "__sin__", etiqueta: "Sin dato", count: sinDato, pct: pct(sinDato, total) });
  return out;
}

export function porResponsabilidad(rows: readonly FilaAccidente[]): PuntoSerie[] {
  return agrupar(rows, (r) => r.responsabilidad, (k) => RESPONSABILIDAD_LABEL[k] ?? k);
}

export function porGravedad(rows: readonly FilaAccidente[]): PuntoSerie[] {
  return agrupar(rows, (r) => r.clase, (k) => CLASE_LABEL[k] ?? k);
}

export function porTenencia(rows: readonly FilaAccidente[]): PuntoSerie[] {
  return agrupar(rows, (r) => r.tenencia, (k) => (k === "empresa" ? "Empresa" : "Afiliado"));
}

/** Top rutas por frecuencia (las `limite` mayores; el resto en "Otros"). */
export function porRuta(rows: readonly FilaAccidente[], limite = 10): PuntoSerie[] {
  const full = agrupar(rows, (r) => r.vehiculoRuta, (k) => k);
  if (full.length <= limite) return full;
  const top = full.slice(0, limite);
  const resto = full.slice(limite).reduce((s, p) => s + p.count, 0);
  if (resto > 0) top.push({ clave: "__otros__", etiqueta: "Otros", count: resto, pct: pct(resto, rows.length) });
  return top;
}

/** Distribución por hora del día (0–23); omite filas sin hora clara. */
export function porHora(rows: readonly FilaAccidente[]): PuntoSerie[] {
  const horas = new Array(24).fill(0);
  for (const r of rows) {
    const h = new Date(r.fecha).getHours();
    if (Number.isFinite(h)) horas[h] += 1;
  }
  return horas.map((c, h) => ({ clave: String(h), etiqueta: `${String(h).padStart(2, "0")}:00`, count: c }));
}

/** Distribución por día de la semana (Lun→Dom en orden laboral). */
export function porDiaSemana(rows: readonly FilaAccidente[]): PuntoSerie[] {
  const dias = new Array(7).fill(0);
  for (const r of rows) dias[new Date(r.fecha).getDay()] += 1;
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return orden.map((d) => ({ clave: String(d), etiqueta: DIAS_SEMANA[d], count: dias[d] }));
}

export interface RankingItem {
  clave: string;
  nombre: string;
  total: number;
  propias: number;
  graves: number;
}

/** Conductores con más accidentes (por cédula), top `limite`. */
export function rankingConductores(rows: readonly FilaAccidente[], limite = 10): RankingItem[] {
  const mapa = new Map<string, RankingItem>();
  for (const r of rows) {
    const k = r.conductorCedula ?? `nombre:${r.conductorNombre}`;
    const it = mapa.get(k) ?? { clave: k, nombre: r.conductorNombre, total: 0, propias: 0, graves: 0 };
    it.total += 1;
    if (esResponsabilidadPropia(r.responsabilidad)) it.propias += 1;
    if (r.clase === "lesionado" || r.clase === "muerto") it.graves += 1;
    mapa.set(k, it);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || b.propias - a.propias).slice(0, limite);
}

/** Vehículos con más accidentes (por código interno), top `limite`. */
export function rankingVehiculos(rows: readonly FilaAccidente[], limite = 10): RankingItem[] {
  const mapa = new Map<string, RankingItem>();
  for (const r of rows) {
    if (!r.vehiculoCodigo) continue;
    const it = mapa.get(r.vehiculoCodigo) ?? { clave: r.vehiculoCodigo, nombre: r.vehiculoCodigo, total: 0, propias: 0, graves: 0 };
    it.total += 1;
    if (esResponsabilidadPropia(r.responsabilidad)) it.propias += 1;
    if (r.clase === "lesionado" || r.clase === "muerto") it.graves += 1;
    mapa.set(r.vehiculoCodigo, it);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, limite);
}

// ── Análisis prescriptivo (recomendaciones por reglas) ──────────────────────────

export type Severidad = "alta" | "media" | "baja";

export interface Recomendacion {
  severidad: Severidad;
  titulo: string;
  detalle: string;
  /** Filtro sugerido para abrir el listado en Consultar (clave→valor). */
  filtro?: Partial<FiltrosAccidente>;
}

/**
 * Genera recomendaciones a partir de las filas del periodo. PURO. Las reglas
 * son conservadoras (umbrales explícitos) para que el panel sea accionable y
 * no ruidoso.
 */
export function generarPrescriptivos(rows: readonly FilaAccidente[]): Recomendacion[] {
  const recs: Recomendacion[] = [];
  const total = rows.length;
  if (total === 0) return recs;

  // 1. Factor de riesgo que concentra buena parte de los casos.
  const factores = contarFactoresPolitica(rows);
  for (const f of factores) {
    const p = pct(f.count, total);
    if (p >= 20) {
      recs.push({
        severidad: p >= 35 ? "alta" : "media",
        titulo: `Capacitación en ${f.etiqueta.toLowerCase()}`,
        detalle: `${f.etiqueta} aparece en ${f.count} de ${total} accidentes (${p}%). Priorizar refuerzo y control sobre este factor.`,
        filtro: { factor: f.clave === "no_distancia" ? "no_guardar_distancia" : f.clave },
      });
    }
  }

  // 2. Ruta que concentra el riesgo.
  const rutas = porRuta(rows, 5).filter((r) => r.clave !== "__otros__" && r.clave !== "__sin__");
  for (const r of rutas.slice(0, 2)) {
    const p = pct(r.count, total);
    if (p >= 15 && r.count >= 3) {
      recs.push({
        severidad: p >= 25 ? "alta" : "media",
        titulo: `Reforzar control en ruta ${r.etiqueta}`,
        detalle: `La ruta ${r.etiqueta} concentra ${r.count} accidentes (${p}%). Revisar puntos críticos y conducción en esa operación.`,
        filtro: { ruta: r.clave },
      });
    }
  }

  // 3. Franja horaria de mayor siniestralidad.
  const horas = porHora(rows);
  const picoHora = [...horas].sort((a, b) => b.count - a.count)[0];
  if (picoHora && pct(picoHora.count, total) >= 15 && picoHora.count >= 3) {
    recs.push({
      severidad: "media",
      titulo: `Franja crítica alrededor de las ${picoHora.etiqueta}`,
      detalle: `${picoHora.count} accidentes (${pct(picoHora.count, total)}%) ocurren cerca de las ${picoHora.etiqueta}. Reforzar descanso, relevos y supervisión en esa franja.`,
    });
  }

  // 4. Conductores reincidentes → plan individual / política de correctivos.
  const reinc = rankingConductores(rows, 100).filter((c) => c.total >= 2);
  if (reinc.length > 0) {
    const top = reinc.slice(0, 5).map((c) => `${c.nombre} (${c.total})`).join(", ");
    recs.push({
      severidad: reinc.some((c) => c.total >= 3) ? "alta" : "media",
      titulo: `${reinc.length} conductor(es) reincidente(s)`,
      detalle: `Con 2 o más accidentes en el periodo: ${top}${reinc.length > 5 ? "…" : ""}. Activar plan individual y la política de correctivos.`,
    });
  }

  // 5. Responsabilidad propia alta: el problema está dentro de la operación.
  const propias = rows.filter((r) => esResponsabilidadPropia(r.responsabilidad)).length;
  const pPropias = pct(propias, total);
  if (pPropias >= 50) {
    recs.push({
      severidad: pPropias >= 65 ? "alta" : "media",
      titulo: "Alta responsabilidad propia",
      detalle: `${pPropias}% de los accidentes son del conductor o compartidos. El foco de mejora es interno (conducción, selección, capacitación).`,
      filtro: { responsabilidad: "directo" },
    });
  }

  // 6. Gravedad: presencia de fatales o lesionados sobre el umbral.
  const fatales = rows.filter((r) => r.clase === "muerto").length;
  if (fatales > 0) {
    recs.push({
      severidad: "alta",
      titulo: `${fatales} accidente(s) con víctima fatal`,
      detalle: `Investigación a fondo y plan de prevención específico; priorizar el cierre de estos casos.`,
      filtro: { clase: "muerto" },
    });
  }

  // 7. Casos abiertos: carga de gestión sin cerrar.
  const abiertos = rows.filter((r) => r.casoEstado === "abierto").length;
  if (abiertos >= 5 && pct(abiertos, total) >= 20) {
    recs.push({
      severidad: "media",
      titulo: `${abiertos} casos abiertos`,
      detalle: `El ${pct(abiertos, total)}% de los casos sigue abierto. Depurar seguimiento de lesionados y cierres con aseguradora.`,
      filtro: { caso: "abierto" },
    });
  }

  // Orden: primero lo más severo.
  const peso: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
  return recs.sort((a, b) => peso[a.severidad] - peso[b.severidad]);
}

// ── Loader (E/S) ────────────────────────────────────────────────────────────────

type RowDB = {
  id: string;
  consecutivo: number;
  origen: "gestivo" | "historico";
  fecha_accidente: string;
  conductor_cedula: string | null;
  conductor_nombre: string;
  direccion_accidente: string;
  vehiculo_codigo: string | null;
  vehiculo_placa: string | null;
  vehiculo_ruta: string | null;
  vehiculo_empresa: boolean | null;
  vehiculo_afiliado: boolean | null;
  clase_accidente: ClaseAccidente | null;
  responsabilidad_reportada: Responsabilidad | null;
  factores_codigos: string[] | null;
  fact_exceso_velocidad: boolean | null;
  fact_uso_celular: boolean | null;
  fact_no_distancia: boolean | null;
  fact_fatiga: boolean | null;
  velocidad_kmh: number | null;
  costo_reparacion: number | null;
  arreglo_monto: number | null;
  caso_estado: string | null;
  estado: string;
  tiene_ipat: boolean | null;
  aseguradora_nombre: string | null;
  accidente_evaluaciones: { responsabilidad: Responsabilidad | null } | { responsabilidad: Responsabilidad | null }[] | null;
};

function normalizar(row: RowDB): FilaAccidente {
  const ev = Array.isArray(row.accidente_evaluaciones)
    ? row.accidente_evaluaciones[0]
    : row.accidente_evaluaciones;
  const responsabilidad = (ev?.responsabilidad ?? row.responsabilidad_reportada) ?? null;
  const tenencia = row.vehiculo_empresa ? "empresa" : row.vehiculo_afiliado ? "afiliado" : null;
  return {
    id: row.id,
    consecutivo: Number(row.consecutivo),
    fecha: row.fecha_accidente,
    origen: row.origen,
    conductorCedula: row.conductor_cedula,
    conductorNombre: row.conductor_nombre,
    direccion: row.direccion_accidente,
    vehiculoCodigo: row.vehiculo_codigo,
    vehiculoPlaca: row.vehiculo_placa,
    vehiculoRuta: row.vehiculo_ruta,
    tenencia,
    clase: row.clase_accidente,
    responsabilidad,
    factores: row.factores_codigos ?? [],
    factoresPolitica: {
      exceso_velocidad: Boolean(row.fact_exceso_velocidad),
      uso_celular: Boolean(row.fact_uso_celular),
      no_distancia: Boolean(row.fact_no_distancia),
      fatiga: Boolean(row.fact_fatiga),
    },
    velocidad: row.velocidad_kmh,
    costoReparacion: row.costo_reparacion,
    arregloMonto: row.arreglo_monto,
    casoEstado: row.caso_estado,
    estado: row.estado,
    tieneIpat: row.tiene_ipat,
    aseguradora: row.aseguradora_nombre,
  };
}

/** ¿La fila pasa los filtros que se resuelven en memoria (dictamen, factor…)? */
export function pasaFiltros(f: FilaAccidente, filtros: FiltrosAccidente): boolean {
  if (filtros.clase && f.clase !== filtros.clase) return false;
  if (filtros.estado && f.estado !== filtros.estado) return false;
  if (filtros.responsabilidad && f.responsabilidad !== filtros.responsabilidad) return false;
  if (filtros.tenencia && f.tenencia !== filtros.tenencia) return false;
  if (filtros.caso && f.casoEstado !== filtros.caso) return false;
  if (filtros.tieneIpat != null && f.tieneIpat !== filtros.tieneIpat) return false;
  if (filtros.ruta && f.vehiculoRuta !== filtros.ruta) return false;
  if (filtros.aseguradora && f.aseguradora !== filtros.aseguradora) return false;
  if (filtros.factor) {
    const fp = f.factoresPolitica;
    const map: Record<string, boolean> = {
      exceso_velocidad: fp.exceso_velocidad,
      uso_celular: fp.uso_celular,
      no_guardar_distancia: fp.no_distancia,
      no_distancia: fp.no_distancia,
      fatiga_comprobada: fp.fatiga,
      fatiga: fp.fatiga,
    };
    const esPolitica = filtros.factor in map;
    if (esPolitica ? !map[filtros.factor] : !f.factores.includes(filtros.factor)) return false;
  }
  if (filtros.conductor) {
    const q = sinAcentos(filtros.conductor);
    const campos = [f.conductorCedula, f.conductorNombre, f.vehiculoCodigo, f.vehiculoRuta]
      .filter(Boolean)
      .map((s) => sinAcentos(String(s)));
    if (!campos.some((c) => c.includes(q))) return false;
  }
  return true;
}

/** Opciones para poblar los selects de la barra de filtros. */
export async function getOpcionesFiltro(): Promise<{ rutas: string[]; aseguradoras: { value: string; label: string }[] }> {
  const admin = createAdminClient();
  const rutasSet = new Set<string>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin
      .from("accidentes")
      .select("vehiculo_ruta")
      .not("vehiculo_ruta", "is", null)
      .range(desde, desde + 999);
    if (error) break;
    const page = (data ?? []) as { vehiculo_ruta: string | null }[];
    for (const r of page) if (r.vehiculo_ruta) rutasSet.add(r.vehiculo_ruta.trim());
    if (page.length < 1000) break;
  }
  const { data: aseg } = await admin
    .from("accidente_catalogos")
    .select("codigo, label")
    .eq("tipo", "aseguradora")
    .eq("activo", true)
    .order("orden");
  const aseguradoras = ((aseg ?? []) as { codigo: string; label: string }[]).map((a) => ({
    value: a.label,
    label: a.label,
  }));
  return { rutas: [...rutasSet].sort((a, b) => a.localeCompare(b)), aseguradoras };
}

/**
 * Trae las filas normalizadas para el análisis/consulta. Los filtros baratos
 * (fecha, origen) se aplican en SQL; los de dictamen y factor en memoria con
 * `pasaFiltros`. Pagina porque el histórico supera las 1.000 filas de PostgREST.
 */
export async function getAccidentesAnalisis(filtros: FiltrosAccidente = {}): Promise<FilaAccidente[]> {
  const admin = createAdminClient();
  const origen = filtros.origen ?? "ambos";
  const out: FilaAccidente[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = admin
      .from("accidentes")
      .select(
        "id, consecutivo, origen, fecha_accidente, conductor_cedula, conductor_nombre, " +
          "direccion_accidente, vehiculo_codigo, vehiculo_placa, vehiculo_ruta, vehiculo_empresa, vehiculo_afiliado, clase_accidente, " +
          "responsabilidad_reportada, factores_codigos, fact_exceso_velocidad, fact_uso_celular, " +
          "fact_no_distancia, fact_fatiga, velocidad_kmh, costo_reparacion, arreglo_monto, " +
          "caso_estado, estado, tiene_ipat, aseguradora_nombre, " +
          "accidente_evaluaciones(responsabilidad)"
      )
      .order("fecha_accidente", { ascending: false })
      .range(desde, desde + 999);
    if (origen !== "ambos") q = q.eq("origen", origen);
    if (filtros.desde) q = q.gte("fecha_accidente", filtros.desde);
    if (filtros.hasta) q = q.lte("fecha_accidente", `${filtros.hasta}T23:59:59`);
    const { data, error } = await q;
    if (error) return [];
    const page = (data ?? []) as unknown as RowDB[];
    for (const row of page) {
      const fila = normalizar(row);
      if (pasaFiltros(fila, filtros)) out.push(fila);
    }
    if (page.length < 1000) break;
  }
  return out;
}
