/**
 * Capa de datos del módulo de Recuperación de incapacidades (solo servidor).
 *
 * Lee la vista `vw_incapacidad_expedientes` y las tablas de la migración
 * 20260911201033. El expediente nace por trigger desde la matriz EPS: aquí no
 * se crea nada salvo el alta manual, que también corre en la base (RPC).
 *
 * Todo pasa por el service role: las tablas tienen RLS sin políticas y son
 * datos personales. Las lecturas se paginan con .range() y orden estable
 * porque PostgREST corta en 1.000 filas sin avisar.
 */
import { createAdminClient } from "@/lib/supabase/admin";

const PAGINA = 1000;

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Una fila de `vw_incapacidad_expedientes`. */
export interface ExpedienteVista {
  id: string;
  ausentismo_id: string;
  recibido_at: string;
  recibido_desde: "matriz_formulario" | "matriz_excel" | "alta_manual";
  matriz_cambio_pendiente: boolean;
  persona_fuente: "conductores" | "employees" | "sin_resolver" | null;
  salario_base: number | null;
  salario_vigencia_desde: string | null;
  salario_fuente: "manual" | "employees" | null;
  tipo_homologado: string | null;
  entidad_catalogo_id: string | null;
  entidad_nombre_recibido: string | null;
  pendiente_homologacion: boolean;
  modalidad_ajustada: string | null;
  dias_entidad_ajustados: number | null;
  valor_reclamado_ajustado: number | null;
  responsable_email: string | null;
  estado: string;
  motivo_excepcion: string | null;
  valor_reclamado: number | null;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  observaciones: string | null;
  alta_manual_motivo: string | null;
  version: number;
  updated_at: string;
  // De la matriz
  cedula: string;
  nombre: string | null;
  cargo: string | null;
  tipo_conductor: string | null;
  consecutivo_incapacidad: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias_incapacidad: number | null;
  origen: string | null;
  indicador_prorroga: string | null;
  pagador_recibido: string | null;
  cie10: string | null;
  diagnostico: string | null;
  origen_registro: string | null;
  matriz_eliminada_at: string | null;
  // Entidad homologada
  entidad_nombre: string | null;
  entidad_clase: string | null;
  entidad_nit: string | null;
  entidad_dias_min_cobro: number | null;
  cobrable: boolean;
  // Liquidación vigente
  liquidacion_id: string | null;
  regla_codigo: string | null;
  dias_entidad: number | null;
  dias_empresa: number | null;
  valor_total: number | null;
  valor_entidad: number | null;
  valor_empresa: number | null;
  calculado_at: string | null;
  ajustes: number;
  adjuntos: number;
}

export interface FiltrosBandeja {
  estado?: string | null;
  /** id del catálogo de la entidad homologada. */
  entidad?: string | null;
  /** Cédula o parte del nombre. */
  q?: string | null;
  solo?: "pendientes" | "cobrables" | "no_cobrables" | "cambios" | null;
}

export interface ResumenBandeja {
  total: number;
  porEstado: Record<string, number>;
  pendientesHomologacion: number;
  sinSalario: number;
  sinPersona: number;
  cobrables: number;
  noCobrables: number;
  cambiosPendientes: number;
}

export interface Parametro {
  clave: string;
  valor: unknown;
  descripcion: string | null;
  actualizado_por_email: string | null;
  updated_at: string;
}

export interface ReglaFila {
  id: string;
  codigo: string;
  descripcion: string;
  parametros: Record<string, unknown>;
  operativa: boolean;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  aprobado_por_email: string | null;
  aprobado_at: string | null;
}

export interface EntidadCatalogo {
  id: string;
  tipo: "EPS" | "ARL";
  codigo: string | null;
  nombre: string;
  activo: boolean;
  usos: number;
  clase: "EPS" | "ARL" | "OTRA" | null;
  nit: string | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  dias_min_cobro: number | null;
}

export interface LiquidacionFila {
  id: string;
  regla_codigo: string;
  entradas: Record<string, unknown>;
  sobrescrituras: Record<string, unknown>;
  dias_incapacidad: number;
  dias_entidad: number;
  dias_empresa: number;
  factor: number;
  valor_total: number;
  valor_entidad: number;
  valor_empresa: number;
  redondeo: number | null;
  calculado_at: string;
  calculado_por_email: string | null;
  es_vigente: boolean;
}

export interface AjusteFila {
  id: string;
  campo: string;
  nivel: "entrada" | "sobrescritura";
  valor_anterior: unknown;
  valor_nuevo: unknown;
  motivo: string;
  ajustado_por_email: string;
  created_at: string;
}

export interface AdjuntoFila {
  id: string;
  relacionado_tipo: string;
  archivo_nombre: string;
  archivo_mime: string | null;
  archivo_tamano: number | null;
  subido_por_email: string | null;
  created_at: string;
}

export interface BitacoraFila {
  id: string;
  accion: string;
  datos_anteriores: unknown;
  datos_nuevos: unknown;
  user_email: string | null;
  created_at: string;
}

export interface ExpedienteDetalle {
  vista: ExpedienteVista;
  /** La fila de la matriz tal como llegó (recibido_json). */
  recibido: Record<string, unknown>;
  liquidaciones: LiquidacionFila[];
  ajustes: AjusteFila[];
  adjuntos: AdjuntoFila[];
  bitacora: BitacoraFila[];
}

export interface CandidataAltaManual {
  id: string;
  cedula: string;
  nombre: string | null;
  consecutivo_incapacidad: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias_it_pagados: number | null;
  origen: string | null;
  indicador_prorroga: string | null;
  eps: string | null;
  arl: string | null;
  /** Ya tiene expediente (no se puede volver a incorporar). */
  expediente_id: string | null;
}

// ── Lectura ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any;

/** Todas las filas de una consulta, página a página, con orden estable. */
async function todo<T>(armar: (desde: number, hasta: number) => Consulta): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

const TEXTO_SEGURO = /[%,()]/g;

export async function listarExpedientes(f: FiltrosBandeja = {}): Promise<ExpedienteVista[]> {
  const db = createAdminClient();
  return todo<ExpedienteVista>((desde, hasta) => {
    let q = db
      .from("vw_incapacidad_expedientes")
      .select("*")
      .order("recibido_at", { ascending: false })
      .order("id", { ascending: true })
      .range(desde, hasta);
    if (f.estado) q = q.eq("estado", f.estado);
    if (f.entidad) q = q.eq("entidad_catalogo_id", f.entidad);
    if (f.q) {
      const t = f.q.replace(TEXTO_SEGURO, "").trim();
      if (t) q = q.or(`cedula.ilike.%${t}%,nombre.ilike.%${t}%`);
    }
    switch (f.solo) {
      case "pendientes":
        q = q.or("pendiente_homologacion.eq.true,salario_base.is.null,persona_fuente.eq.sin_resolver");
        break;
      case "cobrables":
        q = q.eq("cobrable", true);
        break;
      case "no_cobrables":
        q = q.eq("cobrable", false);
        break;
      case "cambios":
        q = q.eq("matriz_cambio_pendiente", true);
        break;
    }
    return q;
  });
}

export function resumirBandeja(filas: ExpedienteVista[]): ResumenBandeja {
  const porEstado: Record<string, number> = {};
  let pendientesHomologacion = 0, sinSalario = 0, sinPersona = 0, cobrables = 0, noCobrables = 0, cambiosPendientes = 0;
  for (const e of filas) {
    porEstado[e.estado] = (porEstado[e.estado] ?? 0) + 1;
    if (e.pendiente_homologacion) pendientesHomologacion++;
    if (e.salario_base == null) sinSalario++;
    if (e.persona_fuente === "sin_resolver") sinPersona++;
    if (e.cobrable) cobrables++; else noCobrables++;
    if (e.matriz_cambio_pendiente) cambiosPendientes++;
  }
  return { total: filas.length, porEstado, pendientesHomologacion, sinSalario, sinPersona, cobrables, noCobrables, cambiosPendientes };
}

export async function listarParametros(): Promise<Parametro[]> {
  const { data, error } = await createAdminClient()
    .from("incapacidad_parametros")
    .select("clave, valor, descripcion, actualizado_por_email, updated_at")
    .order("clave");
  if (error) throw new Error(error.message);
  return (data ?? []) as Parametro[];
}

/** Fecha de corte de gestión (AAAA-MM-DD) o null si la migración no está aplicada. */
export async function leerCorte(): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("incapacidad_parametros")
    .select("valor")
    .eq("clave", "fecha_corte_gestion")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const v = (data as { valor: unknown } | null)?.valor;
  return typeof v === "string" ? v : null;
}

export async function listarReglas(): Promise<ReglaFila[]> {
  const { data, error } = await createAdminClient()
    .from("incapacidad_reglas")
    .select("id, codigo, descripcion, parametros, operativa, vigente_desde, vigente_hasta, aprobado_por_email, aprobado_at")
    .order("operativa", { ascending: false })
    .order("codigo");
  if (error) throw new Error(error.message);
  return (data ?? []) as ReglaFila[];
}

/** EPS y ARL del catálogo con los campos que exige radicar. */
export async function listarEntidades(): Promise<EntidadCatalogo[]> {
  const { data, error } = await createAdminClient()
    .from("ausentismo_catalogos")
    .select("id, tipo, codigo, nombre, activo, usos, clase, nit, vigente_desde, vigente_hasta, dias_min_cobro")
    .in("tipo", ["EPS", "ARL"])
    .order("tipo")
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []) as EntidadCatalogo[];
}

export async function leerExpediente(id: string): Promise<ExpedienteDetalle | null> {
  const db = createAdminClient();
  const { data: vista, error } = await db
    .from("vw_incapacidad_expedientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!vista) return null;

  const [recibido, liquidaciones, ajustes, adjuntos, bitacora] = await Promise.all([
    db.from("incapacidad_expedientes").select("recibido_json").eq("id", id).maybeSingle(),
    db.from("incapacidad_liquidaciones").select("*").eq("expediente_id", id).order("calculado_at", { ascending: false }).order("id"),
    db.from("incapacidad_ajustes_liquidacion").select("*").eq("expediente_id", id).order("created_at", { ascending: false }).order("id"),
    db.from("incapacidad_adjuntos").select("id, relacionado_tipo, archivo_nombre, archivo_mime, archivo_tamano, subido_por_email, created_at")
      .eq("expediente_id", id).is("anulado_at", null).order("created_at", { ascending: false }),
    db.from("ausentismo_log").select("id, accion, datos_anteriores, datos_nuevos, user_email, created_at")
      .eq("registro_id", id).order("created_at", { ascending: false }).order("id").limit(200),
  ]);
  for (const r of [recibido, liquidaciones, ajustes, adjuntos, bitacora]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    vista: vista as ExpedienteVista,
    recibido: ((recibido.data as { recibido_json: Record<string, unknown> } | null)?.recibido_json ?? {}),
    liquidaciones: (liquidaciones.data ?? []) as LiquidacionFila[],
    ajustes: (ajustes.data ?? []) as AjusteFila[],
    adjuntos: (adjuntos.data ?? []) as AdjuntoFila[],
    bitacora: (bitacora.data ?? []) as BitacoraFila[],
  };
}

/**
 * Incapacidades vigentes de una cédula anteriores al corte, para el alta
 * manual. Incluye las que ya tienen expediente, marcadas, para que RRHH vea
 * por qué no puede incorporarlas otra vez.
 */
export async function buscarCandidatasAltaManual(cedula: string): Promise<CandidataAltaManual[]> {
  const db = createAdminClient();
  const corte = await leerCorte();
  if (!corte) return [];
  const c = cedula.replace(/\D/g, "");
  if (!c) return [];
  const { data, error } = await db
    .from("ausentismo")
    .select("id, cedula, nombre, consecutivo_incapacidad, fecha_inicio, fecha_fin, dias_it_pagados, origen, indicador_prorroga, eps, arl")
    .eq("cedula", c)
    .is("eliminado_at", null)
    .lt("fecha_inicio", corte)
    .order("fecha_inicio", { ascending: false })
    .order("id")
    .limit(200);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Omit<CandidataAltaManual, "expediente_id">[];
  if (filas.length === 0) return [];
  const { data: exps, error: e2 } = await db
    .from("incapacidad_expedientes")
    .select("id, ausentismo_id")
    .in("ausentismo_id", filas.map((f) => f.id));
  if (e2) throw new Error(e2.message);
  const porAusentismo = new Map((exps ?? []).map((x) => [(x as { ausentismo_id: string }).ausentismo_id, (x as { id: string }).id]));
  return filas.map((f) => ({ ...f, expediente_id: porAusentismo.get(f.id) ?? null }));
}

// ── Escritura ────────────────────────────────────────────────────────────────

/** Alta manual: corre en la base (motivo, vigencia y duplicado se validan allí). Devuelve el id del expediente. */
export async function incorporarAltaManual(ausentismoId: string, motivo: string, email: string | null): Promise<string> {
  const { data, error } = await createAdminClient().rpc("incapacidad_alta_manual", {
    p_ausentismo_id: ausentismoId,
    p_motivo: motivo,
    p_email: email,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function guardarCorte(fecha: string, email: string | null): Promise<void> {
  const { error } = await createAdminClient()
    .from("incapacidad_parametros")
    .update({ valor: fecha, actualizado_por_email: email, updated_at: new Date().toISOString() })
    .eq("clave", "fecha_corte_gestion");
  if (error) throw new Error(error.message);
}

export interface CamposEntidad {
  clase: "EPS" | "ARL" | "OTRA" | null;
  nit: string | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  dias_min_cobro: number | null;
}

export async function leerEntidad(id: string): Promise<EntidadCatalogo | null> {
  const { data, error } = await createAdminClient()
    .from("ausentismo_catalogos")
    .select("id, tipo, codigo, nombre, activo, usos, clase, nit, vigente_desde, vigente_hasta, dias_min_cobro")
    .eq("id", id)
    .in("tipo", ["EPS", "ARL"])
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EntidadCatalogo | null) ?? null;
}

export async function guardarEntidad(id: string, campos: CamposEntidad): Promise<void> {
  const { error } = await createAdminClient()
    .from("ausentismo_catalogos")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("tipo", ["EPS", "ARL"]);
  if (error) throw new Error(error.message);
}
