/**
 * Análisis de liquidación — descriptivo y predictivo de deserción de
 * conductores a partir de lo que trabajan, venden y ganan.
 *
 * Es distinto del módulo Riesgo, que se apoya en el ausentismo: aquí solo
 * entra la liquidación (vista `liquidacion_conductor_mes`, un resumen por
 * conductor y mes de `cierres_diarios`) más la antigüedad, que hace de control
 * porque la mayoría de los que se van llevan pocos meses.
 *
 * Reglas del panel, compartidas con Riesgo para que ambos módulos cuenten la
 * plantilla igual (`retiroDe`, `enPlantilla`, `dividir` y la regresión):
 *
 *  - Un corte por mes, el día 1. Las variables miran los tres meses
 *    calendario anteriores (m1 = el mes justo antes del corte), así que el
 *    modelo nunca ve datos posteriores al corte que predice.
 *  - Resultado: retiro en los 60 días siguientes al corte; `null` mientras ese
 *    horizonte no haya pasado (no entrena, pero sí se puntúa).
 *  - Entran los que estaban en plantilla y tuvieron algún cierre en los tres
 *    meses previos.
 *  - Los meses sin valores en plata (enero a mayo de 2026 llegaron de GEMA sin
 *    salario) se imputan con la mediana de la flota en ese mes: siguen
 *    aportando días, viajes y timbradas, y las variables de plata quedan sin
 *    señal en vez de sesgadas. Las tablas descriptivas de plata los excluyen.
 *
 * Todo es puro: recibe filas y devuelve el análisis listo para pintar.
 */
import { entrenar, nivel, puntuar, type Modelo, type Nivel } from "@/lib/riesgo/modelo";
import { dividir, enPlantilla, estaActivo, retiroDe } from "@/lib/riesgo/panel";
import { dig, diasEntre, media, sumarDias } from "@/lib/riesgo/fechas";
import type { Conductor, Fila } from "@/lib/riesgo/variables";

// ── Fuente ──────────────────────────────────────────────────────────────────

/** Una fila de la vista `liquidacion_conductor_mes`. */
export interface MesLiq {
  cedula: string;
  /** Primer día del mes, AAAA-MM-01. */
  mes: string;
  dias: number;
  dias_con_valores: number;
  viajes: number;
  timbradas: number;
  bruto: number | null;
  neto: number | null;
  ahorro: number | null;
  anticipo: number | null;
  dias_bajo_base: number;
  neto_sd: number | null;
  rutas: number;
  vehiculos: number;
  ruta_principal: string | null;
  ultimo_dia: string;
}

// ── Variables ───────────────────────────────────────────────────────────────

export const VARIABLES: { key: string; etiqueta: string; grupo: string }[] = [
  { key: "antig_meses", etiqueta: "Antigüedad (meses)", grupo: "Perfil" },
  { key: "antig_menor_6m", etiqueta: "Menos de 6 meses en la empresa", grupo: "Perfil" },
  { key: "dias_m1", etiqueta: "Días trabajados el mes anterior", grupo: "Trabajo" },
  { key: "sin_trabajo_m1", etiqueta: "No trabajó el mes anterior", grupo: "Trabajo" },
  { key: "caida_dias", etiqueta: "Caída de días frente a los dos meses previos", grupo: "Trabajo" },
  { key: "viajes_dia", etiqueta: "Viajes por día trabajado", grupo: "Trabajo" },
  { key: "pasajeros_viaje", etiqueta: "Timbradas (pasajeros) por viaje", grupo: "Ventas" },
  { key: "bruto_dia", etiqueta: "Ventas (bruto) por día, miles", grupo: "Ventas" },
  { key: "bruto_vs_ruta", etiqueta: "Ventas por día frente a su ruta", grupo: "Ventas" },
  { key: "neto_dia", etiqueta: "Neto ganado por día, miles", grupo: "Ingreso" },
  { key: "tendencia_neto", etiqueta: "Tendencia del neto por día", grupo: "Ingreso" },
  { key: "pct_bajo_base", etiqueta: "Días por debajo de la base diaria", grupo: "Ingreso" },
  { key: "variabilidad_neto", etiqueta: "Variabilidad del neto diario", grupo: "Ingreso" },
  { key: "anticipo", etiqueta: "Pidió anticipo el mes anterior", grupo: "Ingreso" },
  { key: "varias_rutas", etiqueta: "Trabajó en más de una ruta", grupo: "Estabilidad" },
  { key: "cambio_ruta", etiqueta: "Cambió de ruta principal", grupo: "Estabilidad" },
  { key: "vehiculos", etiqueta: "Vehículos distintos en el mes", grupo: "Estabilidad" },
];

export const KEYS = VARIABLES.map((v) => v.key);
export const ETIQUETA: Record<string, string> = Object.fromEntries(VARIABLES.map((v) => [v.key, v.etiqueta]));

/** Primer día del mes que está `n` meses antes (n > 0) o después de `mes`. */
export function mesMas(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const conValores = (m: MesLiq | undefined): m is MesLiq => !!m && m.dias_con_valores > 0 && m.neto != null;
const netoDia = (m: MesLiq) => (m.neto ?? 0) / m.dias_con_valores;
const brutoDia = (m: MesLiq) => (m.bruto ?? 0) / m.dias_con_valores;

/** Medianas de la flota por mes (y por ruta), para imputar y comparar. */
export interface Contexto {
  netoDia: Map<string, number>;
  brutoDia: Map<string, number>;
  pctBajoBase: Map<string, number>;
  variabilidad: Map<string, number>;
  brutoRuta: Map<string, number>;
  /** Medianas de todo el período, para un mes sin ningún valor. */
  global: { netoDia: number; brutoDia: number; pctBajoBase: number; variabilidad: number };
}

export function construirContexto(meses: MesLiq[]): Contexto {
  const agrupa = (f: (m: MesLiq) => string) => {
    const g = new Map<string, MesLiq[]>();
    for (const m of meses) if (conValores(m)) g.set(f(m), [...(g.get(f(m)) ?? []), m]);
    return g;
  };
  const porMes = agrupa((m) => m.mes);
  const porRuta = agrupa((m) => `${m.mes}|${m.ruta_principal ?? ""}`);
  const med = (g: Map<string, MesLiq[]>, f: (m: MesLiq) => number) =>
    new Map([...g].map(([k, xs]) => [k, mediana(xs.map(f))]));
  const todos = meses.filter(conValores);
  const pct = (m: MesLiq) => m.dias_bajo_base / m.dias_con_valores;
  const vari = (m: MesLiq) => (netoDia(m) > 0 ? (m.neto_sd ?? 0) / netoDia(m) : 0);
  return {
    netoDia: med(porMes, netoDia),
    brutoDia: med(porMes, brutoDia),
    pctBajoBase: med(porMes, pct),
    variabilidad: med(porMes, vari),
    brutoRuta: med(porRuta, brutoDia),
    global: {
      netoDia: mediana(todos.map(netoDia)),
      brutoDia: mediana(todos.map(brutoDia)),
      pctBajoBase: mediana(todos.map(pct)),
      variabilidad: mediana(todos.map(vari)),
    },
  };
}

/** Variables de un conductor al corte `t` (día 1 de un mes). */
export function variables(
  c: Conductor,
  serie: Map<string, MesLiq>,
  t: string,
  ctx: Contexto
): { x: Record<string, number>; dineroReal: boolean; ruta: string | null } {
  const m1k = mesMas(t, -1);
  const m1 = serie.get(m1k);
  const m2 = serie.get(mesMas(t, -2));
  const m3 = serie.get(mesMas(t, -3));

  const diasM1 = m1?.dias ?? 0;
  const diasPrev = ((m2?.dias ?? 0) + (m3?.dias ?? 0)) / 2;
  const antig = c.fecha_ingreso ? Math.max(0, diasEntre(c.fecha_ingreso, t)) / 30.44 : 0;

  const dineroReal = conValores(m1);
  const neto = dineroReal ? netoDia(m1) : ctx.netoDia.get(m1k) ?? ctx.global.netoDia;
  const bruto = dineroReal ? brutoDia(m1) : ctx.brutoDia.get(m1k) ?? ctx.global.brutoDia;
  const brutoRuta = ctx.brutoRuta.get(`${m1k}|${m1?.ruta_principal ?? ""}`);
  const previos = [m2, m3].filter(conValores);
  const netoPrev = previos.length ? media(previos.map(netoDia)) : 0;

  return {
    dineroReal,
    ruta: m1?.ruta_principal ?? null,
    x: {
      antig_meses: Math.min(antig, 240),
      antig_menor_6m: antig < 6 ? 1 : 0,
      dias_m1: diasM1,
      sin_trabajo_m1: diasM1 === 0 ? 1 : 0,
      caida_dias: diasPrev > 0 ? Math.max(0, (diasPrev - diasM1) / diasPrev) : 0,
      viajes_dia: m1 && m1.dias > 0 ? m1.viajes / m1.dias : 0,
      pasajeros_viaje: m1 && m1.viajes > 0 ? m1.timbradas / m1.viajes : 0,
      bruto_dia: bruto / 1000,
      bruto_vs_ruta: dineroReal && brutoRuta ? Math.min(3, bruto / brutoRuta) : 1,
      neto_dia: neto / 1000,
      tendencia_neto:
        dineroReal && netoPrev > 0 ? Math.max(-1, Math.min(1, (neto - netoPrev) / netoPrev)) : 0,
      pct_bajo_base: dineroReal
        ? m1.dias_bajo_base / m1.dias_con_valores
        : ctx.pctBajoBase.get(m1k) ?? ctx.global.pctBajoBase,
      variabilidad_neto: dineroReal
        ? neto > 0 ? Math.min(3, (m1.neto_sd ?? 0) / neto) : 0
        : ctx.variabilidad.get(m1k) ?? ctx.global.variabilidad,
      anticipo: dineroReal && (m1.anticipo ?? 0) > 0 ? 1 : 0,
      varias_rutas: (m1?.rutas ?? 0) > 1 ? 1 : 0,
      cambio_ruta:
        m1?.ruta_principal && m2?.ruta_principal && m1.ruta_principal !== m2.ruta_principal ? 1 : 0,
      vehiculos: m1?.vehiculos ?? 0,
    },
  };
}

// ── Panel ───────────────────────────────────────────────────────────────────

export interface FilaLiq extends Fila {
  /** El mes anterior al corte trajo valores en plata (no imputados). */
  dineroReal: boolean;
  ruta: string | null;
}

/** Primer corte del panel: la liquidación arranca en enero de 2025 y se necesitan 3 meses previos. */
export const PRIMER_CORTE = "2025-04-01";

export function cortesHasta(corte: string, desde = PRIMER_CORTE): string[] {
  const out: string[] = [];
  for (let t = desde; t <= corte; t = mesMas(t, 1)) out.push(t);
  return out;
}

export function series(meses: MesLiq[]): Map<string, Map<string, MesLiq>> {
  const s = new Map<string, Map<string, MesLiq>>();
  for (const m of meses) {
    const ced = dig(m.cedula);
    if (!s.has(ced)) s.set(ced, new Map());
    s.get(ced)!.set(m.mes, m);
  }
  return s;
}

const tieneHuella = (serie: Map<string, MesLiq> | undefined, t: string) =>
  !!serie && [1, 2, 3].some((k) => (serie.get(mesMas(t, -k))?.dias ?? 0) > 0);

/**
 * Panel conductor × corte. `hoy` decide qué resultados ya son observables y
 * descarta fechas de retiro que todavía no han ocurrido (digitación).
 */
export function construirPanel(
  conductores: Conductor[],
  porCedula: Map<string, Map<string, MesLiq>>,
  ctx: Contexto,
  cortes: string[],
  hoy: string
): FilaLiq[] {
  const filas: FilaLiq[] = [];
  for (const t of cortes) {
    for (const c of conductores) {
      if (!enPlantilla(c, t, hoy)) continue;
      const serie = porCedula.get(dig(c.cedula));
      if (!tieneHuella(serie, t)) continue;
      const r = retiroDe(c, hoy);
      const fin60 = sumarDias(t, 60);
      const v = variables(c, serie!, t, ctx);
      filas.push({
        cedula: dig(c.cedula),
        nombre: c.nombre,
        corte: t,
        x: v.x,
        dineroReal: v.dineroReal,
        ruta: v.ruta,
        retiro60: fin60 <= hoy ? (r && r >= t && r < fin60 ? 1 : 0) : null,
        novedad30: null,
      });
    }
  }
  return filas;
}

// ── Resultado ───────────────────────────────────────────────────────────────

export interface Coeficiente {
  key: string;
  etiqueta: string;
  peso: number;
}

export interface ConductorPuntuado {
  cedula: string;
  codigo: string | null;
  nombre: string;
  prob: number;
  nivel: Nivel;
  factores: string[];
  antigMeses: number;
  ruta: string | null;
  diasM1: number;
  /** Días con cierre en lo que va del mes en curso. */
  diasMesActual: number;
  /** null si el mes anterior no trajo valores en plata. */
  netoDia: number | null;
  brutoDia: number | null;
  brutoVsRuta: number | null;
  tendenciaNeto: number | null;
  pctBajoBase: number | null;
  ultimoCierre: string | null;
}

export interface Metricas {
  auc: number;
  base: number;
  n: number;
  nTest: number;
  positivos: number;
  liftTop10: number;
  capturaTop20: number;
  precisionTop10: number;
  mesesTest: string[];
}

export interface MesFlota {
  mes: string;
  conductores: number;
  diasPromedio: number;
  /** Mediana del neto por día; null en meses sin valores. */
  netoDia: number | null;
  brutoDia: number | null;
  retiros: number;
  tasa: number;
  conValores: boolean;
}

export interface PuntoTrayectoria {
  /** Meses antes del mes del retiro (1 = el mes anterior). */
  mesesAntes: number;
  retiradosDias: number;
  retiradosNeto: number | null;
  activosDias: number;
  activosNeto: number | null;
  nRetirados: number;
}

export interface Tramo {
  etiqueta: string;
  n: number;
  tasa: number;
}

export interface FilaRuta {
  ruta: string;
  conductores: number;
  netoDia: number | null;
  diasPromedio: number;
  tasa: number;
  n: number;
}

export interface Analisis {
  corte: string;
  hoy: string;
  metricas: Metricas | null;
  coeficientes: Coeficiente[];
  conductores: ConductorPuntuado[];
  flota: MesFlota[];
  trayectoria: PuntoTrayectoria[];
  tramos: { titulo: string; nota?: string; datos: Tramo[] }[];
  rutas: FilaRuta[];
  /** Meses del período sin valores en plata (necesitan re-sincronizarse de GEMA). */
  mesesSinValores: string[];
  observaciones: number;
}

function tasaTramos(filas: FilaLiq[], tramos: { etiqueta: string; test: (f: FilaLiq) => boolean }[]): Tramo[] {
  return tramos.map((t) => {
    const g = filas.filter(t.test);
    return { etiqueta: t.etiqueta, n: g.length, tasa: g.length ? media(g.map((f) => f.retiro60 as number)) : 0 };
  });
}

function quintiles(filas: FilaLiq[], key: string, fmt: (v: number) => string): Tramo[] {
  const s = [...filas].sort((a, b) => a.x[key] - b.x[key]);
  if (s.length < 25) return [];
  return [0, 1, 2, 3, 4].map((i) => {
    const g = s.slice(Math.floor((i * s.length) / 5), Math.floor(((i + 1) * s.length) / 5));
    return {
      etiqueta: `${fmt(g[0].x[key])} – ${fmt(g[g.length - 1].x[key])}`,
      n: g.length,
      tasa: media(g.map((f) => f.retiro60 as number)),
    };
  });
}

const miles = (v: number) => `$${Math.round(v)} mil`;

export function analizar(conductores: Conductor[], meses: MesLiq[], hoy: string): Analisis {
  const corte = `${hoy.slice(0, 7)}-01`;
  const ctx = construirContexto(meses);
  const porCedula = series(meses);
  const panel = construirPanel(conductores, porCedula, ctx, cortesHasta(corte), hoy);
  const evaluables = panel.filter((f) => f.retiro60 != null);

  // ── Modelo: uno con corte temporal para publicar métricas y uno con todo
  //    lo evaluable para puntuar hoy (como en Riesgo).
  let metricas: Metricas | null = null;
  let final: Modelo | null = null;
  const d = dividir(evaluables);
  const positivos = (fs: Fila[]) => fs.reduce((a, f) => a + (f.retiro60 as number), 0);
  if (d.train.length >= 100 && d.test.length >= 30 && positivos(d.train) >= 10 && positivos(d.test) >= 3) {
    const m = entrenar(d.train, d.test, "retiro60", KEYS);
    metricas = {
      auc: m.auc,
      base: m.base,
      n: m.n,
      nTest: m.nTest,
      positivos: m.positivos,
      liftTop10: m.liftTop10,
      capturaTop20: m.capturaTop20,
      precisionTop10: m.precisionTop10,
      mesesTest: d.mesesTest.map((x) => x.slice(0, 7)),
    };
    final = entrenar(evaluables, d.test, "retiro60", KEYS);
  }

  const coeficientes: Coeficiente[] = final
    ? final.keys
        .map((k, j) => ({ key: k, etiqueta: ETIQUETA[k], peso: final!.w[j] }))
        .sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso))
    : [];

  // ── Conductores activos de hoy ──
  const mesActual = corte;
  const puntuados: ConductorPuntuado[] = [];
  for (const c of conductores) {
    if (!estaActivo(c) || !enPlantilla(c, corte, hoy)) continue;
    const serie = porCedula.get(dig(c.cedula));
    if (!tieneHuella(serie, corte) && !(serie?.get(mesActual)?.dias)) continue;
    const v = variables(c, serie ?? new Map(), corte, ctx);
    const p = final ? puntuar(final, v.x) : null;
    const ultimo = serie ? [...serie.values()].map((m) => m.ultimo_dia).sort().at(-1) ?? null : null;
    puntuados.push({
      cedula: dig(c.cedula),
      codigo: c.codigo,
      nombre: c.nombre,
      prob: p?.p ?? 0,
      nivel: p && metricas ? nivel(p.p, metricas.base) : "Bajo",
      factores: (p?.factores ?? []).map((f) => ETIQUETA[f.key]),
      antigMeses: v.x.antig_meses,
      ruta: v.ruta,
      diasM1: v.x.dias_m1,
      diasMesActual: serie?.get(mesActual)?.dias ?? 0,
      netoDia: v.dineroReal ? v.x.neto_dia * 1000 : null,
      brutoDia: v.dineroReal ? v.x.bruto_dia * 1000 : null,
      brutoVsRuta: v.dineroReal ? v.x.bruto_vs_ruta : null,
      tendenciaNeto: v.dineroReal ? v.x.tendencia_neto : null,
      pctBajoBase: v.dineroReal ? v.x.pct_bajo_base : null,
      ultimoCierre: ultimo,
    });
  }
  puntuados.sort((a, b) => b.prob - a.prob);

  // ── Descriptivo: la flota mes a mes ──
  const mesesTodos = [...new Set(meses.map((m) => m.mes))].sort();
  const flota: MesFlota[] = mesesTodos.map((mes) => {
    const delMes = meses.filter((m) => m.mes === mes && m.dias > 0);
    const valores = delMes.filter(conValores);
    const fin = mesMas(mes, 1);
    const retiros = conductores.filter((c) => {
      const r = retiroDe(c, hoy);
      return r && r >= mes && r < fin;
    }).length;
    return {
      mes: mes.slice(0, 7),
      conductores: delMes.length,
      diasPromedio: delMes.length ? media(delMes.map((m) => m.dias)) : 0,
      netoDia: valores.length > delMes.length / 2 ? mediana(valores.map(netoDia)) : null,
      brutoDia: valores.length > delMes.length / 2 ? mediana(valores.map(brutoDia)) : null,
      retiros,
      tasa: delMes.length ? retiros / delMes.length : 0,
      conValores: valores.length > delMes.length / 2,
    };
  });

  // ── Descriptivo: trayectoria de los que se fueron frente a los activos ──
  const retirados = conductores
    .map((c) => ({ c, r: retiroDe(c, hoy) }))
    .filter((x): x is { c: Conductor; r: string } => !!x.r && x.r >= PRIMER_CORTE);
  const activos = conductores.filter((c) => estaActivo(c));
  const trayectoria: PuntoTrayectoria[] = [1, 2, 3, 4, 5, 6].map((k) => {
    const ret = retirados
      .map(({ c, r }) => porCedula.get(dig(c.cedula))?.get(mesMas(`${r.slice(0, 7)}-01`, -k)))
      .filter((m): m is MesLiq => !!m);
    const act = activos
      .map((c) => porCedula.get(dig(c.cedula))?.get(mesMas(corte, -k)))
      .filter((m): m is MesLiq => !!m && m.dias > 0);
    // Los retirados que no tenían cierre ese mes cuentan con 0 días: llevar
    // poco tiempo es parte de la historia que se quiere ver.
    const conCierreAntes = retirados.filter(({ c }) => porCedula.has(dig(c.cedula))).length;
    const diasRet = [...ret.map((m) => m.dias), ...new Array(Math.max(0, conCierreAntes - ret.length)).fill(0)];
    const vr = ret.filter(conValores);
    const va = act.filter(conValores);
    return {
      mesesAntes: k,
      retiradosDias: media(diasRet),
      retiradosNeto: vr.length >= 10 ? mediana(vr.map(netoDia)) : null,
      activosDias: act.length ? media(act.map((m) => m.dias)) : 0,
      activosNeto: va.length >= 10 ? mediana(va.map(netoDia)) : null,
      nRetirados: ret.length,
    };
  });

  // ── Descriptivo: tasa de retiro por tramo ──
  const conPlata = evaluables.filter((f) => f.dineroReal);
  const tramos = [
    {
      titulo: "Días trabajados el mes anterior",
      datos: tasaTramos(evaluables, [
        { etiqueta: "Ninguno", test: (f) => f.x.dias_m1 === 0 },
        { etiqueta: "1 a 10", test: (f) => f.x.dias_m1 >= 1 && f.x.dias_m1 <= 10 },
        { etiqueta: "11 a 20", test: (f) => f.x.dias_m1 >= 11 && f.x.dias_m1 <= 20 },
        { etiqueta: "21 a 25", test: (f) => f.x.dias_m1 >= 21 && f.x.dias_m1 <= 25 },
        { etiqueta: "26 o más", test: (f) => f.x.dias_m1 >= 26 },
      ]),
    },
    {
      titulo: "Neto ganado por día",
      nota: "Quintiles; solo meses con valores.",
      datos: quintiles(conPlata, "neto_dia", miles),
    },
    {
      titulo: "Ventas por día frente a su ruta",
      nota: "1,00 = la mediana de su ruta ese mes.",
      datos: tasaTramos(conPlata, [
        { etiqueta: "Menos de 0,80", test: (f) => f.x.bruto_vs_ruta < 0.8 },
        { etiqueta: "0,80 a 0,95", test: (f) => f.x.bruto_vs_ruta >= 0.8 && f.x.bruto_vs_ruta < 0.95 },
        { etiqueta: "0,95 a 1,05", test: (f) => f.x.bruto_vs_ruta >= 0.95 && f.x.bruto_vs_ruta < 1.05 },
        { etiqueta: "1,05 a 1,20", test: (f) => f.x.bruto_vs_ruta >= 1.05 && f.x.bruto_vs_ruta < 1.2 },
        { etiqueta: "1,20 o más", test: (f) => f.x.bruto_vs_ruta >= 1.2 },
      ]),
    },
    {
      titulo: "Días por debajo de la base",
      nota: "Proporción de los días trabajados.",
      datos: tasaTramos(conPlata, [
        { etiqueta: "Ninguno", test: (f) => f.x.pct_bajo_base === 0 },
        { etiqueta: "Hasta 10 %", test: (f) => f.x.pct_bajo_base > 0 && f.x.pct_bajo_base <= 0.1 },
        { etiqueta: "10 a 25 %", test: (f) => f.x.pct_bajo_base > 0.1 && f.x.pct_bajo_base <= 0.25 },
        { etiqueta: "Más de 25 %", test: (f) => f.x.pct_bajo_base > 0.25 },
      ]),
    },
    {
      titulo: "Caída de días trabajados",
      nota: "Frente al promedio de los dos meses previos.",
      datos: tasaTramos(evaluables, [
        { etiqueta: "Sin caída", test: (f) => f.x.caida_dias === 0 },
        { etiqueta: "Hasta 20 %", test: (f) => f.x.caida_dias > 0 && f.x.caida_dias <= 0.2 },
        { etiqueta: "20 a 50 %", test: (f) => f.x.caida_dias > 0.2 && f.x.caida_dias <= 0.5 },
        { etiqueta: "Más de 50 %", test: (f) => f.x.caida_dias > 0.5 },
      ]),
    },
    {
      titulo: "Antigüedad",
      datos: tasaTramos(evaluables, [
        { etiqueta: "Menos de 3 meses", test: (f) => f.x.antig_meses < 3 },
        { etiqueta: "3 a 6 meses", test: (f) => f.x.antig_meses >= 3 && f.x.antig_meses < 6 },
        { etiqueta: "6 a 12 meses", test: (f) => f.x.antig_meses >= 6 && f.x.antig_meses < 12 },
        { etiqueta: "1 a 3 años", test: (f) => f.x.antig_meses >= 12 && f.x.antig_meses < 36 },
        { etiqueta: "3 años o más", test: (f) => f.x.antig_meses >= 36 },
      ]),
    },
  ].filter((t) => t.datos.length > 0);

  // ── Descriptivo: por ruta principal ──
  const porRuta = new Map<string, FilaLiq[]>();
  for (const f of evaluables) if (f.ruta) porRuta.set(f.ruta, [...(porRuta.get(f.ruta) ?? []), f]);
  const rutas: FilaRuta[] = [...porRuta]
    .filter(([, fs]) => fs.length >= 30)
    .map(([ruta, fs]) => {
      const ultimos = meses.filter((m) => m.mes === mesMas(corte, -1) && m.ruta_principal === ruta && m.dias > 0);
      const plata = fs.filter((f) => f.dineroReal);
      return {
        ruta,
        conductores: ultimos.length,
        netoDia: plata.length ? mediana(plata.map((f) => f.x.neto_dia * 1000)) : null,
        diasPromedio: media(fs.map((f) => f.x.dias_m1)),
        tasa: media(fs.map((f) => f.retiro60 as number)),
        n: fs.length,
      };
    })
    .sort((a, b) => b.tasa - a.tasa);

  return {
    corte,
    hoy,
    metricas,
    coeficientes,
    conductores: puntuados,
    flota,
    trayectoria,
    tramos,
    rutas,
    mesesSinValores: flota.filter((m) => !m.conValores && m.conductores > 0).map((m) => m.mes),
    observaciones: evaluables.length,
  };
}
