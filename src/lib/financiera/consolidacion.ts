/**
 * Consolidación de Financiera — capa de datos sobre las funciones SQL de la
 * migración 20260921140156 (`financiera_consolidar_abiertos`,
 * `financiera_reabrir_periodo`) y lectura de períodos y bitácora.
 *
 * Toda la lógica de agregar el espejo a mes vive en SQL (acta 2026-09-18,
 * punto 14: función SQL, no bucle en TypeScript). Aquí solo se invoca, se
 * tipa el resultado y se leen las tablas del módulo con el service role.
 * Solo servidor: server actions, rutas de cron y server components.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { EstadoPeriodo } from "./motor";

// ── Resultado de una corrida ─────────────────────────────────────────────────

export interface PeriodoConsolidado {
  periodo: string;
  omitido: boolean;
  motivo?: string;
  filas: number;
  borradas: number;
  vehiculos: number;
  viajes: number;
  timbradas: number;
  ingresos: number;
  gastosGema: number;
}

export interface ResultadoConsolidacion {
  marcaGema: string | null;
  periodos: PeriodoConsolidado[];
  cerrados: string[];
  duracionMs: number;
}

type RpcPeriodo = {
  periodo: string;
  omitido?: boolean;
  motivo?: string;
  filas?: number;
  borradas?: number;
  vehiculos?: number;
  viajes?: number | string;
  timbradas?: number | string;
  ingresos?: number | string;
  gastos_gema?: number | string;
};

type RpcConsolidar = {
  marca_gema: string | null;
  periodos: RpcPeriodo[];
  cierre?: { marca_gema: string | null; cerrados: string[] };
  motivo?: string;
};

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Consolida desde `ingreso_tercero` todos los meses no cerrados (del primero
 * del espejo al mes del marcador de GEMA) y cierra los que GEMA ya pasó.
 * Idempotente: correrla dos veces seguidas da lo mismo. `email` queda en la
 * bitácora (`financiera_cargas.usuario_email`); el cron pasa "cron".
 */
export async function consolidarAbiertos(email: string | null): Promise<ResultadoConsolidacion> {
  const t0 = Date.now();
  const db = createAdminClient();
  const { data, error } = await db.rpc("financiera_consolidar_abiertos", { p_email: email });
  if (error) throw new Error(`No se pudo consolidar: ${error.message}`);
  const r = (data ?? {}) as RpcConsolidar;
  return {
    marcaGema: r.marca_gema ?? null,
    periodos: (r.periodos ?? []).map((p) => ({
      periodo: p.periodo,
      omitido: Boolean(p.omitido),
      motivo: p.motivo,
      filas: num(p.filas),
      borradas: num(p.borradas),
      vehiculos: num(p.vehiculos),
      viajes: num(p.viajes),
      timbradas: num(p.timbradas),
      ingresos: num(p.ingresos),
      gastosGema: num(p.gastos_gema),
    })),
    cerrados: r.cierre?.cerrados ?? [],
    duracionMs: Date.now() - t0,
  };
}

/**
 * Reabre un período cerrado. Solo el administrador (sub-función
 * fin_parametros); la función SQL exige motivo y toma una versión antes.
 */
export async function reabrirPeriodo(periodo: string, email: string, motivo: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.rpc("financiera_reabrir_periodo", {
    p_periodo: periodo,
    p_email: email,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export interface PeriodoFila {
  periodo: string;
  estado: EstadoPeriodo;
  consolidadoAt: string | null;
  cerradoAt: string | null;
  cerradoPor: string | null;
  reabiertoAt: string | null;
  reabiertoPorEmail: string | null;
  motivoReapertura: string | null;
  /** De vw_financiera_flota_mes; null si el mes aún no se consolidó. */
  vehiculos: number | null;
  vehiculosConContable: number | null;
  coberturaContable: "completo" | "parcial" | "sin_dato" | null;
  viajes: number | null;
  timbradas: number | null;
  ingresos: number | null;
  gastosGema: number | null;
  gastosContables: number | null;
  utilidadNeta: number | null;
  rentabilidad: number | null;
  gastosPorTimbrada: number | null;
  productividad: number | null;
}

export async function listarPeriodos(): Promise<PeriodoFila[]> {
  const db = createAdminClient();
  const [{ data: periodos, error: e1 }, { data: flota, error: e2 }] = await Promise.all([
    db
      .from("financiera_periodos")
      .select("periodo, estado, consolidado_at, cerrado_at, cerrado_por, reabierto_at, reabierto_por_email, motivo_reapertura")
      .order("periodo", { ascending: false })
      .range(0, 999),
    db
      .from("vw_financiera_flota_mes")
      .select(
        "periodo, vehiculos, vehiculos_con_contable, cobertura_contable, viajes, timbradas, ingresos, gastos_gema, gastos_contables, utilidad_neta, rentabilidad, gastos_por_timbrada, productividad"
      )
      .range(0, 999),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  type Flota = {
    periodo: string;
    vehiculos: number;
    vehiculos_con_contable: number;
    cobertura_contable: PeriodoFila["coberturaContable"];
    viajes: string | number;
    timbradas: string | number;
    ingresos: string | number;
    gastos_gema: string | number;
    gastos_contables: string | number;
    utilidad_neta: string | number;
    rentabilidad: string | number;
    gastos_por_timbrada: string | number;
    productividad: string | number;
  };
  const porPeriodo = new Map<string, Flota>();
  for (const f of (flota ?? []) as Flota[]) porPeriodo.set(f.periodo, f);

  type Periodo = {
    periodo: string;
    estado: EstadoPeriodo;
    consolidado_at: string | null;
    cerrado_at: string | null;
    cerrado_por: string | null;
    reabierto_at: string | null;
    reabierto_por_email: string | null;
    motivo_reapertura: string | null;
  };
  return ((periodos ?? []) as Periodo[]).map((p) => {
    const f = porPeriodo.get(p.periodo);
    return {
      periodo: p.periodo,
      estado: p.estado,
      consolidadoAt: p.consolidado_at,
      cerradoAt: p.cerrado_at,
      cerradoPor: p.cerrado_por,
      reabiertoAt: p.reabierto_at,
      reabiertoPorEmail: p.reabierto_por_email,
      motivoReapertura: p.motivo_reapertura,
      vehiculos: f ? num(f.vehiculos) : null,
      vehiculosConContable: f ? num(f.vehiculos_con_contable) : null,
      coberturaContable: f?.cobertura_contable ?? null,
      viajes: f ? num(f.viajes) : null,
      timbradas: f ? num(f.timbradas) : null,
      ingresos: f ? num(f.ingresos) : null,
      gastosGema: f ? num(f.gastos_gema) : null,
      gastosContables: f ? num(f.gastos_contables) : null,
      utilidadNeta: f ? num(f.utilidad_neta) : null,
      rentabilidad: f ? num(f.rentabilidad) : null,
      gastosPorTimbrada: f ? num(f.gastos_por_timbrada) : null,
      productividad: f ? num(f.productividad) : null,
    };
  });
}

export type TipoCarga =
  | "consolidar_gema"
  | "cerrar_periodo"
  | "reabrir_periodo"
  | "cargar_contable"
  | "reversar_contable"
  | "cambiar_parametro";

export interface CargaFila {
  id: string;
  tipo: TipoCarga;
  periodo: string | null;
  usuarioEmail: string | null;
  archivoNombre: string | null;
  filas: number;
  detalle: Record<string, unknown>;
  createdAt: string;
}

/** Últimas operaciones de la bitácora, más recientes primero. */
export async function ultimasCargas(limite = 40, tipos?: TipoCarga[]): Promise<CargaFila[]> {
  const db = createAdminClient();
  let q = db
    .from("financiera_cargas")
    .select("id, tipo, periodo, usuario_email, archivo_nombre, filas, detalle, created_at")
    .order("created_at", { ascending: false })
    .range(0, Math.max(0, Math.min(limite, 1000) - 1));
  if (tipos && tipos.length) q = q.in("tipo", tipos);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  type Fila = {
    id: string;
    tipo: TipoCarga;
    periodo: string | null;
    usuario_email: string | null;
    archivo_nombre: string | null;
    filas: number;
    detalle: Record<string, unknown> | null;
    created_at: string;
  };
  return ((data ?? []) as Fila[]).map((c) => ({
    id: c.id,
    tipo: c.tipo,
    periodo: c.periodo,
    usuarioEmail: c.usuario_email,
    archivoNombre: c.archivo_nombre,
    filas: c.filas ?? 0,
    detalle: c.detalle ?? {},
    createdAt: c.created_at,
  }));
}

/** Marcador del sync de ingreso_tercero: la fecha que decide qué mes se cierra. */
export async function marcaGema(): Promise<{ fecha: string | null; corridoAt: string | null }> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("gema_sync_state")
    .select("last_synced_date, last_run_at")
    .eq("dataset", "ingreso_tercero")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    fecha: (data?.last_synced_date as string | null) ?? null,
    corridoAt: (data?.last_run_at as string | null) ?? null,
  };
}
