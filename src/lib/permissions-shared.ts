/** Permisos — parte pura (sin dependencias de servidor), usable en cliente. */

export const ALL_MODULES = [
  "dashboard",
  "accidentabilidad",
  "accidentabilidad_analisis",
  "reporte_accidente",
  "vacantes",
  "candidatos",
  "empleados",
  "conductores",
  "ausentismo",
  "incapacidades",
  "riesgo",
  "documentos",
  "campanas",
  "rotacion",
  "tesoreria",
  "comunicaciones",
  "rendimiento",
  "mantenimiento",
  "registro_dano",
  "camaras",
  "combustible",
  "operativo",
  "preoperacional",
  "liquidacion",
  "liquidacion_conductor_quincena",
  "produccion_conductor",
  "analisis_liquidacion",
  "financiera",
  "pantalla",
  "configuracion",
  // Módulos de SOLO DATOS: no abren pantalla; dan acceso a la copia del ERP
  // MGX por el MCP y la Data API (src/lib/external/acceso.ts). Van al final
  // para no quedar nunca como primer módulo de un usuario al redirigir.
  "contabilidad_mgx",
  "nomina_mgx",
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  accidentabilidad: "Accidentabilidad",
  accidentabilidad_analisis: "Análisis de accidentabilidad",
  reporte_accidente: "Reportar accidente",
  vacantes: "Vacantes",
  candidatos: "Candidatos",
  empleados: "Empleados",
  conductores: "Conductores",
  ausentismo: "Ausentismo",
  incapacidades: "Recuperación de incapacidades",
  riesgo: "Riesgo predictivo de conductores",
  documentos: "Documentos",
  campanas: "Campañas",
  rotacion: "Rotación",
  tesoreria: "Tesorería",
  comunicaciones: "Comunicaciones (WhatsApp)",
  rendimiento: "Rendimiento del día",
  mantenimiento: "Mantenimiento",
  registro_dano: "Registrar daño",
  camaras: "Cámaras y sensores",
  combustible: "Combustible de buses",
  operativo: "Operativo (documentos del vehículo)",
  preoperacional: "Revisión preoperacional",
  liquidacion: "Liquidación conductor",
  liquidacion_conductor_quincena: "Liquidacion Producción",
  produccion_conductor: "Producción conductor",
  analisis_liquidacion: "Análisis de liquidación (deserción)",
  financiera: "Financiera",
  pantalla: "Pantalla informativa (TV)",
  configuracion: "Configuración",
  contabilidad_mgx: "Contabilidad MGX (datos para agentes y API)",
  nomina_mgx: "Nómina MGX (datos para agentes y API)",
};

/** Ruta de inicio de cada módulo (destino al redirigir por permisos). */
export const MODULE_HOME: Record<ModuleKey, string> = {
  dashboard: "/",
  accidentabilidad: "/accidentabilidad/consultar",
  accidentabilidad_analisis: "/accidentabilidad/analisis",
  reporte_accidente: "/accidentabilidad/reportar",
  vacantes: "/vacantes",
  candidatos: "/candidatos",
  empleados: "/empleados",
  conductores: "/conductores",
  ausentismo: "/ausentismo",
  incapacidades: "/incapacidades",
  riesgo: "/riesgo",
  documentos: "/documentos",
  campanas: "/campanas",
  rotacion: "/rotacion/conductores",
  tesoreria: "/tesoreria/devengados",
  comunicaciones: "/comunicaciones",
  rendimiento: "/rendimiento",
  mantenimiento: "/mantenimiento",
  registro_dano: "/mantenimiento/registrar",
  camaras: "/mantenimiento/camaras",
  combustible: "/mantenimiento/combustible",
  operativo: "/operativo",
  preoperacional: "/operativo/preoperacional",
  liquidacion: "/liquidacion",
  liquidacion_conductor_quincena: "/liquidacion-conductor-quincena",
  produccion_conductor: "/produccion-conductor",
  analisis_liquidacion: "/analisis-liquidacion",
  financiera: "/financiera",
  pantalla: "/pantalla",
  configuracion: "/configuracion",
  // Sin pantalla propia: su «inicio» es la guía pública de conexión del MCP.
  // Nunca "/": un usuario con solo este módulo entraría en un bucle de
  // redirecciones (el proxy lo mandaría a su inicio, que exige dashboard).
  contabilidad_mgx: "/docs/mcp",
  nomina_mgx: "/docs/mcp",
};

/**
 * Sub-funciones por módulo (permisos granulares dentro de un módulo).
 * `user_types.submodulos` guarda {"tesoreria": ["caja","analisis"]}; si el
 * módulo no aparece en el mapa del tipo, tiene TODAS sus sub-funciones.
 */
export const MODULE_SUBS = {
  tesoreria: ["caja", "analisis", "entregas", "parametros", "auditoria", "simulador", "cartulina", "abonos", "liq_afiliados", "liq_afiliados_cuentas", "liq_afiliados_soportes"],
  // Recuperación de incapacidades. Las claves llevan prefijo porque
  // SUBS_SENSIBLES, SUBS_SOLO_ADMIN y SUB_HOME se indexan por nombre de
  // sub-función sin el módulo, y "parametros" ya es de Tesorería. Decisión
  // 12.9 (2026-09-11): son organización de pantallas, no frontera de permisos;
  // RRHH las tiene todas salvo Parámetros, que es del administrador.
  incapacidades: [
    "incap_expedientes",
    "incap_radicacion",
    "incap_recaudos",
    "incap_conciliacion",
    "incap_consulta",
    "incap_parametros",
  ],
  // Financiera (Gestión de flota). Mismo prefijo por la misma razón. Plan
  // docs/Plan_desarrollo_financiera_GESTIVO.md, sección 7. Equivalencia con
  // los roles del aplicativo de Lovable: Visualizador → fin_tablero +
  // fin_analisis; Editor → + fin_datos; Administrador → todas.
  financiera: [
    "fin_tablero",
    "fin_analisis",
    "fin_datos",
    "fin_auditoria",
    "fin_parametros",
  ],
  // Plan Padrino (bonificación por referir conductores). Las tres son
  // sensibles: separan quién registra de quién aprueba (spec RQ-07) y nadie
  // las tiene hasta que se listan en el rol o se conceden al usuario.
  candidatos: ["padrino_consulta", "padrino_registro", "padrino_aprobacion", "padrino_pago"],
} as const;

export type SubmoduleKey<M extends keyof typeof MODULE_SUBS> =
  (typeof MODULE_SUBS)[M][number];

export const SUBMODULE_LABELS: Record<string, string> = {
  // Tesorería: la etiqueta dice todo lo que abre cada opción. Lo que la
  // pantalla muestra pero solo el admin ejecuta va al final, para que nadie
  // conceda una opción esperando una función que no va a tener.
  caja: "Caja de devengados (aprobar entregas, segundo pago autorizado e imprimir estado de cuenta; día cerrado solo el admin)",
  analisis: "Análisis quincenal (consulta)",
  entregas: "Entregas del día (traslado a GEMA, devoluciones e impresión de la planilla)",
  parametros: "Parámetros (base diaria y calendario de pago de afiliados; fecha operativa, bloqueos y GEMA solo el admin)",
  auditoria: "Auditoría (bitácora de pagos, parámetros, revisión de timbradas y soportes de afiliados)",
  simulador: "Simulador (rendimiento del día; cifras hipotéticas y registro del corte solo el admin)",
  cartulina: "Revisión cartulina (revisión de timbradas, cierre del día, consolidado, mapa de calor, Excel y acta; marcar exige poder editar)",
  abonos: "Conciliación de abonos (abonos de GEMA frente al recaudo de cada viaje; consulta y CSV)",
  liq_afiliados: "Liquidación de afiliados (GAF-R-12, calendario de pagos, Excel y consulta de soportes)",
  liq_afiliados_cuentas: "Cuentas del portal de afiliados (crear, restablecer clave, desactivar)",
  liq_afiliados_soportes: "Soportes de descuentos de afiliados (subir y anular)",
  incap_expedientes: "Expedientes (bandeja, completar, liquidar, alta manual)",
  incap_radicacion: "Radicación (solicitud y radicado ante la entidad)",
  incap_recaudos: "Recaudos (giros de la entidad y su aplicación)",
  incap_conciliacion: "Conciliación (saldos, ajustes y cierre)",
  incap_consulta: "Consulta (solo lectura: expediente, soportes e historial)",
  incap_parametros: "Parámetros (corte de gestión, reglas y catálogo de entidades)",
  fin_tablero: "Tablero (resumen, rentabilidad, gasto por timbrada y productividad)",
  fin_analisis: "Análisis (comparación de períodos, vehículos en pérdida, mantenimiento)",
  fin_datos: "Datos (consolidar desde GEMA, cargar y reversar el archivo contable)",
  fin_auditoria: "Auditoría (bitácora de cargas, cierres y reaperturas)",
  fin_parametros: "Parámetros (umbrales de semáforo y reapertura de períodos)",
  padrino_consulta: "Plan Padrino · consulta (ver referidos, validaciones y bitácora; necesaria para entrar)",
  padrino_registro: "Plan Padrino · registro (registrar referidos, adjuntar certificado, revalidar)",
  padrino_aprobacion: "Plan Padrino · aprobación (elegibilidad, esquema, cierre, anulación y aprobación de hitos)",
  padrino_pago: "Plan Padrino · pago (exportar hitos aprobados para nómina y marcarlos pagados; requiere también la consulta)",
};

/**
 * Sub-funciones sensibles que NUNCA se conceden por defecto: aunque el tipo
 * no restrinja el módulo, estas requieren estar listadas explícitamente.
 * "auditoria" expone PII (cédulas, nombres, valores, emails de operadores);
 * "simulador" se asigna usuario a usuario por decisión de negocio (2026-07-29).
 */
export const SUBS_SENSIBLES = new Set([
  "auditoria",
  "simulador",
  // Bitácora de Financiera: expone quién cargó qué y los totales de ingresos
  // y utilidad por período, como la auditoría de Tesorería.
  "fin_auditoria",
  // Crea accesos de terceros (afiliados) al portal y ve su bitácora.
  "liq_afiliados_cuentas",
  // Sube documentos que ve un tercero (el afiliado) en el portal.
  "liq_afiliados_soportes",
  // Plan Padrino: bonificaciones en dinero y datos de dos personas.
  "padrino_consulta",
  "padrino_registro",
  "padrino_aprobacion",
  "padrino_pago",
]);

/**
 * Sub-funciones reservadas al administrador: no se conceden a ningún otro
 * tipo, ni siquiera listándolas en submodulos. Hoy no hay ninguna (el
 * simulador dejó de serlo el 2026-07-29); el mecanismo queda para el futuro.
 */
export const SUBS_SOLO_ADMIN = new Set<string>([
  // Corte de gestión, reglas del motor y umbrales por entidad de
  // Recuperación de incapacidades: mueven dinero reclamado a toda la
  // operación, así que solo el administrador (plan, sección 9).
  "incap_parametros",
  // Umbrales de semáforo y reapertura de períodos cerrados de Financiera:
  // cambian lo que se reporta a Subgerencia (plan, sección 7 y 6.4).
  "fin_parametros",
]);

/**
 * Ajustes de permisos de UN usuario sobre lo que le da su rol
 * (profiles.permisos_individuales). Clave ausente = hereda del rol;
 * true = conceder; false = denegar.
 *
 * "submodulos" es un mapa plano porque los nombres de sub-función son únicos
 * en toda la aplicación (de ahí los prefijos incap_/fin_), igual que se
 * indexan SUBS_SENSIBLES, SUBS_SOLO_ADMIN, SUB_HOME y SUBMODULE_LABELS.
 */
export interface PermisosIndividuales {
  modulos?: Record<string, boolean>;
  submodulos?: Record<string, boolean>;
  /** Informativo: quién lo cambió por última vez. Las reglas lo ignoran. */
  meta?: { por?: string; email?: string; at?: string };
}

/** Sin ajustes: hereda todo del rol. */
export const SIN_INDIVIDUALES: PermisosIndividuales = {};

/** Módulo al que pertenece cada sub-función, derivado de MODULE_SUBS. */
export const SUB_TO_MODULE: Record<string, keyof typeof MODULE_SUBS> =
  Object.fromEntries(
    Object.entries(MODULE_SUBS).flatMap(([modulo, subs]) =>
      (subs as readonly string[]).map((s) => [s, modulo as keyof typeof MODULE_SUBS])
    )
  );

/** Todas las sub-funciones conocidas: allowlist de validación y de UI. */
export const ALL_SUBS: readonly string[] = Object.keys(SUB_TO_MODULE);

/**
 * Lee profiles.permisos_individuales sin confiar en el JSONB: descarta claves
 * desconocidas y valores que no sean booleanos. Devuelve {} cuando la columna
 * todavía no existe (migración sin aplicar), de modo que el comportamiento
 * queda idéntico al de antes de este mecanismo.
 */
export function normalizarIndividuales(valor: unknown): PermisosIndividuales {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return SIN_INDIVIDUALES;
  }
  const crudo = valor as Record<string, unknown>;
  const limpiar = (mapa: unknown, conocidas: readonly string[]) => {
    if (!mapa || typeof mapa !== "object" || Array.isArray(mapa)) return undefined;
    const salida: Record<string, boolean> = {};
    for (const [clave, v] of Object.entries(mapa as Record<string, unknown>)) {
      if (typeof v === "boolean" && conocidas.includes(clave)) salida[clave] = v;
    }
    return Object.keys(salida).length ? salida : undefined;
  };
  const modulos = limpiar(crudo.modulos, ALL_MODULES);
  const submodulos = limpiar(crudo.submodulos, ALL_SUBS);
  const meta =
    crudo.meta && typeof crudo.meta === "object" && !Array.isArray(crudo.meta)
      ? (crudo.meta as PermisosIndividuales["meta"])
      : undefined;
  return {
    ...(modulos ? { modulos } : {}),
    ...(submodulos ? { submodulos } : {}),
    ...(meta ? { meta } : {}),
  };
}

/**
 * Módulos efectivos de un usuario: los de su rol, más los concedidos
 * individualmente, menos los denegados.
 *
 * El orden de salida es el de ALL_MODULES y no el del array guardado en el
 * rol: así el destino al que redirige el middleware cuando deniega una ruta es
 * determinista (y "dashboard" queda primero, que es el inicio sensato).
 *
 * El rol admin no admite ajustes (ver getCurrentPermissions): se le pasa
 * siempre SIN_INDIVIDUALES, para que un descuido no deje al sistema sin nadie
 * que lo administre.
 */
export function modulosEfectivos(
  delRol: readonly string[] | unknown,
  individuales?: PermisosIndividuales | null
): ModuleKey[] {
  const base = new Set(Array.isArray(delRol) ? (delRol as string[]) : []);
  for (const [modulo, concedido] of Object.entries(individuales?.modulos ?? {})) {
    if (concedido) base.add(modulo);
    else base.delete(modulo);
  }
  return ALL_MODULES.filter((m) => base.has(m));
}

/**
 * Regla pura de acceso a una sub-función, compartida por el middleware, el
 * menú y el servidor: el admin siempre puede; las reservadas solo el admin;
 * luego manda el ajuste individual si lo hay; y si no, el rol (clave del
 * módulo ausente = todas sus sub-funciones salvo las sensibles).
 *
 * Las reservadas al administrador se evalúan ANTES que todo lo demás: no se
 * conceden ni listándolas en el rol ni con un permiso individual.
 */
export function subAllowed(
  submodules: Record<string, string[]>,
  module: string,
  sub: string,
  isAdmin: boolean,
  individuales?: Record<string, boolean> | null
): boolean {
  if (SUBS_SOLO_ADMIN.has(sub)) return isAdmin;
  if (isAdmin) return true;
  const ajuste = individuales?.[sub];
  if (typeof ajuste === "boolean") return ajuste;
  const subs = submodules[module];
  if (!Array.isArray(subs)) return !SUBS_SENSIBLES.has(sub);
  return subs.includes(sub);
}

/** De dónde sale un permiso efectivo. Lo usa la pantalla de permisos. */
export type OrigenPermiso = "rol" | "concedido" | "denegado" | "reservado" | "admin";

/** Permiso efectivo de un módulo y su procedencia, para explicarlo en la UI. */
export function origenModulo(
  delRol: readonly string[] | unknown,
  individuales: PermisosIndividuales,
  module: string
): { permitido: boolean; origen: OrigenPermiso } {
  const ajuste = individuales.modulos?.[module];
  const permitido = modulosEfectivos(delRol, individuales).includes(module as ModuleKey);
  if (ajuste === true) return { permitido, origen: "concedido" };
  if (ajuste === false) return { permitido, origen: "denegado" };
  return { permitido, origen: "rol" };
}

/** Permiso efectivo de una sub-función y su procedencia, para la UI. */
export function origenSub(
  submodules: Record<string, string[]>,
  individuales: PermisosIndividuales,
  module: string,
  sub: string,
  isAdmin: boolean
): { permitido: boolean; origen: OrigenPermiso } {
  if (SUBS_SOLO_ADMIN.has(sub)) {
    return { permitido: isAdmin, origen: isAdmin ? "admin" : "reservado" };
  }
  if (isAdmin) return { permitido: true, origen: "admin" };
  const permitido = subAllowed(
    submodules,
    module,
    sub,
    false,
    individuales.submodulos
  );
  const ajuste = individuales.submodulos?.[sub];
  if (ajuste === true) return { permitido, origen: "concedido" };
  if (ajuste === false) return { permitido, origen: "denegado" };
  return { permitido, origen: "rol" };
}

/** Ruta de inicio de cada sub-función (destino al redirigir por permisos). */
export const SUB_HOME: Record<string, string> = {
  caja: "/tesoreria/devengados",
  analisis: "/tesoreria/devengados/analisis",
  entregas: "/tesoreria/devengados/entregas",
  parametros: "/tesoreria/devengados/parametros",
  auditoria: "/tesoreria/devengados/auditoria",
  simulador: "/tesoreria/devengados/simulador",
  cartulina: "/tesoreria/revision-cartulina",
  abonos: "/tesoreria/conciliacion-abonos",
  liq_afiliados: "/tesoreria/liquidacion-afiliados",
  liq_afiliados_cuentas: "/tesoreria/liquidacion-afiliados",
  liq_afiliados_soportes: "/tesoreria/liquidacion-afiliados",
  incap_expedientes: "/incapacidades",
  incap_radicacion: "/incapacidades/radicacion",
  incap_recaudos: "/incapacidades/recaudos",
  incap_conciliacion: "/incapacidades/conciliacion",
  incap_consulta: "/incapacidades/consulta",
  incap_parametros: "/incapacidades/parametros",
  fin_tablero: "/financiera/flota",
  fin_analisis: "/financiera/flota/comparacion",
  fin_datos: "/financiera/flota/datos",
  fin_auditoria: "/financiera/flota/auditoria",
  fin_parametros: "/financiera/flota/parametros",
  padrino_consulta: "/candidatos/plan-padrino",
  padrino_registro: "/candidatos/plan-padrino",
  padrino_aprobacion: "/candidatos/plan-padrino",
  padrino_pago: "/candidatos/plan-padrino/hitos",
};

/** Mapea una ruta del menú a su sub-función dentro del módulo (o null). */
export function hrefToSubmodule(href: string): string | null {
  // Registrar y aprobar se controlan en las acciones; entrar exige la consulta.
  if (href.startsWith("/candidatos/plan-padrino")) return "padrino_consulta";
  if (href.startsWith("/api/candidatos/plan-padrino")) return "padrino_consulta";
  if (href.startsWith("/financiera/flota/parametros")) return "fin_parametros";
  if (href.startsWith("/financiera/flota/auditoria")) return "fin_auditoria";
  if (href.startsWith("/financiera/flota/datos")) return "fin_datos";
  if (href.startsWith("/financiera/flota/comparacion")) return "fin_analisis";
  if (href.startsWith("/financiera/flota/perdida")) return "fin_analisis";
  if (href.startsWith("/financiera/flota/mantenimiento")) return "fin_analisis";
  if (href.startsWith("/financiera")) return "fin_tablero";
  if (href.startsWith("/incapacidades/parametros")) return "incap_parametros";
  if (href.startsWith("/incapacidades/radicacion")) return "incap_radicacion";
  if (href.startsWith("/incapacidades/recaudos")) return "incap_recaudos";
  if (href.startsWith("/incapacidades/conciliacion")) return "incap_conciliacion";
  if (href.startsWith("/incapacidades/consulta")) return "incap_consulta";
  if (href.startsWith("/incapacidades")) return "incap_expedientes";
  if (href.startsWith("/tesoreria/devengados/analisis")) return "analisis";
  if (href.startsWith("/tesoreria/devengados/entregas")) return "entregas";
  if (href.startsWith("/tesoreria/devengados/parametros")) return "parametros";
  if (href.startsWith("/tesoreria/devengados/auditoria")) return "auditoria";
  if (href.startsWith("/tesoreria/devengados/simulador")) return "simulador";
  if (href.startsWith("/tesoreria/devengados")) return "caja";
  if (href.startsWith("/tesoreria/revision-cartulina")) return "cartulina";
  if (href.startsWith("/tesoreria/conciliacion-abonos")) return "abonos";
  if (href.startsWith("/tesoreria/liquidacion-afiliados")) return "liq_afiliados";
  return null;
}

/** Mapea una ruta del menú a su clave de módulo. */
export function hrefToModule(href: string): ModuleKey | null {
  if (href === "/") return "dashboard";
  // Antes que /accidentabilidad: el auxiliar de ruta solo recibe el reporte,
  // igual que registro_dano dentro de Mantenimiento.
  if (href.startsWith("/accidentabilidad/reportar")) return "reporte_accidente";
  if (href.startsWith("/accidentabilidad/analisis")) return "accidentabilidad_analisis";
  if (href.startsWith("/accidentabilidad")) return "accidentabilidad";
  if (href.startsWith("/vacantes")) return "vacantes";
  if (href.startsWith("/candidatos")) return "candidatos";
  if (href.startsWith("/contratacion")) return "candidatos";
  if (href.startsWith("/empleados")) return "empleados";
  if (href.startsWith("/conductores")) return "conductores";
  if (href.startsWith("/ausentismo")) return "ausentismo";
  if (href.startsWith("/incapacidades")) return "incapacidades";
  if (href.startsWith("/riesgo")) return "riesgo";
  if (href.startsWith("/analisis-liquidacion")) return "analisis_liquidacion";
  if (href.startsWith("/documentos")) return "documentos";
  if (href.startsWith("/campanas")) return "campanas";
  if (href.startsWith("/rotacion")) return "rotacion";
  if (href.startsWith("/tesoreria")) return "tesoreria";
  if (href.startsWith("/comunicaciones")) return "comunicaciones";
  if (href.startsWith("/rendimiento")) return "rendimiento";
  // Antes que /mantenimiento: es un modulo aparte, para poder darle a quien
  // solo captura danos esa pantalla sin abrirle el resto del area.
  if (href.startsWith("/mantenimiento/registrar")) return "registro_dano";
  // Igual: al técnico de cámaras se le da solo el control de cámaras y sensores.
  if (href.startsWith("/mantenimiento/camaras")) return "camaras";
  // Igual: a quien recibe el archivo del proveedor se le da solo Combustible.
  if (href.startsWith("/mantenimiento/combustible")) return "combustible";
  if (href.startsWith("/mantenimiento")) return "mantenimiento";
  // Antes que /operativo: el inspector de patio solo recibe esta pantalla,
  // igual que registro_dano dentro de Mantenimiento.
  if (href.startsWith("/operativo/preoperacional")) return "preoperacional";
  if (href.startsWith("/operativo")) return "operativo";
  if (href.startsWith("/liquidacion-conductor-quincena")) return "liquidacion_conductor_quincena";
  if (href.startsWith("/liquidacion")) return "liquidacion";
  if (href.startsWith("/produccion-conductor")) return "produccion_conductor";
  if (href.startsWith("/financiera")) return "financiera";
  // Editor de la pantalla informativa. El TV NO pasa por aquí: abre /display,
  // que es público y se autentica con su clave en /api/display.
  if (href.startsWith("/pantalla")) return "pantalla";
  if (href.startsWith("/configuracion")) return "configuracion";
  if (href.startsWith("/integraciones")) return "configuracion";
  return null;
}
