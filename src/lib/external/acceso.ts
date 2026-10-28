import { createAdminClient } from "@/lib/supabase/admin";
import { EXTERNAL_RESOURCES } from "@/lib/external/resources";
import { type ModuleKey } from "@/lib/permissions-shared";
import { MODULOS } from "@/lib/permisos/catalogo";
import { permisosEfectivos, tieneModulo } from "@/lib/permisos/motor";
import { motorActual, permisosDeUsuario } from "@/lib/permisos/fuente";

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
// MGX (decisión del 2026-10-22): la contabilidad y el almacén, Financiera y
// Tesorería; la nómina y el maestro de empleados, además el módulo Empleados.
// Además, dos módulos de solo datos para dar MGX a roles concretos desde
// Configuración › Usuarios: contabilidad_mgx (comprobantes, cuentas, centros
// de costo, terceros, inventarios y taller) y nomina_mgx (nómina, períodos,
// conceptos y empleados, con salarios). Uno no da el otro.
const MGX_CONTABLE: ModuleKey[] = ["financiera", "tesoreria", "contabilidad_mgx"];
const MGX_NOMINA: ModuleKey[] = ["financiera", "tesoreria", "empleados", "nomina_mgx"];
const MGX_ESTADO: ModuleKey[] = [...new Set([...MGX_CONTABLE, ...MGX_NOMINA])];

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
  // Marcaciones del biométrico: la pantalla «Sin marcación» vive en Ausentismo.
  biometrico_marcaciones: ["ausentismo"],
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
  combustible_tanqueos: ["mantenimiento", "combustible"],
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
  // Dinero de caja: el arqueo y el recaudo de cada cajero.
  totales_cajero: ["tesoreria", "financiera"],
  gema_sync_state: OPERACION_GEMA,
  ingreso_tercero: DINERO_AFILIADO,
  propietarios: DINERO_AFILIADO,
  // Financiera
  vw_financiera_consolidado: ["financiera"],
  vw_financiera_flota_mes: ["financiera"],
  // MGX
  mgx_v_co_movimientos: MGX_CONTABLE,
  mgx_v_co_cabeza: MGX_CONTABLE,
  mgx_v_co_pri_cta: MGX_CONTABLE,
  mgx_v_co_pri_cos: MGX_CONTABLE,
  mgx_v_co_pri_ter: MGX_CONTABLE,
  mgx_v_in_movimientos: MGX_CONTABLE,
  mgx_v_in_catalogo: MGX_CONTABLE,
  mgx_v_in_bodegas: MGX_CONTABLE,
  mgx_v_in_unidades: MGX_CONTABLE,
  mgx_v_no_nomina: MGX_NOMINA,
  mgx_v_no_periodos: MGX_NOMINA,
  mgx_v_no_conceptos: MGX_NOMINA,
  mgx_v_no_catalogos: MGX_NOMINA,
  mgx_v_rh_empleados: MGX_NOMINA,
  mgx_v_estado: MGX_ESTADO,
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
 * Acceso de un rol (el de una clave sk_live_…). Falla cerrado: sin rol o con un
 * rol que ya no existe no se ve nada.
 *
 * Mientras mande el sistema viejo de permisos se lee de `user_types`; en el
 * nuevo, de `roles` y `rol_permisos` (mismas claves): un módulo cuenta si el
 * rol tiene cualquier permiso suyo. Ver src/lib/permisos.
 */
export async function accesoDeTipo(tipo: string | null | undefined): Promise<AccesoDatos> {
  if (!tipo) return SIN_ACCESO;
  const admin = createAdminClient();
  if ((await motorActual(admin)) === "nuevo") {
    const { data: rol } = await admin.from("roles").select("es_super, activo").eq("clave", tipo).maybeSingle();
    if (!rol || !rol.activo) return SIN_ACCESO;
    if (rol.es_super) return ACCESO_TOTAL;
    const { data: rp } = await admin.from("rol_permisos").select("permiso").eq("rol", tipo);
    const ef = permisosEfectivos({ roles: [{ permisos: (rp ?? []).map((x) => String(x.permiso)) }] });
    return { tipo, todos: false, recursos: recursosDeModulos(MODULOS.map((m) => m.clave).filter((m) => tieneModulo(ef, m))) };
  }
  if (tipo === "admin") return ACCESO_TOTAL;
  const { data } = await admin.from("user_types").select("modulos").eq("key", tipo).maybeSingle();
  if (!data) return SIN_ACCESO;
  const modulos = Array.isArray(data.modulos) ? (data.modulos as string[]) : [];
  return { tipo, todos: false, recursos: recursosDeModulos(modulos) };
}

/**
 * Acceso de un usuario de Gestivo: exactamente los módulos que puede abrir en
 * la aplicación (sus roles y sus permisos individuales), con la misma fuente
 * que el proxy y el servidor (src/lib/permisos/fuente.ts). Una persona
 * conectada por OAuth ve los recursos de esos módulos.
 *
 * Distinto de accesoDeTipo, que es el de una clave sk_live_… : una API key es
 * una máquina y no hay persona a la que ajustarle nada.
 *
 * Se calcula en cada llamada, así que un cambio de permisos aplica de
 * inmediato a los agentes ya conectados.
 */
export async function accesoDeUsuario(usuarioId: string): Promise<AccesoDatos> {
  let fuente;
  try {
    fuente = await permisosDeUsuario(createAdminClient(), usuarioId);
  } catch {
    return SIN_ACCESO;
  }
  const tipo = fuente.roles.length ? fuente.roles.join(",") : null;
  if (!tipo) return SIN_ACCESO;
  if (fuente.efectivos.super) return ACCESO_TOTAL;
  return {
    tipo,
    todos: false,
    recursos: recursosDeModulos(MODULOS.map((m) => m.clave).filter((m) => tieneModulo(fuente.efectivos, m))),
  };
}
