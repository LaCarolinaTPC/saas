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
  quincenaGemaDePeriodo,
  type QuincenaGema,
  type ResultadoCruce,
} from "./calculo";

export const EMPRESA_MGX = "emp0";
export const GRUPO_CONDUCTORES_MGX = "002";
/** El cruce arranca en la 1.ª quincena de octubre de 2026 (período 01043). */
export const INICIO_OTROS_DEVENGADOS = "2026-10-01";

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
  cerrada: boolean;
  quincena: QuincenaGema;
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
  return {
    codigo: p.codigo,
    nombre: p.nombre,
    fecIni,
    fecFin: String(p.fec_fin).slice(0, 10),
    estPer: p.est_per == null ? null : Number(p.est_per),
    lineas,
    cerrada: nominaCerrada(p.est_per == null ? null : Number(p.est_per), lineas),
    quincena: quincenaGemaDePeriodo(fecIni, Number(p.subper)),
  };
}

/**
 * Quincenas de la nómina de conductores (grupo 002) desde octubre de 2026
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
  return Promise.all(filas.map(async (p) => aPeriodo(p, await contarLineas(db, p.codigo))));
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
  if (!p || p.cod_gpa !== GRUPO_CONDUCTORES_MGX) return null;
  if (String(p.fec_ini).slice(0, 10) < INICIO_OTROS_DEVENGADOS) return null;
  return aPeriodo(p, await contarLineas(db, p.codigo));
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
  /** Cierres GEMA que no se pudieron atribuir a una cédula. */
  cierresSinCedula: number;
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
  const vacio: Cruce = { periodo, conceptos: [...conceptos], filas: [], sinNomina: [], entregas: [], cierresSinCedula: 0 };
  if (!periodo.cerrada) return vacio;
  const q = periodo.quincena;

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

  const [lineasPorConcepto, cierres, entregasCaja, entregas] = await Promise.all([
    Promise.all([...conceptos, CONCEPTO_OTROS_DEVENGADOS_MGX, CONCEPTO_ANTICIPO_SALARIO_MGX].map(leerConcepto)),
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
  ]);
  const nomina = lineasPorConcepto.flat();

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
    nombre: string | null;
    enNomina: boolean;
  };
  const porCedula = new Map<string, Acum>();
  const acc = (ced: string) => {
    let a = porCedula.get(ced);
    if (!a) {
      a = { produccion: 0, dias: new Set(), conceptos: {}, m216: 0, m546: 0, caja: 0, otros: 0, nombre: null, enNomina: false };
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
    const res = cruzarQuincena({ produccion: a.produccion, conceptos: a.conceptos, entregado: a.caja + a.otros });
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
    filas,
    sinNomina,
    entregas: entregas.map((e) => ({
      ...e,
      valor_entregado: num(e.valor_entregado),
      otros_devengados: num(e.otros_devengados),
      saldo_antes: num(e.saldo_antes),
      saldo_despues: num(e.saldo_despues),
    })),
    cierresSinCedula,
  };
}
