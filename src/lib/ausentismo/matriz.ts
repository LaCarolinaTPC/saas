/** Capa de datos de la Matriz de Ausentismo (solo servidor). */
import { createAdminClient } from "@/lib/supabase/admin";
import { clave } from "./matriz-reglas";
import type { FilaIndicador } from "./indicadores";

export const TIPOS_CATALOGO = [
  "ORIGEN", "GRD", "EPS", "ARL", "AFP", "IPS", "PROFESIONAL", "CIE10", "CIE10_LETRA",
] as const;
export type TipoCatalogo = (typeof TIPOS_CATALOGO)[number];

export interface CatalogoItem {
  id: string;
  tipo: TipoCatalogo;
  /** CIE10: código. ORIGEN: EG/EL/AT/LM/LP. CIE10_LETRA: la letra. */
  codigo: string | null;
  /** CIE10: diagnóstico. CIE10_LETRA: GRD que propone la letra. */
  nombre: string;
  /** CIE10: GRD. PROFESIONAL: IPS habitual. */
  relacionado: string | null;
  activo: boolean;
  verificado: boolean;
  usos: number;
}

export type Catalogos = Record<TipoCatalogo, CatalogoItem[]>;

export interface MatrizFila {
  id: string;
  consecutivo_incapacidad: string | null;
  cedula: string;
  nombre: string | null;
  cargo: string | null;
  indicador_prorroga: string | null;
  dias_it_pagados: number | null;
  origen: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mes_inicio: string | null;
  dia_ocurrencia: string | null;
  eps: string | null;
  arl: string | null;
  ips: string | null;
  profesional_responsable: string | null;
  tipo_conductor: string | null;
  estado: string | null;
  cie10: string | null;
  diagnostico: string | null;
  soat: string | null;
  grd: string | null;
  estado_registro: "pendiente" | "cerrado";
  origen_registro: "excel" | "formulario";
  revision: string[];
  abierto_por_email: string | null;
  cerrado_por_email: string | null;
  cerrado_at: string | null;
  modificado_por_email: string | null;
  motivo_modificacion: string | null;
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

export const MATRIZ_SELECT =
  "id, consecutivo_incapacidad, cedula, nombre, cargo, indicador_prorroga, dias_it_pagados, " +
  "origen, fecha_inicio, fecha_fin, mes_inicio, dia_ocurrencia, eps, arl, ips, " +
  "profesional_responsable, tipo_conductor, estado, cie10, diagnostico, soat, grd, " +
  "estado_registro, origen_registro, revision, abierto_por_email, cerrado_por_email, " +
  "cerrado_at, modificado_por_email, motivo_modificacion, source_file, created_at, updated_at";

export interface FiltrosMatriz {
  desde: string;
  hasta: string;
  eps?: string | null;
  origen?: string | null;
  /** pendiente | cerrado */
  estado?: string | null;
  /** Solo filas con marcas de revisión. */
  revision?: boolean;
  /** Cédula (prefijo) o nombre. */
  q?: string | null;
}

/** Filas de la matriz por rango de fecha de inicio, con filtros opcionales. */
export async function getMatriz(f: FiltrosMatriz): Promise<MatrizFila[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("ausentismo")
    .select(MATRIZ_SELECT)
    .gte("fecha_inicio", f.desde)
    .lte("fecha_inicio", f.hasta)
    .order("fecha_inicio", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  // La ARL está en ambos campos (eps y arl) por compatibilidad: basta con eps.
  if (f.eps) query = query.eq("eps", f.eps);
  if (f.origen) query = query.eq("origen", f.origen);
  if (f.estado === "pendiente" || f.estado === "cerrado") {
    query = query.eq("estado_registro", f.estado);
  }
  if (f.revision) query = query.neq("revision", "{}");
  if (f.q) {
    const q = f.q.trim();
    if (/^\d+$/.test(q)) query = query.like("cedula", `${q}%`);
    else query = query.ilike("nombre", `%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  // El select es una cadena compuesta: el tipado de supabase-js no la interpreta.
  return (data ?? []) as unknown as MatrizFila[];
}

/** Filtros de la pestaña Indicadores: la segmentación del dashboard y sus exportaciones. */
export interface FiltrosIndicadores {
  desde: string;
  hasta: string;
  origen?: string | null;
  eps?: string | null;
  tipoConductor?: string | null;
  /** pendiente | cerrado | null (todos). */
  estado?: string | null;
}

const INDICADORES_SELECT =
  "fecha_inicio, dias_it_pagados, indicador_prorroga, origen, eps, arl, ips, " +
  "profesional_responsable, cie10, diagnostico, grd, cedula, nombre, cargo, tipo_conductor";

/**
 * Filas de la matriz para los indicadores, solo las columnas que se agregan y
 * sin tope práctico: el dashboard debe ver toda la matriz del rango.
 */
export async function getFilasIndicadores(f: FiltrosIndicadores): Promise<FilaIndicador[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("ausentismo")
    .select(INDICADORES_SELECT)
    .gte("fecha_inicio", f.desde)
    .lte("fecha_inicio", f.hasta)
    .order("fecha_inicio", { ascending: true })
    .limit(20000);
  if (f.eps) query = query.eq("eps", f.eps);
  if (f.origen) query = query.eq("origen", f.origen);
  if (f.tipoConductor) query = query.eq("tipo_conductor", f.tipoConductor);
  if (f.estado === "pendiente" || f.estado === "cerrado") query = query.eq("estado_registro", f.estado);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as FilaIndicador[];
}

/** Trabajadores activos del maestro, base de la tasa de ausentismo. */
export async function getConductoresActivos(): Promise<number | null> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("conductores")
    .select("cedula", { count: "exact", head: true })
    .eq("estado", "ACTIVO");
  if (error) return null;
  return count ?? null;
}

/**
 * Catálogo completo agrupado por tipo, activos e inactivos, ordenado por uso.
 * Los inactivos hacen falta para etiquetar filas viejas; el cliente filtra.
 */
export async function getCatalogosMatriz(): Promise<Catalogos> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ausentismo_catalogos")
    .select("id, tipo, codigo, nombre, relacionado, activo, verificado, usos")
    .order("usos", { ascending: false })
    .order("nombre")
    .limit(5000);
  if (error) throw error;
  const out = Object.fromEntries(TIPOS_CATALOGO.map((t) => [t, []])) as unknown as Catalogos;
  for (const c of (data ?? []) as CatalogoItem[]) out[c.tipo]?.push(c);
  return out;
}

/**
 * Con qué IPS ha aparecido cada profesional en la matriz, por clave del
 * profesional (sin tildes ni mayúsculas), ordenado de más a menos veces.
 * El formulario lo usa para avisar cuando se elige un profesional con una IPS
 * en la que nunca ha figurado: un profesional puede atender en varias, así
 * que es un aviso y no un bloqueo.
 */
export type ParesProfesionalIps = Record<string, { ips: string; n: number }[]>;

export async function getParesProfesionalIps(): Promise<ParesProfesionalIps> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ausentismo")
    .select("profesional_responsable, ips")
    .not("profesional_responsable", "is", null)
    .not("ips", "is", null)
    .limit(20000);
  if (error) throw error;

  const conteo = new Map<string, Map<string, { ips: string; n: number }>>();
  for (const r of (data ?? []) as { profesional_responsable: string; ips: string }[]) {
    const kp = clave(r.profesional_responsable);
    const ki = clave(r.ips);
    if (!kp || !ki) continue;
    let porIps = conteo.get(kp);
    if (!porIps) conteo.set(kp, (porIps = new Map()));
    const acc = porIps.get(ki);
    if (acc) acc.n += 1;
    else porIps.set(ki, { ips: r.ips, n: 1 });
  }
  const out: ParesProfesionalIps = {};
  for (const [kp, porIps] of conteo) {
    out[kp] = [...porIps.values()].sort((a, b) => b.n - a.n || a.ips.localeCompare(b.ips, "es"));
  }
  return out;
}

export interface ResumenMatriz {
  total: number;
  pendientes: number;
  enRevision: number;
  formulario: number;
}

/** Contadores de cabecera de la pestaña (toda la matriz, sin filtros). */
export async function getResumenMatriz(): Promise<ResumenMatriz> {
  const supabase = createAdminClient();
  const base = () => supabase.from("ausentismo").select("id", { count: "exact", head: true });
  const [total, pendientes, revision, formulario] = await Promise.all([
    base(),
    base().eq("estado_registro", "pendiente"),
    base().neq("revision", "{}"),
    base().eq("origen_registro", "formulario"),
  ]);
  return {
    total: total.count ?? 0,
    pendientes: pendientes.count ?? 0,
    enRevision: revision.count ?? 0,
    formulario: formulario.count ?? 0,
  };
}
