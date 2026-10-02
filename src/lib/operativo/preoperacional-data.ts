// Consultas de la revisión preoperacional. Entran por createAdminClient()
// (service_role) desde Server Components y Server Actions, como el resto de
// Operativo: las tablas tienen RLS sin políticas y Gestivo valida el permiso.
import { createAdminClient } from "@/lib/supabase/admin";
import { getVencimientos } from "./data";
import type { DocumentoPreop, ResultadoPreop } from "./preoperacional-reglas";

const PAGINA = 1000;

/** Lee todas las páginas: PostgREST corta en 1.000 filas aunque se pida más. */
async function paginar<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  tope = 20000,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

export interface VehiculoPreop {
  codigo: string;
  placa: string | null;
  marca: string | null;
  clase: string | null;
  modelo: string | null;
  ruta: string | null;
  conductor_nombre: string | null;
  cedula_conductor: string | null;
}

export interface ConductorPreop {
  cedula: string;
  nombre: string;
  codigo: string | null;
}

export interface FallaGuardada {
  item_key: string;
  critico: boolean;
  nota: string | null;
  concepto: string | null;
  mantenimiento_reporte_id: string | null;
}

export interface RevisionPreop {
  id: string;
  fecha: string;
  codigo_vehiculo: string;
  placa: string | null;
  cedula_conductor: string | null;
  conductor_nombre: string | null;
  resultado: ResultadoPreop;
  fallas: number;
  fallas_criticas: number;
  documentos_vencidos: number;
  documentos: DocumentoPreop[];
  observaciones: string | null;
  version_lista: string;
  duracion_seg: number | null;
  inspector_email: string | null;
  created_at: string;
  detalle: FallaGuardada[];
}

const SELECT_REVISION =
  "id, fecha, codigo_vehiculo, placa, cedula_conductor, conductor_nombre, resultado, fallas, fallas_criticas, " +
  "documentos_vencidos, documentos, observaciones, version_lista, duracion_seg, inspector_email, created_at, " +
  "detalle:operativo_preoperacional_fallas(item_key, critico, nota, concepto, mantenimiento_reporte_id)";

/** Vehículos activos (`estado = 1` en el maestro que sincroniza GEMA). */
export async function getVehiculosPreop(): Promise<VehiculoPreop[]> {
  const db = createAdminClient();
  return paginar<VehiculoPreop>((a, b) =>
    db.from("vehiculos")
      .select("codigo, placa, marca, clase, modelo, ruta, conductor_nombre, cedula_conductor")
      .eq("estado", 1)
      .order("codigo")
      .range(a, b));
}

export async function getConductoresPreop(): Promise<ConductorPreop[]> {
  const db = createAdminClient();
  return paginar<ConductorPreop>((a, b) =>
    db.from("conductores").select("cedula, nombre, codigo").eq("estado", "ACTIVO").order("nombre").range(a, b));
}

/** Vigencia de los documentos de cada vehículo hoy, por código. */
export async function getDocumentosPreop(hoy: string, codigo?: string): Promise<Record<string, DocumentoPreop[]>> {
  const filas = await getVencimientos(hoy, codigo);
  const porCodigo: Record<string, DocumentoPreop[]> = {};
  for (const f of filas) {
    (porCodigo[f.codigo] ??= []).push({
      tipo: f.tipo, nombre: f.tipo_nombre, nivel: f.nivel, fecha: f.fecha_vigente, dias: f.dias,
    });
  }
  return porCodigo;
}

export async function getRevisionesDia(fecha: string): Promise<RevisionPreop[]> {
  const db = createAdminClient();
  return paginar<RevisionPreop>((a, b) =>
    db.from("operativo_preoperacional")
      .select(SELECT_REVISION)
      .eq("fecha", fecha)
      .order("created_at", { ascending: false })
      .range(a, b));
}

export async function getHistorialPreop(filtro: {
  desde: string;
  hasta: string;
  codigo?: string | null;
  resultado?: ResultadoPreop | null;
}): Promise<RevisionPreop[]> {
  const db = createAdminClient();
  return paginar<RevisionPreop>((a, b) => {
    let q = db.from("operativo_preoperacional")
      .select(SELECT_REVISION)
      .gte("fecha", filtro.desde)
      .lte("fecha", filtro.hasta);
    if (filtro.codigo) q = q.eq("codigo_vehiculo", filtro.codigo);
    if (filtro.resultado) q = q.eq("resultado", filtro.resultado);
    return q.order("fecha", { ascending: false }).order("created_at", { ascending: false }).range(a, b);
  });
}
