// Consultas del módulo Operativo. Todas entran por createAdminClient()
// (service_role) desde Server Components y Server Actions: las tablas tienen
// RLS sin políticas y los permisos los valida Gestivo antes.
import { createAdminClient } from "@/lib/supabase/admin";
import { firmarArchivos } from "./archivos";
import {
  conteoPorNivel,
  diasEntre,
  nivelVencimiento,
  peorNivel,
  type DocumentoVehiculo,
  type NivelVencimiento,
  type TipoDocumento,
  type Vencimiento,
  type VehiculoFicha,
} from "./constants";

const SELECT_TIPO = "key, nombre, columna_gema, dias_proximo, dias_critico, orden, activo";
const SELECT_DOCUMENTO =
  "id, codigo_vehiculo, tipo, numero, entidad, fecha_expedicion, fecha_vencimiento, archivo_ruta, archivo_nombre, " +
  "archivo_mime, archivo_tamano, observaciones, created_by_email, created_at, anulado_en, anulado_por_email, motivo_anulacion";
const SELECT_FICHA =
  "codigo, placa, marca, clase, modelo, color, motor, chasis, tipo_carroceria, capacidad_sentado, capacidad_en_pie, ruta, " +
  "estado, numero_tarjeta_op, tarjeta_propiedad, activo_poliza, activo_cartulina, conductor_nombre, cedula_conductor, " +
  "propietario_nombre, cedula_propietario, propietario_admin, fecha_soat, fecha_tecno, fecha_tarjeta_op, fecha_srcc, " +
  "fecha_srce, fecha_full_amparo, fecha_contrato, updated_at";

/** Catálogo de tipos de documento, en su orden. */
export async function getTipos(soloActivos = true): Promise<TipoDocumento[]> {
  const db = createAdminClient();
  let q = db.from("operativo_documento_tipos").select(SELECT_TIPO).order("orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TipoDocumento[];
}

type FilaVista = Omit<Vencimiento, "dias" | "nivel">;

/**
 * Vencimientos de todos los vehículos activos por tipo de documento. La vista
 * entrega la fecha que rige; los días y el nivel se calculan aquí con la
 * fecha de Bogotá y los umbrales del catálogo, para que pantalla, PDF y
 * avisos usen la misma regla.
 */
export async function getVencimientos(hoy: string, codigo?: string): Promise<Vencimiento[]> {
  const db = createAdminClient();
  let q = db.from("vw_operativo_vencimientos").select("*").order("codigo").order("tipo_orden");
  if (codigo) q = q.eq("codigo", codigo);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return ((data ?? []) as FilaVista[]).map((f) => {
    const dias = f.fecha_vigente ? diasEntre(hoy, f.fecha_vigente) : null;
    return { ...f, dias, nivel: nivelVencimiento(dias, f) };
  });
}

export interface VehiculoResumen {
  codigo: string;
  placa: string | null;
  ruta: string | null;
  conductor_nombre: string | null;
  cedula_conductor: string | null;
  peor: NivelVencimiento;
  filas: Vencimiento[];
}

export interface ResumenVencimientos {
  hoy: string;
  filas: Vencimiento[];
  porNivel: Record<NivelVencimiento, number>;
  /** Un vehículo por fila, con su peor nivel, ordenados de más a menos grave. */
  vehiculos: VehiculoResumen[];
}

/**
 * Resumen completo de vencimientos: lo consumen el tablero y la lista de
 * vehículos, y es el punto de enganche de una notificación futura (un cron
 * en `/api/cron/...` con Bearer CRON_SECRET, como `sync-gema`, llamaría esta
 * misma función y decidiría el canal: WhatsApp o correo).
 */
export async function resumenVencimientos(hoy: string): Promise<ResumenVencimientos> {
  const filas = await getVencimientos(hoy);
  const porVehiculo = new Map<string, VehiculoResumen>();
  for (const f of filas) {
    let v = porVehiculo.get(f.codigo);
    if (!v) {
      porVehiculo.set(f.codigo, (v = {
        codigo: f.codigo, placa: f.placa, ruta: f.ruta, conductor_nombre: f.conductor_nombre,
        cedula_conductor: f.cedula_conductor, peor: "al_dia", filas: [],
      }));
    }
    v.filas.push(f);
  }
  const vehiculos = [...porVehiculo.values()].map((v) => ({ ...v, peor: peorNivel(v.filas) }));
  const orden: Record<NivelVencimiento, number> = { sin_dato: 0, vencido: 1, critico: 2, proximo: 3, al_dia: 4 };
  vehiculos.sort((a, b) => orden[a.peor] - orden[b.peor] || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  return { hoy, filas, porNivel: conteoPorNivel(filas), vehiculos };
}

/** Un vehículo del maestro GEMA (activo o no) para la ficha. */
export async function getVehiculoFicha(codigo: string): Promise<VehiculoFicha | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("vehiculos").select(SELECT_FICHA).eq("codigo", codigo).maybeSingle();
  if (error) throw error;
  return (data as VehiculoFicha | null) ?? null;
}

/** Documentos cargados de un vehículo (anulados incluidos), con URL firmada. */
export async function getDocumentosVehiculo(codigo: string): Promise<DocumentoVehiculo[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("operativo_vehiculo_documentos")
    .select(SELECT_DOCUMENTO)
    .eq("codigo_vehiculo", codigo)
    .order("fecha_vencimiento", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const filas = (data ?? []) as unknown as Omit<DocumentoVehiculo, "url">[];
  const urls = await firmarArchivos(filas.map((d) => d.archivo_ruta));
  return filas.map((d) => ({ ...d, url: d.archivo_ruta ? urls.get(d.archivo_ruta) ?? null : null }));
}
