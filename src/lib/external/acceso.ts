import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXTERNAL_RESOURCES } from "@/lib/external/resources";
import { type ModuleKey } from "@/lib/permissions-shared";
import { MODULOS } from "@/lib/permisos/catalogo";
import { permisosEfectivos, tieneModulo } from "@/lib/permisos/motor";
import { CONTRASTE_MS, contrasteDeUsuario, motorActual, permisosDeUsuario, type Motor } from "@/lib/permisos/fuente";
import { anotarIncidencia, chequear } from "@/lib/permisos/registro";

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
  // Recobros (docs/modulos/recobros.md): solo Tesorería.
  tesoreria_camaras_solicitudes: ["tesoreria"],
  tesoreria_camaras_recobro_gestiones: ["tesoreria"],
  tesoreria_recobro_correcciones: ["tesoreria"],
  tesoreria_recobro_resultados: ["tesoreria"],
  // Riesgo predictivo
  riesgo_corridas: ["riesgo"],
  riesgo_conductores: ["riesgo"],
  // Operativo
  vehiculos: ["operativo", "mantenimiento", "rotacion", "tesoreria", "financiera"],
  velocidades: ["operativo"],
  pv_deltas: ["operativo", "rotacion"],
  // GPS de GEMA (docs/gps-gema.md). Los bloqueos del sensor de pasajeros son
  // además la materia del control de cámaras y sensores.
  gps_kilometraje: ["operativo", "rotacion", "mantenimiento"],
  gps_bloqueos: ["operativo", "rotacion", "mantenimiento", "camaras"],
  gps_eventos: ["operativo", "rotacion", "mantenimiento"],
  gps_ultimas_posiciones: ["operativo", "rotacion", "mantenimiento"],
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
 * rol tiene cualquier permiso suyo. Ver src/lib/permisos. Mientras corren los
 * dos, se lee también el otro y se anota cada módulo en que difieren.
 */
export async function accesoDeTipo(tipo: string | null | undefined): Promise<AccesoDatos> {
  if (!tipo) return SIN_ACCESO;
  const admin = createAdminClient();
  const motor = await motorActual(admin);
  const decide = motor === "nuevo" ? await modulosDeTipoNuevo(admin, tipo) : await modulosDeTipoViejo(admin, tipo);
  if (motor !== "viejo") {
    try {
      after(() => compararTipo(admin, motor, tipo, decide));
    } catch {
      // Fuera de una petición (pruebas): no se compara.
    }
  }
  if (!decide) return SIN_ACCESO;
  if (decide.todos) return ACCESO_TOTAL;
  return { tipo, todos: false, recursos: recursosDeModulos(decide.modulos) };
}

type ModulosDeTipo = { todos: boolean; modulos: string[] } | null;
type Db = ReturnType<typeof createAdminClient>;

export interface RolParaLlave {
  key: string;
  nombre: string;
}

/**
 * Los roles que se le pueden asignar a una clave `sk_live_…`, de la MISMA
 * fuente con que `accesoDeTipo` decide su acceso: los roles activos del
 * sistema nuevo cuando manda `nuevo`, `user_types` antes. Así un rol creado
 * en la pantalla nueva se puede elegir, y no se puede elegir uno que la clave
 * no encontraría (se quedaría sin datos).
 */
export async function rolesParaLlaves(admin: Db = createAdminClient()): Promise<RolParaLlave[]> {
  const motor = await motorActual(admin);
  if (motor === "nuevo") {
    const { data, error } = await admin.from("roles").select("clave, nombre").eq("activo", true).order("nombre");
    if (error) throw new Error(`leer roles: ${error.message}`);
    return (data ?? []).map((r) => ({ key: String(r.clave), nombre: String(r.nombre ?? r.clave) }));
  }
  const { data, error } = await admin.from("user_types").select("key, nombre").order("nombre");
  if (error) throw new Error(`leer tipos de usuario: ${error.message}`);
  return (data ?? []).map((t) => ({ key: String(t.key), nombre: String(t.nombre ?? t.key) }));
}

async function modulosDeTipoNuevo(admin: Db, tipo: string): Promise<ModulosDeTipo> {
  const { data: rol } = await admin.from("roles").select("es_super, activo").eq("clave", tipo).maybeSingle();
  if (!rol || !rol.activo) return null;
  if (rol.es_super) return { todos: true, modulos: [] };
  const { data: rp } = await admin.from("rol_permisos").select("permiso").eq("rol", tipo);
  const ef = permisosEfectivos({ roles: [{ permisos: (rp ?? []).map((x) => String(x.permiso)) }] });
  return { todos: false, modulos: MODULOS.map((m) => m.clave).filter((m) => tieneModulo(ef, m)) };
}

async function modulosDeTipoViejo(admin: Db, tipo: string): Promise<ModulosDeTipo> {
  if (tipo === "admin") return { todos: true, modulos: [] };
  const { data } = await admin.from("user_types").select("modulos").eq("key", tipo).maybeSingle();
  if (!data) return null;
  return { todos: false, modulos: Array.isArray(data.modulos) ? (data.modulos as string[]) : [] };
}

const comparadosTipo = new Map<string, number>();

/** Anota los módulos en que el otro sistema difiere para este rol. Una vez cada `CONTRASTE_MS` por rol; nunca lanza. */
async function compararTipo(admin: Db, motor: Motor, tipo: string, decide: ModulosDeTipo): Promise<void> {
  const k = `${motor}|${tipo}`;
  if (Date.now() - (comparadosTipo.get(k) ?? 0) < CONTRASTE_MS) return;
  comparadosTipo.set(k, Date.now());
  try {
    const otro = motor === "nuevo" ? await modulosDeTipoViejo(admin, tipo) : await modulosDeTipoNuevo(admin, tipo);
    const [viejo, nuevo] = motor === "nuevo" ? [otro, decide] : [decide, otro];
    const todos = MODULOS.map((m) => m.clave as string);
    const de = (x: ModulosDeTipo) => new Set(x ? (x.todos ? todos : x.modulos) : []);
    const v = de(viejo);
    const n = de(nuevo);
    for (const m of todos) {
      if (v.has(m) === n.has(m)) continue;
      anotarIncidencia({
        tipo: v.has(m) ? "divergencia_perdido" : "divergencia_ganado",
        userId: null,
        clave: m,
        origen: "api_externa",
        viejo: v.has(m),
        nuevo: n.has(m),
        motor,
        rolViejo: tipo,
        rolesNuevos: [tipo],
        detalle: { credencial: "api_key", tipo },
      });
    }
  } catch (e) {
    anotarIncidencia({
      tipo: "error_lectura_nuevo",
      userId: null,
      clave: tipo,
      origen: "api_externa",
      motor,
      detalle: { credencial: "api_key", mensaje: e instanceof Error ? e.message : String(e) },
    });
  }
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
  const db = createAdminClient();
  let fuente;
  try {
    fuente = await permisosDeUsuario(db, usuarioId);
  } catch (e) {
    anotarIncidencia({
      tipo: "error_lectura",
      userId: usuarioId,
      clave: "-",
      origen: "api_externa",
      motor: null,
      detalle: { mensaje: e instanceof Error ? e.message : String(e) },
    });
    return SIN_ACCESO;
  }
  const tipo = fuente.roles.length ? fuente.roles.join(",") : null;
  if (!tipo) return SIN_ACCESO;
  if (fuente.efectivos.super) return ACCESO_TOTAL;
  // Cada módulo pasa por el registro: mientras corren los dos sistemas se
  // anota si el otro daría otra cosa (src/lib/permisos/incidencias.ts).
  const contraste = await contrasteDeUsuario(db, usuarioId, fuente);
  const ctx = {
    userId: usuarioId,
    email: (fuente.perfil?.email as string | null | undefined) ?? null,
    motor: fuente.motor,
    efectivos: fuente.efectivos,
    contraste,
    rolViejo: contraste?.rolViejo ?? null,
    rolesNuevos: contraste?.rolesNuevos ?? [],
  };
  return {
    tipo,
    todos: false,
    recursos: recursosDeModulos(
      MODULOS.map((m) => m.clave).filter((m) => chequear(ctx, m, (ef) => tieneModulo(ef, m), { origen: "api_externa" }))
    ),
  };
}
