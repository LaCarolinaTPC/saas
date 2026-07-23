/** Permisos — parte pura (sin dependencias de servidor), usable en cliente. */

export const ALL_MODULES = [
  "dashboard",
  "accidentabilidad",
  "vacantes",
  "candidatos",
  "empleados",
  "conductores",
  "documentos",
  "campanas",
  "rotacion",
  "tesoreria",
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
  documentos: "Documentos",
  campanas: "Campañas",
  rotacion: "Rotación",
  tesoreria: "Tesorería",
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
  documentos: "/documentos",
  campanas: "/campanas",
  rotacion: "/rotacion/conductores",
  tesoreria: "/tesoreria/devengados",
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
  if (href.startsWith("/documentos")) return "documentos";
  if (href.startsWith("/campanas")) return "campanas";
  if (href.startsWith("/rotacion")) return "rotacion";
  if (href.startsWith("/tesoreria")) return "tesoreria";
  if (href.startsWith("/configuracion")) return "configuracion";
  if (href.startsWith("/integraciones")) return "configuracion";
  return null;
}
