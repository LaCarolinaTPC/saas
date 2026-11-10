/**
 * Otros devengados · lectura de datos para la pantalla y las acciones.
 *
 * Recibe el cliente de Supabase como parámetro (service_role) para no
 * depender de la sesión: lo usan la página, las Server Actions y, si hace
 * falta, los scripts. La regla del cruce está en ./calculo.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONCEPTO_ANTICIPO_SALARIO_MGX,
  CONCEPTO_OTROS_DEVENGADOS_MGX,
  CONCEPTOS_DEVENGO_DEFECTO,
  cruzarQuincena,
  nominaCerrada,
  novedadSuma,
  quincenaGema,
  quincenaGemaDePeriodo,
  INICIO_OTROS_DEVENGADOS,
  claveCorte,
  corteAnterior,
  cortesHasta,
  type QuincenaGema,
  type ResultadoCruce,
  type TipoNovedad,
} from "./calculo";
import { compararNomina, type ComparacionNomina, type LineaComparable } from "./nomina-excel";

export { INICIO_OTROS_DEVENGADOS };

export const EMPRESA_MGX = "emp0";
export const GRUPO_CONDUCTORES_MGX = "002";

const PAGE = 1000;
const num = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lee todas las páginas de una consulta (PostgREST recorta a 1.000 filas). */
async function todas<T>(
  armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await armar(desde, desde + PAGE - 1);
    if (error) throw error;
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < PAGE) break;
  }
  return out;
}

export interface PeriodoNomina {
  codigo: string;
  nombre: string;
  fecIni: string;
  fecFin: string;
  estPer: number | null;
  lineas: number;
  /** Hay nómina para cruzar: cerrada en MGX o cargada por Excel. */
  cerrada: boolean;
  /** La nómina del período está cerrada en MGX. Desde ahí manda MGX. */
  cerradaMgx: boolean;
  /** De dónde salen los conceptos del cruce. */
  origen: "mgx" | "excel";
  /** Cargue activo de nómina por Excel del corte, si lo hay. */
  carga: CargaNomina | null;
  quincena: QuincenaGema;
}

/** Cargue del listado de nómina exportado de MGX para un corte. */
export interface CargaNomina {
  id: string;
  periodo: string;
  quincena: 1 | 2;
  cod_per: string;
  nom_per: string | null;
  archivo: string | null;
  lineas: number;
  empleados: number;
  cargada_por_email: string | null;
  created_at: string;
}

/**
 * Cargues activos de nómina por Excel. Si la tabla todavía no existe (la
 * migración se aplica a mano), devuelve vacío para no tumbar la pantalla.
 */
export async function listarCargasNomina(db: SupabaseClient): Promise<CargaNomina[]> {
  const { data, error } = await db
    .from("otros_devengados_nomina_cargas")
    .select("id, periodo, quincena, cod_per, nom_per, archivo, lineas, empleados, cargada_por_email, created_at")
    .eq("estado", "activa")
    .gte("periodo", INICIO_OTROS_DEVENGADOS.slice(0, 7))
    .order("periodo", { ascending: false })
    .order("quincena", { ascending: false });
  if (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")) return [];
    throw error;
  }
  return ((data ?? []) as CargaNomina[]).filter((c) => quincenaGema(c.periodo, c.quincena).ini >= INICIO_OTROS_DEVENGADOS);
}

/** Con nómina cerrada en MGX manda MGX; si no, el cargue por Excel si existe. */
function conCarga(p: PeriodoNomina, cargas: CargaNomina[]): PeriodoNomina {
  const carga = cargas.find((c) => claveCorte(c) === claveCorte(p.quincena)) ?? null;
  if (!carga) return p;
  return p.cerradaMgx ? { ...p, carga } : { ...p, carga, origen: "excel", cerrada: true };
}

/** Período de un corte que solo tiene nómina por Excel (aún no existe en MGX). */
function periodoDeCarga(c: CargaNomina): PeriodoNomina {
  const q = quincenaGema(c.periodo, c.quincena);
  return {
    codigo: c.cod_per,
    nombre: c.nom_per ?? `Nómina cargada por Excel ${c.periodo} Q${c.quincena}`,
    fecIni: q.ini,
    fecFin: q.fin,
    estPer: null,
    lineas: c.lineas,
    cerrada: true,
    cerradaMgx: false,
    origen: "excel",
    carga: c,
    quincena: q,
  };
}

type PeriodoRow = {
  codigo: string;
  nombre: string;
  fec_ini: string;
  fec_fin: string;
  est_per: number | null;
  cod_gpa: string;
  subper: number;
};

async function contarLineas(db: SupabaseClient, codPer: string): Promise<number> {
  const { count, error } = await db
    .from("mgx_v_no_nomina")
    .select("cod_epl", { count: "exact", head: true })
    .eq("empresa", EMPRESA_MGX)
    .eq("cod_per", codPer);
  if (error) throw error;
  return count ?? 0;
}

function aPeriodo(p: PeriodoRow, lineas: number): PeriodoNomina {
  const fecIni = String(p.fec_ini).slice(0, 10);
  const cerradaMgx = nominaCerrada(p.est_per == null ? null : Number(p.est_per), lineas);
  return {
    codigo: p.codigo,
    nombre: p.nombre,
    fecIni,
    fecFin: String(p.fec_fin).slice(0, 10),
    estPer: p.est_per == null ? null : Number(p.est_per),
    lineas,
    cerrada: cerradaMgx,
    cerradaMgx,
    origen: "mgx",
    carga: null,
    quincena: quincenaGemaDePeriodo(fecIni, Number(p.subper)),
  };
}

/**
 * Quincenas de la nómina de conductores (grupo 002) desde el primer corte
 * hasta hoy, la más reciente primero, con su estado de cierre en MGX.
 */
export async function listarPeriodos(db: SupabaseClient, hoy: string): Promise<PeriodoNomina[]> {
  const { data, error } = await db
    .from("mgx_v_no_periodos")
    .select("codigo, nombre, fec_ini, fec_fin, est_per, cod_gpa, subper")
    .eq("empresa", EMPRESA_MGX)
    .eq("cod_gpa", GRUPO_CONDUCTORES_MGX)
    .gte("fec_ini", INICIO_OTROS_DEVENGADOS)
    .lte("fec_ini", hoy)
    .order("fec_ini", { ascending: false })
    .order("codigo", { ascending: false });
  if (error) throw error;
  const filas = (data ?? []) as PeriodoRow[];
  const [mgx, cargas] = await Promise.all([
    Promise.all(filas.map(async (p) => aPeriodo(p, await contarLineas(db, p.codigo)))),
    listarCargasNomina(db),
  ]);
  const conMgx = new Set(mgx.map((p) => claveCorte(p.quincena)));
  const soloExcel = cargas.filter((c) => !conMgx.has(claveCorte(c)) && quincenaGema(c.periodo, c.quincena).ini <= hoy);
  return [...mgx.map((p) => conCarga(p, cargas)), ...soloExcel.map(periodoDeCarga)].sort(
    (a, b) => b.quincena.ini.localeCompare(a.quincena.ini) || b.codigo.localeCompare(a.codigo)
  );
}

export async function getPeriodo(db: SupabaseClient, codPer: string): Promise<PeriodoNomina | null> {
  const { data, error } = await db
    .from("mgx_v_no_periodos")
    .select("codigo, nombre, fec_ini, fec_fin, est_per, cod_gpa, subper")
    .eq("empresa", EMPRESA_MGX)
    .eq("codigo", codPer)
    .maybeSingle();
  if (error) throw error;
  const p = data as PeriodoRow | null;
  const cargas = await listarCargasNomina(db);
  if (!p) {
    // El período todavía no existe en MGX: vale si hay un cargue por Excel de él.
    const carga = cargas.find((c) => c.cod_per === codPer);
    return carga ? periodoDeCarga(carga) : null;
  }
  if (p.cod_gpa !== GRUPO_CONDUCTORES_MGX) return null;
  if (String(p.fec_ini).slice(0, 10) < INICIO_OTROS_DEVENGADOS) return null;
  return conCarga(aPeriodo(p, await contarLineas(db, p.codigo)), cargas);
}

export interface NovedadOtros {
  id: string;
  periodo: string;
  quincena: number;
  cedula_conductor: string;
  codigo_conductor: string | null;
  conductor_nombre: string | null;
  tipo: TipoNovedad;
  fecha: string | null;
  cantidad: number | null;
  valor: number;
  observacion: string | null;
  origen: "operativo" | "excel" | "gema";
  carga_id: string | null;
  archivo: string | null;
  estado: "activa" | "anulada";
  anulada_motivo: string | null;
  registrada_por_email: string | null;
  created_at: string;
}

const COLS_NOVEDAD =
  "id, periodo, quincena, cedula_conductor, codigo_conductor, conductor_nombre, tipo, fecha, cantidad, valor, observacion, origen, carga_id, archivo, estado, anulada_motivo, registrada_por_email, created_at";

/** Novedades de una quincena GEMA (activas y, si se pide, anuladas). */
export async function listarNovedades(
  db: SupabaseClient,
  q: { periodo: string; quincena: number },
  opciones: { incluirAnuladas?: boolean; tipos?: readonly TipoNovedad[] } = {}
): Promise<NovedadOtros[]> {
  const filas = await todas<NovedadOtros>((d, h) => {
    let c = db
      .from("otros_devengados_novedades")
      .select(COLS_NOVEDAD)
      .eq("periodo", q.periodo)
      .eq("quincena", q.quincena);
    if (!opciones.incluirAnuladas) c = c.eq("estado", "activa");
    if (opciones.tipos?.length) c = c.in("tipo", [...opciones.tipos]);
    return c.order("created_at", { ascending: false }).order("id", { ascending: true }).range(d, h);
  });
  return filas.map((n) => ({ ...n, valor: num(n.valor), cantidad: n.cantidad == null ? null : num(n.cantidad) }));
}

export interface CierreCorte {
  periodo: string;
  quincena: number;
  cod_per: string | null;
  estado: "cerrado" | "reabierto";
  totales: Record<string, number>;
  cerrado_at: string;
  cerrado_por_email: string | null;
  reabierto_at: string | null;
  reabierto_por_email: string | null;
  reabierto_motivo: string | null;
}

/** Registro de cierre del corte (cerrado o reabierto), o null si nunca se cerró. */
export async function getCierre(db: SupabaseClient, q: { periodo: string; quincena: number }): Promise<CierreCorte | null> {
  const { data, error } = await db
    .from("otros_devengados_cortes")
    .select("periodo, quincena, cod_per, estado, totales, cerrado_at, cerrado_por_email, reabierto_at, reabierto_por_email, reabierto_motivo")
    .eq("periodo", q.periodo)
    .eq("quincena", q.quincena)
    .maybeSingle();
  if (error) throw error;
  return (data as CierreCorte | null) ?? null;
}

export async function corteCerrado(db: SupabaseClient, q: { periodo: string; quincena: number }): Promise<boolean> {
  return (await getCierre(db, q))?.estado === "cerrado";
}

/**
 * Corte que ya empezó pero cuya nómina todavía no existe en MGX: no hay cruce
 * ni entregas, pero Tesorería ya puede ir cargando el casino. Cuando llegue la
 * nómina, el cruce toma esas novedades porque van por corte, no por período.
 */
export interface CorteSinNomina {
  corte: QuincenaGema;
  /** Casino activo del corte cargado por Excel. */
  casino: NovedadOtros[];
  /** Pérdidas y devoluciones activas que ya registró Operativo en el corte. */
  registrosOperativo: number;
  cerrado: boolean;
}

export async function cargarCortesSinNomina(
  db: SupabaseClient,
  hoy: string,
  periodos: PeriodoNomina[]
): Promise<CorteSinNomina[]> {
  const conNomina = new Set(periodos.map((p) => claveCorte(p.quincena)));
  const cortes = cortesHasta(hoy).filter((c) => !conNomina.has(claveCorte(c)));
  return Promise.all(
    cortes.map(async (corte) => {
      const [novedades, cerrado] = await Promise.all([listarNovedades(db, corte), corteCerrado(db, corte)]);
      return {
        corte,
        casino: novedades.filter((n) => n.tipo === "casino" && n.origen === "excel"),
        registrosOperativo: novedades.filter((n) => ["perdida_turno", "perdida_viaje", "devolucion_viaje"].includes(n.tipo)).length,
        cerrado,
      };
    })
  );
}

/** Conductores activos del maestro, para prellenar una plantilla sin nómina. */
export async function listarConductoresActivos(
  db: SupabaseClient
): Promise<{ cedula: string; nombre: string | null; codigo: string | null }[]> {
  return todas((d, h) =>
    db
      .from("conductores")
      .select("cedula, nombre, codigo")
      .eq("estado", "ACTIVO")
      .order("nombre", { ascending: true })
      .order("cedula", { ascending: true })
      .range(d, h)
  );
}

/** El corte anterior está cerrado (o no hay anterior porque es el primero). */
export async function anteriorCerrado(db: SupabaseClient, q: { periodo: string; quincena: number }): Promise<boolean> {
  const ant = corteAnterior(q);
  return ant ? corteCerrado(db, ant) : true;
}

export interface FilaCruce extends ResultadoCruce {
  cedula: string;
  codigo: string | null;
  nombre: string | null;
  estado: string | null;
  fechaRetiro: string | null;
  dias: number;
  conceptos: Record<string, number>;
  entregadoCaja: number;
  entregadoOtros: number;
  /** Valor de cada novedad activa de la quincena, por tipo (positivo). */
  novedades: Partial<Record<TipoNovedad, number>>;
  /** Referencia: lo que MGX registró en 216 y 546 (positivo). */
  mgx216: number;
  mgx546: number;
}

export interface SinNomina {
  cedula: string;
  codigo: string | null;
  nombre: string | null;
  estado: string | null;
  produccion: number;
  dias: number;
}

export interface EntregaOtros {
  id: string;
  fecha: string;
  cedula_conductor: string;
  codigo_conductor: string | null;
  conductor_nombre: string | null;
  valor_entregado: number;
  otros_devengados: number;
  saldo_antes: number;
  saldo_despues: number;
  observacion: string | null;
  estado: "activa" | "anulada";
  anulada_motivo: string | null;
  anulada_at: string | null;
  anulada_por_email: string | null;
  registrada_por_email: string | null;
  created_at: string;
}

export interface Cruce {
  periodo: PeriodoNomina;
  conceptos: string[];
  /** Conductores con nómina de conductores en el período. */
  filas: FilaCruce[];
  /** Con producción GEMA pero sin nómina del grupo 002 (no entran al cruce). */
  sinNomina: SinNomina[];
  entregas: EntregaOtros[];
  novedades: NovedadOtros[];
  /** Cierre del corte (null = nunca se ha cerrado). */
  cierre: CierreCorte | null;
  /** Corte anterior (null si este es el primero) y si ya está cerrado. */
  anterior: QuincenaGema | null;
  anteriorCerrado: boolean;
  /** Novedades de conductores que no están en el cruce (no se aplican). */
  novedadesSinCruce: NovedadOtros[];
  /** Cierres GEMA que no se pudieron atribuir a una cédula. */
  cierresSinCedula: number;
  /** Nómina cargada por Excel contra la cerrada en MGX (null si falta alguna). */
  comparacion: ComparacionNomina | null;
}

type LineaNomina = { cod_epl: string; nom_epl: string | null; cod_con: string; valor: number | string };
type Cierre = {
  cedula_conductor: string | null;
  cod_conductor: string | null;
  conductor_nombre: string | null;
  fecha: string;
  salario_neto_dia: number | string | null;
};
type Conductor = { cedula: string; nombre: string | null; codigo: string | null; estado: string | null; fecha_retiro: string | null };

/**
 * Cruce de una quincena: producción GEMA − devengos de la nómina MGX − lo ya
 * entregado (por esta opción y por Caja devengados). Solo tiene sentido con la
 * nómina cerrada; si no lo está, devuelve el período sin filas.
 */
export async function cargarCruce(
  db: SupabaseClient,
  periodo: PeriodoNomina,
  conceptos: readonly string[] = CONCEPTOS_DEVENGO_DEFECTO
): Promise<Cruce> {
  const anterior = corteAnterior(periodo.quincena);
  const [cierre, antCerrado] = await Promise.all([getCierre(db, periodo.quincena), anteriorCerrado(db, periodo.quincena)]);
  const vacio: Cruce = {
    periodo,
    conceptos: [...conceptos],
    filas: [],
    sinNomina: [],
    entregas: [],
    novedades: [],
    cierre,
    anterior,
    anteriorCerrado: antCerrado,
    novedadesSinCruce: [],
    cierresSinCedula: 0,
    comparacion: null,
  };
  // Con la nómina abierta no hay cruce, pero sí se muestran las novedades
  // (Operativo y el casino se registran antes del cierre).
  if (!periodo.cerrada) {
    const nov = await listarNovedades(db, periodo.quincena);
    return { ...vacio, novedades: nov, novedadesSinCruce: [] };
  }
  const q = periodo.quincena;

  const leerExcel = (cargaId: string, cods: readonly string[]) =>
    todas<LineaNomina>((d, h) =>
      db
        .from("otros_devengados_nomina_lineas")
        .select("cod_epl, nom_epl, cod_con, valor")
        .eq("carga_id", cargaId)
        .in("cod_con", [...cods])
        .order("id", { ascending: true })
        .range(d, h)
    );
  const leerConcepto = (cod: string) =>
    todas<LineaNomina>((d, h) =>
      db
        .from("mgx_v_no_nomina")
        .select("cod_epl, nom_epl, cod_con, valor")
        .eq("empresa", EMPRESA_MGX)
        .eq("cod_per", periodo.codigo)
        .eq("cod_con", cod)
        .order("cod_epl", { ascending: true })
        .order("num_doc", { ascending: true })
        .range(d, h)
    );

  const [lineasPorConcepto, cierres, entregasCaja, entregas, novedades] = await Promise.all([
    periodo.origen === "excel" && periodo.carga
      ? leerExcel(periodo.carga.id, [...conceptos, CONCEPTO_OTROS_DEVENGADOS_MGX, CONCEPTO_ANTICIPO_SALARIO_MGX]).then((l) => [l])
      : Promise.all([...conceptos, CONCEPTO_OTROS_DEVENGADOS_MGX, CONCEPTO_ANTICIPO_SALARIO_MGX].map(leerConcepto)),
    todas<Cierre>((d, h) =>
      db
        .from("cierres_diarios")
        .select("cedula_conductor, cod_conductor, conductor_nombre, fecha, salario_neto_dia")
        .gte("fecha", q.ini)
        .lte("fecha", q.fin)
        .order("fecha", { ascending: true })
        .order("cod_conductor", { ascending: true })
        .order("id", { ascending: true })
        .range(d, h)
    ),
    todas<{ cedula_conductor: string; valor_entregado: number | string }>((d, h) =>
      db
        .from("devengados_entregas")
        .select("cedula_conductor, valor_entregado")
        .eq("periodo", q.periodo)
        .eq("quincena", q.quincena)
        .eq("movimiento", "DEBITO")
        .eq("estado", "activa")
        .order("id", { ascending: true })
        .range(d, h)
    ),
    todas<EntregaOtros>((d, h) =>
      db
        .from("otros_devengados_entregas")
        .select(
          "id, fecha, cedula_conductor, codigo_conductor, conductor_nombre, valor_entregado, otros_devengados, saldo_antes, saldo_despues, observacion, estado, anulada_motivo, anulada_at, anulada_por_email, registrada_por_email, created_at"
        )
        .eq("periodo", q.periodo)
        .eq("quincena", q.quincena)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(d, h)
    ),
    listarNovedades(db, q),
  ]);
  const nomina = lineasPorConcepto.flat();

  // Con la nómina ya cerrada en MGX y un cargue por Excel del corte, se compara.
  let comparacion: ComparacionNomina | null = null;
  if (periodo.origen === "mgx" && periodo.carga) {
    const comparable = (l: LineaNomina): LineaComparable => ({ cedula: l.cod_epl, nombre: l.nom_epl, concepto: l.cod_con, valor: num(l.valor) });
    const excel = await leerExcel(periodo.carga.id, conceptos);
    comparacion = compararNomina(excel.map(comparable), nomina.map(comparable), conceptos);
  }

  // Cierres sin cédula: se resuelven por código contra la maestra.
  const codigos = [...new Set(cierres.filter((c) => !c.cedula_conductor && c.cod_conductor).map((c) => c.cod_conductor!))];
  const codigoACedula = new Map<string, string>();
  for (let i = 0; i < codigos.length; i += 300) {
    const { data, error } = await db.from("conductores").select("cedula, codigo").in("codigo", codigos.slice(i, i + 300));
    if (error) throw error;
    for (const c of data ?? []) codigoACedula.set(c.codigo as string, c.cedula as string);
  }

  type Acum = {
    produccion: number;
    dias: Set<string>;
    conceptos: Record<string, number>;
    m216: number;
    m546: number;
    caja: number;
    otros: number;
    nov: Partial<Record<TipoNovedad, number>>;
    nombre: string | null;
    enNomina: boolean;
  };
  const porCedula = new Map<string, Acum>();
  const acc = (ced: string) => {
    let a = porCedula.get(ced);
    if (!a) {
      a = { produccion: 0, dias: new Set(), conceptos: {}, m216: 0, m546: 0, caja: 0, otros: 0, nov: {}, nombre: null, enNomina: false };
      porCedula.set(ced, a);
    }
    return a;
  };

  let cierresSinCedula = 0;
  for (const c of cierres) {
    const ced = c.cedula_conductor ?? (c.cod_conductor ? codigoACedula.get(c.cod_conductor) : undefined);
    if (!ced) {
      cierresSinCedula += 1;
      continue;
    }
    const a = acc(ced);
    a.produccion += num(c.salario_neto_dia);
    a.dias.add(c.fecha);
    a.nombre ??= c.conductor_nombre;
  }
  const devengo = new Set(conceptos);
  for (const l of nomina) {
    const a = acc(l.cod_epl);
    a.nombre ??= l.nom_epl;
    if (devengo.has(l.cod_con)) {
      a.enNomina = true;
      a.conceptos[l.cod_con] = r2((a.conceptos[l.cod_con] ?? 0) + num(l.valor));
    } else if (l.cod_con === CONCEPTO_OTROS_DEVENGADOS_MGX) a.m216 += num(l.valor);
    else if (l.cod_con === CONCEPTO_ANTICIPO_SALARIO_MGX) a.m546 += -num(l.valor);
  }
  for (const e of entregasCaja) acc(e.cedula_conductor).caja += num(e.valor_entregado);
  for (const e of entregas) {
    if (e.estado === "activa") acc(e.cedula_conductor).otros += num(e.valor_entregado);
  }

  for (const n of novedades) {
    const a = acc(n.cedula_conductor);
    a.nov[n.tipo] = r2((a.nov[n.tipo] ?? 0) + n.valor);
    a.nombre ??= n.conductor_nombre;
  }

  const cedulas = [...porCedula.keys()];
  const maestro = new Map<string, Conductor>();
  for (let i = 0; i < cedulas.length; i += 300) {
    const { data, error } = await db
      .from("conductores")
      .select("cedula, nombre, codigo, estado, fecha_retiro")
      .in("cedula", cedulas.slice(i, i + 300));
    if (error) throw error;
    for (const c of (data ?? []) as Conductor[]) maestro.set(c.cedula, c);
  }

  const filas: FilaCruce[] = [];
  const sinNomina: SinNomina[] = [];
  for (const ced of cedulas) {
    const a = porCedula.get(ced)!;
    const m = maestro.get(ced);
    if (!a.enNomina) {
      if (a.produccion > 0) {
        sinNomina.push({
          cedula: ced,
          codigo: m?.codigo ?? null,
          nombre: m?.nombre ?? a.nombre,
          estado: m?.estado ?? null,
          produccion: r2(a.produccion),
          dias: a.dias.size,
        });
      }
      continue;
    }
    let descuentos = 0;
    let devoluciones = 0;
    for (const [t, v] of Object.entries(a.nov) as [TipoNovedad, number][]) {
      if (novedadSuma(t)) devoluciones += v;
      else descuentos += v;
    }
    const res = cruzarQuincena({ produccion: a.produccion, conceptos: a.conceptos, entregado: a.caja + a.otros, descuentos, devoluciones });
    filas.push({
      ...res,
      cedula: ced,
      codigo: m?.codigo ?? null,
      nombre: m?.nombre ?? a.nombre,
      estado: m?.estado ?? null,
      fechaRetiro: m?.fecha_retiro ?? null,
      dias: a.dias.size,
      conceptos: a.conceptos,
      entregadoCaja: r2(a.caja),
      entregadoOtros: r2(a.otros),
      novedades: a.nov,
      mgx216: r2(a.m216),
      mgx546: r2(a.m546),
    });
  }
  const porNombre = (x: { nombre: string | null }, y: { nombre: string | null }) =>
    (x.nombre ?? "").localeCompare(y.nombre ?? "", "es");
  filas.sort(porNombre);
  sinNomina.sort(porNombre);

  return {
    periodo,
    conceptos: [...conceptos],
    cierre,
    anterior,
    anteriorCerrado: antCerrado,
    filas,
    sinNomina,
    entregas: entregas.map((e) => ({
      ...e,
      valor_entregado: num(e.valor_entregado),
      otros_devengados: num(e.otros_devengados),
      saldo_antes: num(e.saldo_antes),
      saldo_despues: num(e.saldo_despues),
    })),
    novedades,
    novedadesSinCruce: novedades.filter((n) => !filas.some((f) => f.cedula === n.cedula_conductor)),
    cierresSinCedula,
    comparacion,
  };
}

/**
 * Quita del cruce lo que solo pueden ver Nómina y los administradores
 * (producción, días, conceptos de nómina, otros devengados brutos, anticipo
 * de salario y referencia MGX), para que no viaje al navegador de quien
 * solo entrega. Quedan las novedades, el disponible, lo entregado y el saldo.
 */
export function ocultarDetalle(c: Cruce): Cruce {
  return {
    ...c,
    conceptos: [],
    comparacion: c.comparacion && { ...c.comparacion, conceptos: [], diferencias: [] },
    filas: c.filas.map((f) => ({
      ...f,
      produccion: 0,
      nominaDevengo: 0,
      generado: 0,
      otrosDevengados: 0,
      anticipo: 0,
      dias: 0,
      conceptos: {},
      mgx216: 0,
      mgx546: 0,
    })),
    sinNomina: c.sinNomina.map((s) => ({ ...s, produccion: 0, dias: 0 })),
    entregas: c.entregas.map((e) => ({ ...e, otros_devengados: 0 })),
    cierre: c.cierre ? { ...c.cierre, totales: {} } : null,
  };
}
