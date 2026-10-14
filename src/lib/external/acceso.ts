import { createAdminClient } from "@/lib/supabase/admin";
import { EXTERNAL_RESOURCES } from "@/lib/external/resources";
import {
  modulosEfectivos,
  normalizarIndividuales,
  type ModuleKey,
} from "@/lib/permissions-shared";

// Qué recursos de la lista blanca ve cada credencial del MCP y de la Data API.
//
// La regla es la misma de la aplicación: un tipo de usuario (rol) ve los datos
// de los módulos que tiene. Un usuario conectado por OAuth usa su propio tipo
// MÁS sus permisos individuales; una clave sk_live_… usa el tipo que se le
// asignó al crearla, sin ajustes (es una máquina, no una persona). El
// administrador ve todo. Se calcula en cada llamada, así que un cambio de rol
// o de permisos se aplica de inmediato a los agentes ya conectados.

/**
 * Módulos que dan acceso a cada recurso: basta con tener uno. Los datos de
 * GEMA no son de un solo módulo: la operación la usan Rotación, Operativo,
 * Tesorería y Financiera; el dinero del afiliado (ingreso_tercero,
 * propietarios), solo Tesorería y Financiera (decisión del 2026-09-30).
 * `null` = cualquier tipo de usuario válido (catálogos sin datos personales).
 *
 * Todo recurso de EXTERNAL_RESOURCES debe estar aquí: uno ausente solo lo ve
 * el administrador (falla cerrado), y el verificador del catálogo lo reporta.
 */
const OPERACION_GEMA: ModuleKey[] = ["rotacion", "operativo", "tesoreria", "financiera"];
const DINERO_AFILIADO: ModuleKey[] = ["tesoreria", "financiera"];

export const MODULOS_POR_RECURSO: Record<string, ModuleKey[] | null> = {
  // Rotación
  conductores_con_grupo: ["rotacion", "conductores"],
  cierres_diarios: ["rotacion", "tesoreria", "financiera"],
  viajes_perdidos: ["rotacion"],
  // Ausentismo e incapacidades
  ausentismo: ["ausentismo", "incapacidades"],
  ausentismo_registros: ["ausentismo"],
  ausentismo_conceptos: ["ausentismo"],
  ausentismo_notificaciones: ["ausentismo"],
  ausentismo_catalogos: ["ausentismo"],
  // Accidentabilidad
  accidentes: ["accidentabilidad"],
  accidente_evaluaciones: ["accidentabilidad"],
  accidente_eventos: ["accidentabilidad"],
  accidente_vehiculos: ["accidentabilidad"],
  // Reclutamiento y personal
  candidates: ["candidatos"],
  vacancies: ["vacantes", "candidatos"],
  candidate_vacancy: ["candidatos"],
  stage_history: ["candidatos"],
  procesos_contratacion: ["candidatos"],
  employees: ["empleados"],
  documents: ["documentos"],
  familia: ["empleados"],
  incentivos: ["empleados"],
  // Campañas
  meta_campaigns: ["campanas"],
  meta_spend_daily: ["campanas"],
  // Catálogo de departamentos: sin datos personales.
  departments: null,
  // Tesorería
  devengados_entregas: ["tesoreria"],
  // Riesgo predictivo
  riesgo_corridas: ["riesgo"],
  riesgo_conductores: ["riesgo"],
  // Operativo
  vehiculos: ["operativo", "mantenimiento", "rotacion", "tesoreria", "financiera"],
  velocidades: ["operativo"],
  pv_deltas: ["operativo", "rotacion"],
  operativo_documento_tipos: ["operativo"],
  operativo_vehiculo_documentos: ["operativo"],
  operativo_velocidad_reportes: ["operativo"],
  operativo_velocidad_parametros: ["operativo"],
  operativo_preoperacional: ["operativo"],
  operativo_preoperacional_fallas: ["operativo"],
  // Mantenimiento
  mantenimiento_reportes: ["mantenimiento"],
  camaras_revisiones: ["mantenimiento", "camaras"],
  camaras_tipos_novedad: ["mantenimiento", "camaras"],
  mantenimiento_alertas: ["mantenimiento"],
  mantenimiento_frenos: ["mantenimiento"],
  mantenimiento_conceptos: ["mantenimiento"],
  // GEMA
  puntos_virtuales: OPERACION_GEMA,
  viajes_recaudados: OPERACION_GEMA,
  timbradas_descontadas: OPERACION_GEMA,
  tickets_transfer: OPERACION_GEMA,
  anotaciones_viajes: OPERACION_GEMA,
  historico_despacho: OPERACION_GEMA,
  cumplimientos: OPERACION_GEMA,
  abonos: OPERACION_GEMA,
  programacion: OPERACION_GEMA,
  gema_sync_state: OPERACION_GEMA,
  ingreso_tercero: DINERO_AFILIADO,
  propietarios: DINERO_AFILIADO,
  // Financiera
  vw_financiera_consolidado: ["financiera"],
  vw_financiera_flota_mes: ["financiera"],
};

export type AccesoDatos = {
  /** Tipo de usuario con el que se calculó; null = ninguno válido. */
  tipo: string | null;
  todos: boolean;
  recursos: ReadonlySet<string>;
};

export const SIN_ACCESO: AccesoDatos = { tipo: null, todos: false, recursos: new Set() };

export const ACCESO_TOTAL: AccesoDatos = {
  tipo: "admin",
  todos: true,
  recursos: new Set(EXTERNAL_RESOURCES.map((r) => r.name)),
};

/** Recursos que dan los módulos de un tipo de usuario. Regla pura. */
export function recursosDeModulos(modulos: readonly string[]): Set<string> {
  const tiene = new Set(modulos);
  const recursos = new Set<string>();
  for (const r of EXTERNAL_RESOURCES) {
    const requeridos = MODULOS_POR_RECURSO[r.name];
    if (requeridos === undefined) continue;
    if (requeridos === null || requeridos.some((m) => tiene.has(m))) recursos.add(r.name);
  }
  return recursos;
}

export function puedeVer(acceso: AccesoDatos, recurso: string): boolean {
  return acceso.todos || acceso.recursos.has(recurso);
}

/**
 * Acceso de un tipo de usuario, leído de user_types. Falla cerrado: sin tipo o
 * con un tipo que ya no existe no se ve nada.
 */
export async function accesoDeTipo(tipo: string | null | undefined): Promise<AccesoDatos> {
  if (!tipo) return SIN_ACCESO;
  if (tipo === "admin") return ACCESO_TOTAL;
  const admin = createAdminClient();
  const { data } = await admin.from("user_types").select("modulos").eq("key", tipo).maybeSingle();
  if (!data) return SIN_ACCESO;
  const modulos = Array.isArray(data.modulos) ? (data.modulos as string[]) : [];
  return { tipo, todos: false, recursos: recursosDeModulos(modulos) };
}

/**
 * Acceso de un usuario de Gestivo: su tipo (profiles.user_type) MÁS sus
 * permisos individuales. Una persona conectada por OAuth ve exactamente los
 * recursos de los módulos que puede abrir en la aplicación.
 *
 * Distinto de accesoDeTipo, que es el de una clave sk_live_… : una API key es
 * una máquina y no hay persona a la que ajustarle nada.
 *
 * Se calcula en cada llamada, así que un ajuste de permisos aplica de
 * inmediato a los agentes ya conectados.
 */
export async function accesoDeUsuario(usuarioId: string): Promise<AccesoDatos> {
  const admin = createAdminClient();
  // select("*"): permisos_individuales puede no existir aún (ver permissions.ts).
  const { data: perfil } = await admin
    .from("profiles")
    .select("*")
    .eq("id", usuarioId)
    .maybeSingle();

  const tipo = perfil?.user_type ?? null;
  if (!tipo) return SIN_ACCESO;
  if (tipo === "admin") return ACCESO_TOTAL;

  const { data } = await admin
    .from("user_types")
    .select("modulos")
    .eq("key", tipo)
    .maybeSingle();
  if (!data) return SIN_ACCESO;

  const individuales = normalizarIndividuales(perfil?.permisos_individuales);
  return {
    tipo,
    todos: false,
    recursos: recursosDeModulos(modulosEfectivos(data.modulos, individuales)),
  };
}
