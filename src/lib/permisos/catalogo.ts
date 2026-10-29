/**
 * Catálogo único de permisos: módulos, sus funciones (las antiguas
 * «sub-funciones») y las acciones de cada uno. De aquí salen las claves de
 * permiso, la ruta → permiso y, con `menu.ts`, el menú.
 *
 * Clave de permiso: `modulo.accion` o `modulo.funcion.accion`
 * (`ausentismo.ver`, `tesoreria.caja.editar`).
 *
 * Cada acción tiene un **nivel**:
 *  - `ver` y `editar` son los dos niveles del sistema anterior (entrar y
 *    `puede_editar`). Una acción nueva de nivel `editar` la reciben sola los
 *    roles que ya tenían `editar` en ese módulo (ver `sincronizar.ts`), así que
 *    afinar un módulo en acciones no le quita nada a nadie.
 *  - `especial` no se hereda por nivel: se concede a propósito.
 *
 * Para agregar un módulo, una función o una acción: solo aquí. La base se
 * sincroniza sola y lo retirado queda obsoleto (no da acceso).
 *
 * PURO: sin servidor ni íconos (lo importa el proxy). `npm run test:permisos`.
 */

export type Nivel = "ver" | "editar" | "especial";

export interface AccionDef {
  clave: string;
  etiqueta: string;
  nivel: Nivel;
}

export interface FuncionDef {
  clave: string;
  etiqueta: string;
  /** Clave en el sistema anterior (`user_types.submodulos`, `SUB_HOME`…). */
  vieja: string;
  /** Prefijos de ruta que abre esta función. Puede no tener (solo acciones). */
  rutas?: string[];
  inicio?: string;
  /** No se concede por omisión: hay que marcarla en el rol o al usuario. */
  sensible?: boolean;
  /** Solo la tiene el rol super. */
  soloSuper?: boolean;
  acciones?: AccionDef[];
}

export interface ModuloDef {
  clave: string;
  etiqueta: string;
  inicio: string;
  rutas: string[];
  /** Ruta que coincide solo exacta (el Dashboard, `/`). */
  rutaExacta?: string;
  funciones?: FuncionDef[];
  acciones?: AccionDef[];
  /** Sin pantalla: solo datos para el MCP y la Data API. */
  soloDatos?: boolean;
}

export const VER: AccionDef = { clave: "ver", etiqueta: "Ver", nivel: "ver" };
export const EDITAR: AccionDef = { clave: "editar", etiqueta: "Crear y editar", nivel: "editar" };
/**
 * Exportar es de nivel `ver`: hoy quien ve una pantalla puede descargar lo que
 * ve, así que lo reciben todos los que ven el módulo (y se puede quitar).
 */
export const EXPORTAR: AccionDef = { clave: "exportar", etiqueta: "Exportar (PDF, Excel, CSV)", nivel: "ver" };
export const CREAR: AccionDef = { clave: "crear", etiqueta: "Crear", nivel: "editar" };
export const ELIMINAR: AccionDef = { clave: "eliminar", etiqueta: "Eliminar", nivel: "editar" };
/** Ver, crear y editar, exportar: lo de casi todos los módulos de pantalla. */
const BASE: AccionDef[] = [VER, EDITAR, EXPORTAR];

/**
 * Rutas que caen dentro de una función pero no la exigen: la página decide
 * entre varias (ver el comentario en `hrefToSubmodule`).
 */
export const RUTAS_SIN_FUNCION: { prefijo: string; modulo: string }[] = [
  { prefijo: "/tesoreria/revision-cartulina/solicitudes-camaras", modulo: "tesoreria" },
  // Recobros: cartulina, caja o la directora (src/lib/tesoreria/recobros-acceso.ts).
  { prefijo: "/tesoreria/recobros", modulo: "tesoreria" },
];

export const MODULOS: ModuloDef[] = [
  { clave: "dashboard", etiqueta: "Dashboard", inicio: "/", rutas: [], rutaExacta: "/" },
  {
    clave: "accidentabilidad",
    etiqueta: "Accidentabilidad",
    inicio: "/accidentabilidad/consultar",
    rutas: ["/accidentabilidad"],
    acciones: [
      VER,
      { clave: "editar", etiqueta: "Editar reportes", nivel: "editar" },
      { clave: "aprobar", etiqueta: "Aprobar y cambiar el estado de la revisión", nivel: "editar" },
      ELIMINAR,
      EXPORTAR,
      // Antes lo decidía `profiles.role` (admin/rrhh), aparte de los roles.
      { clave: "evaluar", etiqueta: "Evaluar accidentes (dictamen del revisor)", nivel: "especial" },
      // Lo llena el director de mantenimiento; no lo da «editar».
      { clave: "costo_reparacion", etiqueta: "Registrar el costo de reparación (director de mantenimiento)", nivel: "especial" },
    ],
  },
  { clave: "accidentabilidad_analisis", etiqueta: "Análisis de accidentabilidad", inicio: "/accidentabilidad/analisis", rutas: ["/accidentabilidad/analisis"] },
  { clave: "reporte_accidente", etiqueta: "Reportar accidente", inicio: "/accidentabilidad/reportar", rutas: ["/accidentabilidad/reportar"] },
  { clave: "vacantes", etiqueta: "Vacantes", inicio: "/vacantes", rutas: ["/vacantes"], acciones: [VER, CREAR, { clave: "editar", etiqueta: "Cambiar estado", nivel: "editar" }, ELIMINAR, EXPORTAR] },
  {
    clave: "candidatos",
    etiqueta: "Candidatos",
    inicio: "/candidatos",
    rutas: ["/candidatos", "/contratacion"],
    acciones: [VER, { clave: "editar", etiqueta: "Editar, mover de etapa, asignar y contratar", nivel: "editar" }, ELIMINAR, EXPORTAR],
    funciones: [
      { clave: "padrino_consulta", vieja: "padrino_consulta", etiqueta: "Plan Padrino · consulta (ver referidos, validaciones y bitácora; necesaria para entrar)", rutas: ["/candidatos/plan-padrino"], inicio: "/candidatos/plan-padrino", sensible: true },
      { clave: "padrino_registro", vieja: "padrino_registro", etiqueta: "Plan Padrino · registro (registrar referidos, adjuntar certificado, revalidar)", inicio: "/candidatos/plan-padrino", sensible: true },
      { clave: "padrino_aprobacion", vieja: "padrino_aprobacion", etiqueta: "Plan Padrino · aprobación (elegibilidad, esquema, cierre, anulación y aprobación de hitos)", inicio: "/candidatos/plan-padrino", sensible: true },
      { clave: "padrino_pago", vieja: "padrino_pago", etiqueta: "Plan Padrino · pago (exportar hitos aprobados para nómina y marcarlos pagados)", inicio: "/candidatos/plan-padrino/hitos", sensible: true },
    ],
  },
  { clave: "empleados", etiqueta: "Empleados", inicio: "/empleados", rutas: ["/empleados"], acciones: [VER, { clave: "editar", etiqueta: "Editar, novedades, descargos y observaciones", nivel: "editar" }, ELIMINAR, EXPORTAR] },
  { clave: "conductores", etiqueta: "Conductores", inicio: "/conductores", rutas: ["/conductores"] },
  {
    clave: "ausentismo",
    etiqueta: "Ausentismo",
    inicio: "/ausentismo",
    rutas: ["/ausentismo"],
    acciones: [VER, CREAR, { clave: "editar", etiqueta: "Editar registros, notificaciones y seguimientos", nivel: "editar" }, ELIMINAR, EXPORTAR],
  },
  {
    clave: "incapacidades",
    etiqueta: "Recuperación de incapacidades",
    inicio: "/incapacidades",
    rutas: ["/incapacidades"],
    funciones: [
      { clave: "expedientes", vieja: "incap_expedientes", etiqueta: "Expedientes (bandeja, completar, liquidar, alta manual)", rutas: ["/incapacidades"], inicio: "/incapacidades" },
      { clave: "radicacion", vieja: "incap_radicacion", etiqueta: "Radicación (solicitud y radicado ante la entidad)", rutas: ["/incapacidades/radicacion"], inicio: "/incapacidades/radicacion" },
      { clave: "recaudos", vieja: "incap_recaudos", etiqueta: "Recaudos (giros de la entidad y su aplicación)", rutas: ["/incapacidades/recaudos"], inicio: "/incapacidades/recaudos" },
      { clave: "conciliacion", vieja: "incap_conciliacion", etiqueta: "Conciliación (saldos, ajustes y cierre)", rutas: ["/incapacidades/conciliacion"], inicio: "/incapacidades/conciliacion" },
      { clave: "consulta", vieja: "incap_consulta", etiqueta: "Consulta (solo lectura: expediente, soportes e historial)", rutas: ["/incapacidades/consulta"], inicio: "/incapacidades/consulta" },
      { clave: "parametros", vieja: "incap_parametros", etiqueta: "Parámetros (corte de gestión, reglas y catálogo de entidades)", rutas: ["/incapacidades/parametros"], inicio: "/incapacidades/parametros", soloSuper: true },
    ],
  },
  { clave: "riesgo", etiqueta: "Riesgo predictivo de conductores", inicio: "/riesgo", rutas: ["/riesgo"] },
  { clave: "documentos", etiqueta: "Documentos", inicio: "/documentos", rutas: ["/documentos"], acciones: [VER, { clave: "editar", etiqueta: "Cambiar estado", nivel: "editar" }, ELIMINAR, EXPORTAR] },
  { clave: "campanas", etiqueta: "Campañas", inicio: "/campanas", rutas: ["/campanas"] },
  { clave: "rotacion", etiqueta: "Rotación", inicio: "/rotacion/conductores", rutas: ["/rotacion"] },
  {
    clave: "tesoreria",
    etiqueta: "Tesorería",
    inicio: "/tesoreria/devengados",
    rutas: ["/tesoreria"],
    funciones: [
      { clave: "caja", vieja: "caja", etiqueta: "Caja de devengados (aprobar entregas, segundo pago autorizado e imprimir estado de cuenta)", rutas: ["/tesoreria/devengados"], inicio: "/tesoreria/devengados" },
      { clave: "analisis", vieja: "analisis", etiqueta: "Análisis quincenal (consulta)", rutas: ["/tesoreria/devengados/analisis"], inicio: "/tesoreria/devengados/analisis" },
      { clave: "entregas", vieja: "entregas", etiqueta: "Entregas del día (traslado a GEMA, devoluciones e impresión de la planilla)", rutas: ["/tesoreria/devengados/entregas"], inicio: "/tesoreria/devengados/entregas" },
      { clave: "parametros", vieja: "parametros", etiqueta: "Parámetros (base diaria y calendario de pago de afiliados)", rutas: ["/tesoreria/devengados/parametros"], inicio: "/tesoreria/devengados/parametros" },
      { clave: "auditoria", vieja: "auditoria", etiqueta: "Auditoría (bitácora de pagos, parámetros, revisión de timbradas y soportes)", rutas: ["/tesoreria/devengados/auditoria"], inicio: "/tesoreria/devengados/auditoria", sensible: true },
      { clave: "simulador", vieja: "simulador", etiqueta: "Simulador (rendimiento del día)", rutas: ["/tesoreria/devengados/simulador"], inicio: "/tesoreria/devengados/simulador", sensible: true },
      { clave: "cartulina", vieja: "cartulina", etiqueta: "Revisión cartulina (revisión de timbradas, cierre del día, consolidado, mapa de calor)", rutas: ["/tesoreria/revision-cartulina"], inicio: "/tesoreria/revision-cartulina" },
      { clave: "abonos", vieja: "abonos", etiqueta: "Conciliación de abonos (consulta y CSV)", rutas: ["/tesoreria/conciliacion-abonos"], inicio: "/tesoreria/conciliacion-abonos" },
      { clave: "liq_afiliados", vieja: "liq_afiliados", etiqueta: "Liquidación de afiliados (GAF-R-12, calendario de pagos, Excel y soportes)", rutas: ["/tesoreria/liquidacion-afiliados"], inicio: "/tesoreria/liquidacion-afiliados" },
      { clave: "liq_afiliados_cuentas", vieja: "liq_afiliados_cuentas", etiqueta: "Cuentas del portal de afiliados (crear, restablecer clave, desactivar)", inicio: "/tesoreria/liquidacion-afiliados", sensible: true },
      { clave: "liq_afiliados_soportes", vieja: "liq_afiliados_soportes", etiqueta: "Soportes de descuentos de afiliados (subir y anular)", inicio: "/tesoreria/liquidacion-afiliados", sensible: true },
      { clave: "recobros_incobrable", vieja: "recobros_incobrable", etiqueta: "Recobros · directora (incobrable autorizado por subgerencia y liquidación definitiva)", inicio: "/tesoreria/recobros", sensible: true },
      { clave: "recobros_subgerencia", vieja: "recobros_subgerencia", etiqueta: "Recobros · subgerencia (cobrar o no cobrar sin conteo de cámara)", inicio: "/tesoreria/recobros", sensible: true },
      { clave: "recobros_operativo", vieja: "recobros_operativo", etiqueta: "Recobros · Operativo (instrucción sobre plazos vencidos)", inicio: "/tesoreria/recobros", sensible: true },
      { clave: "recobros_correcciones", vieja: "recobros_correcciones", etiqueta: "Recobros · validar correcciones (director de Mantenimiento)", inicio: "/tesoreria/recobros", sensible: true },
    ],
  },
  { clave: "comunicaciones", etiqueta: "Comunicaciones (WhatsApp)", inicio: "/comunicaciones", rutas: ["/comunicaciones"] },
  { clave: "rendimiento", etiqueta: "Rendimiento del día", inicio: "/rendimiento", rutas: ["/rendimiento"] },
  { clave: "mantenimiento", etiqueta: "Mantenimiento", inicio: "/mantenimiento", rutas: ["/mantenimiento"] },
  { clave: "registro_dano", etiqueta: "Registrar daño", inicio: "/mantenimiento/registrar", rutas: ["/mantenimiento/registrar"] },
  { clave: "camaras", etiqueta: "Cámaras y sensores", inicio: "/mantenimiento/camaras", rutas: ["/mantenimiento/camaras"] },
  { clave: "combustible", etiqueta: "Combustible de buses", inicio: "/mantenimiento/combustible", rutas: ["/mantenimiento/combustible"] },
  { clave: "operativo", etiqueta: "Operativo (documentos del vehículo)", inicio: "/operativo", rutas: ["/operativo"] },
  { clave: "preoperacional", etiqueta: "Revisión preoperacional", inicio: "/operativo/preoperacional", rutas: ["/operativo/preoperacional"] },
  { clave: "liquidacion", etiqueta: "Liquidación conductor", inicio: "/liquidacion", rutas: ["/liquidacion"] },
  { clave: "liquidacion_conductor_quincena", etiqueta: "Liquidacion Producción", inicio: "/liquidacion-conductor-quincena", rutas: ["/liquidacion-conductor-quincena"] },
  { clave: "produccion_conductor", etiqueta: "Producción conductor", inicio: "/produccion-conductor", rutas: ["/produccion-conductor"] },
  { clave: "analisis_liquidacion", etiqueta: "Análisis de liquidación (deserción)", inicio: "/analisis-liquidacion", rutas: ["/analisis-liquidacion"] },
  {
    clave: "financiera",
    etiqueta: "Financiera",
    inicio: "/financiera",
    rutas: ["/financiera"],
    funciones: [
      { clave: "tablero", vieja: "fin_tablero", etiqueta: "Tablero (resumen, rentabilidad, gasto por timbrada y productividad)", rutas: ["/financiera"], inicio: "/financiera/flota" },
      { clave: "analisis", vieja: "fin_analisis", etiqueta: "Análisis (comparación de períodos, vehículos en pérdida, mantenimiento)", rutas: ["/financiera/flota/comparacion", "/financiera/flota/perdida", "/financiera/flota/mantenimiento"], inicio: "/financiera/flota/comparacion" },
      { clave: "datos", vieja: "fin_datos", etiqueta: "Datos (consolidar desde GEMA, cargar y reversar el archivo contable)", rutas: ["/financiera/flota/datos"], inicio: "/financiera/flota/datos" },
      { clave: "auditoria", vieja: "fin_auditoria", etiqueta: "Auditoría (bitácora de cargas, cierres y reaperturas)", rutas: ["/financiera/flota/auditoria"], inicio: "/financiera/flota/auditoria", sensible: true },
      { clave: "parametros", vieja: "fin_parametros", etiqueta: "Parámetros (umbrales de semáforo y reapertura de períodos)", rutas: ["/financiera/flota/parametros"], inicio: "/financiera/flota/parametros", soloSuper: true },
    ],
  },
  { clave: "pantalla", etiqueta: "Pantalla informativa (TV)", inicio: "/pantalla", rutas: ["/pantalla"] },
  {
    clave: "disciplinarios",
    etiqueta: "Procesos disciplinarios",
    inicio: "/disciplinarios",
    rutas: ["/disciplinarios"],
    acciones: [VER, CREAR, EDITAR, { clave: "anular", etiqueta: "Anular", nivel: "editar" }, EXPORTAR],
  },
  {
    // Recursos Humanos – SST: el trabajador lesionado y su reporte a la ARL (no
    // es Accidentabilidad, que son los accidentes de tránsito de los buses).
    clave: "accidentes_trabajo",
    etiqueta: "Accidentes de trabajo (SST)",
    inicio: "/accidentes-trabajo",
    rutas: ["/accidentes-trabajo"],
    acciones: [VER, CREAR, EDITAR, { clave: "anular", etiqueta: "Anular", nivel: "editar" }, EXPORTAR],
  },
  { clave: "configuracion", etiqueta: "Configuración", inicio: "/configuracion", rutas: ["/configuracion", "/integraciones"] },
  // Solo datos: van al final para no quedar como primer módulo al redirigir.
  { clave: "contabilidad_mgx", etiqueta: "Contabilidad MGX (datos para agentes y API)", inicio: "/docs/mcp", rutas: [], soloDatos: true, acciones: [VER] },
  { clave: "nomina_mgx", etiqueta: "Nómina MGX (datos para agentes y API)", inicio: "/docs/mcp", rutas: [], soloDatos: true, acciones: [VER] },
];

// ── Derivados ────────────────────────────────────────────────────────────────

export const accionesDe = (x: { acciones?: AccionDef[] }) => x.acciones ?? BASE;

export const claveModulo = (m: string, accion: string) => `${m}.${accion}`;
export const claveFuncion = (m: string, f: string, accion: string) => `${m}.${f}.${accion}`;

export interface PermisoDef {
  clave: string;
  modulo: string;
  funcion: string | null;
  accion: string;
  nivel: Nivel;
  etiqueta: string;
  sensible: boolean;
  soloSuper: boolean;
}

/** Todos los permisos del catálogo, en orden. */
export function listarPermisos(modulos: ModuloDef[] = MODULOS): PermisoDef[] {
  const salida: PermisoDef[] = [];
  for (const m of modulos) {
    for (const a of accionesDe(m)) {
      salida.push({
        clave: claveModulo(m.clave, a.clave),
        modulo: m.clave,
        funcion: null,
        accion: a.clave,
        nivel: a.nivel,
        etiqueta: `${m.etiqueta} · ${a.etiqueta}`,
        sensible: false,
        soloSuper: false,
      });
    }
    for (const f of m.funciones ?? []) {
      for (const a of accionesDe(f)) {
        salida.push({
          clave: claveFuncion(m.clave, f.clave, a.clave),
          modulo: m.clave,
          funcion: f.clave,
          accion: a.clave,
          nivel: a.nivel,
          etiqueta: `${m.etiqueta} › ${f.etiqueta} · ${a.etiqueta}`,
          sensible: !!f.sensible,
          soloSuper: !!f.soloSuper,
        });
      }
    }
  }
  return salida;
}

export const PERMISOS: PermisoDef[] = listarPermisos();
export const PERMISO_POR_CLAVE = new Map(PERMISOS.map((p) => [p.clave, p]));
export const MODULO_POR_CLAVE = new Map(MODULOS.map((m) => [m.clave, m]));

/** Función del catálogo a partir de su clave vieja (`incap_radicacion`…). */
export const FUNCION_POR_VIEJA = new Map(
  MODULOS.flatMap((m) => (m.funciones ?? []).map((f) => [f.vieja, { modulo: m.clave, funcion: f }] as const))
);
