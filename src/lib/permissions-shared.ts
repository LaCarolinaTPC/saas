/** Permisos — parte pura (sin dependencias de servidor), usable en cliente. */

export const ALL_MODULES = [
  "dashboard",
  "accidentabilidad",
  "vacantes",
  "candidatos",
  "empleados",
  "conductores",
  "ausentismo",
  "documentos",
  "campanas",
  "rotacion",
  "tesoreria",
  "rendimiento",
  "liquidacion",
  "liquidacion_conductor_quincena",
  "produccion_conductor",
  "configuracion",
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  accidentabilidad: "Accidentabilidad",
  vacantes: "Vacantes",
  candidatos: "Candidatos",
  empleados: "Empleados",
  conductores: "Conductores",
  ausentismo: "Ausentismo",
  documentos: "Documentos",
  campanas: "Campañas",
  rotacion: "Rotación",
  tesoreria: "Tesorería",
  rendimiento: "Rendimiento del día",
  liquidacion: "Liquidación conductor",
  liquidacion_conductor_quincena: "Liquidación conductor Quincena",
  produccion_conductor: "Producción conductor",
  configuracion: "Configuración",
};

/** Ruta de inicio de cada módulo (destino al redirigir por permisos). */
export const MODULE_HOME: Record<ModuleKey, string> = {
  dashboard: "/",
  accidentabilidad: "/accidentabilidad/consultar",
  vacantes: "/vacantes",
  candidatos: "/candidatos",
  empleados: "/empleados",
  conductores: "/conductores",
  ausentismo: "/ausentismo",
  documentos: "/documentos",
  campanas: "/campanas",
  rotacion: "/rotacion/conductores",
  tesoreria: "/tesoreria/devengados",
  rendimiento: "/rendimiento",
  liquidacion: "/liquidacion",
  liquidacion_conductor_quincena: "/liquidacion-conductor-quincena",
  produccion_conductor: "/produccion-conductor",
  configuracion: "/configuracion",
};

/**
 * Sub-funciones por módulo (permisos granulares dentro de un módulo).
 * `user_types.submodulos` guarda {"tesoreria": ["caja","analisis"]}; si el
 * módulo no aparece en el mapa del tipo, tiene TODAS sus sub-funciones.
 */
export const MODULE_SUBS = {
  tesoreria: ["caja", "analisis", "entregas", "parametros", "auditoria", "simulador"],
} as const;

export type SubmoduleKey<M extends keyof typeof MODULE_SUBS> =
  (typeof MODULE_SUBS)[M][number];

export const SUBMODULE_LABELS: Record<string, string> = {
  caja: "Caja de devengados (aprobar entregas)",
  analisis: "Análisis quincenal (consulta)",
  entregas: "Entregas del día (traslado a GEMA)",
  parametros: "Parámetros (base diaria)",
  auditoria: "Auditoría (registro de transacciones)",
  simulador: "Simulador (cifras hipotéticas, sin datos reales)",
};

/**
 * Sub-funciones sensibles que NUNCA se conceden por defecto: aunque el tipo
 * no restrinja el módulo, estas requieren estar listadas explícitamente.
 * "auditoria" expone PII (cédulas, nombres, valores, emails de operadores);
 * "simulador" se asigna usuario a usuario por decisión de negocio (2026-07-29).
 */
export const SUBS_SENSIBLES = new Set(["auditoria", "simulador"]);

/**
 * Sub-funciones reservadas al administrador: no se conceden a ningún otro
 * tipo, ni siquiera listándolas en submodulos. Hoy no hay ninguna (el
 * simulador dejó de serlo el 2026-07-29); el mecanismo queda para el futuro.
 */
export const SUBS_SOLO_ADMIN = new Set<string>([]);

/**
 * Regla pura de acceso a una sub-función, compartida por el middleware y el
 * servidor: el admin siempre puede; las reservadas solo el admin; si el tipo
 * no restringe el módulo (clave ausente) tiene todas salvo las sensibles.
 */
export function subAllowed(
  submodules: Record<string, string[]>,
  module: string,
  sub: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (SUBS_SOLO_ADMIN.has(sub)) return false;
  const subs = submodules[module];
  if (!Array.isArray(subs)) return !SUBS_SENSIBLES.has(sub);
  return subs.includes(sub);
}

/** Ruta de inicio de cada sub-función (destino al redirigir por permisos). */
export const SUB_HOME: Record<string, string> = {
  caja: "/tesoreria/devengados",
  analisis: "/tesoreria/devengados/analisis",
  entregas: "/tesoreria/devengados/entregas",
  parametros: "/tesoreria/devengados/parametros",
  auditoria: "/tesoreria/devengados/auditoria",
  simulador: "/tesoreria/devengados/simulador",
};

/** Mapea una ruta del menú a su sub-función dentro del módulo (o null). */
export function hrefToSubmodule(href: string): string | null {
  if (href.startsWith("/tesoreria/devengados/analisis")) return "analisis";
  if (href.startsWith("/tesoreria/devengados/entregas")) return "entregas";
  if (href.startsWith("/tesoreria/devengados/parametros")) return "parametros";
  if (href.startsWith("/tesoreria/devengados/auditoria")) return "auditoria";
  if (href.startsWith("/tesoreria/devengados/simulador")) return "simulador";
  if (href.startsWith("/tesoreria/devengados")) return "caja";
  return null;
}

/** Mapea una ruta del menú a su clave de módulo. */
export function hrefToModule(href: string): ModuleKey | null {
  if (href === "/") return "dashboard";
  if (href.startsWith("/accidentabilidad")) return "accidentabilidad";
  if (href.startsWith("/vacantes")) return "vacantes";
  if (href.startsWith("/candidatos")) return "candidatos";
  if (href.startsWith("/contratacion")) return "candidatos";
  if (href.startsWith("/empleados")) return "empleados";
  if (href.startsWith("/conductores")) return "conductores";
  if (href.startsWith("/ausentismo")) return "ausentismo";
  if (href.startsWith("/documentos")) return "documentos";
  if (href.startsWith("/campanas")) return "campanas";
  if (href.startsWith("/rotacion")) return "rotacion";
  if (href.startsWith("/tesoreria")) return "tesoreria";
  if (href.startsWith("/rendimiento")) return "rendimiento";
  if (href.startsWith("/liquidacion-conductor-quincena")) return "liquidacion_conductor_quincena";
  if (href.startsWith("/liquidacion")) return "liquidacion";
  if (href.startsWith("/produccion-conductor")) return "produccion_conductor";
  if (href.startsWith("/configuracion")) return "configuracion";
  if (href.startsWith("/integraciones")) return "configuracion";
  return null;
}
