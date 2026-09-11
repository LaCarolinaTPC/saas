// Whitelist de recursos expuestos por la Data API de solo lectura (/api/external/v1).
//
// Esta lista ES la frontera de seguridad: la API externa solo puede leer las
// tablas/vistas que aparezcan aquí. Para exponer un dato nuevo, agrégalo abajo.
// No incluir tablas con datos sensibles de autenticación (profiles, user_types,
// webhook_logs con payloads crudos, etc.).

export type ExternalResource = {
  /** Nombre real de la tabla o vista en Supabase/Postgres. */
  name: string;
  /** Dominio funcional al que pertenece (para agrupar en el catálogo). */
  domain: string;
  /** Descripción en lenguaje natural para que la IA entienda qué contiene. */
  description: string;
  /**
   * Columna por defecto para ordenar (descendente). Opcional.
   * Útil para que las consultas sin `order` devuelvan lo más reciente primero.
   */
  defaultOrder?: string;
  /**
   * Columna que identifica un registro en el endpoint de detalle
   * GET /api/external/v1/<recurso>/<id>. Por defecto: "id".
   */
  idColumn?: string;
};

/** Columna identificadora efectiva de un recurso. */
export function resourceIdColumn(resource: ExternalResource): string {
  return resource.idColumn ?? "id";
}

export const EXTERNAL_RESOURCES: ExternalResource[] = [
  // ── Rotación ───────────────────────────────────────────────────────────────
  {
    name: "conductores_con_grupo",
    domain: "rotacion",
    description:
      "Maestro de conductores con su grupo de antigüedad. Incluye cédula, nombre, código, tipo de conductor, estado (ACTIVO/RETIRADO), grupo y meses de antigüedad, fecha de ingreso.",
    defaultOrder: "fecha_ingreso",
    idColumn: "cedula",
  },
  {
    name: "cierres_diarios",
    domain: "rotacion",
    description:
      "Cierres diarios de operación por conductor: viajes, timbradas, diferencia y promedio de timbradas, porcentaje de cumplimiento y fecha.",
    defaultOrder: "fecha",
  },
  {
    name: "viajes_perdidos",
    domain: "rotacion",
    description:
      "Viajes perdidos por conductor con su tipología, novedad y fecha.",
    defaultOrder: "fecha",
  },

  // ── Ausentismo ──────────────────────────────────────────────────────────────
  {
    name: "ausentismo",
    domain: "ausentismo",
    description:
      "Registros de incapacidades/ausentismo: cédula, días de IT pagados, origen, fecha de inicio, diagnóstico y EPS.",
    defaultOrder: "fecha_inicio",
  },

  // ── Accidentabilidad ────────────────────────────────────────────────────────
  {
    name: "accidentes",
    domain: "accidentabilidad",
    description:
      "Reportes de accidentes: datos del conductor, ubicación, vehículo, factores y estado del caso (pendiente_revision/evaluado/...).",
    defaultOrder: "created_at",
  },
  {
    name: "accidente_evaluaciones",
    domain: "accidentabilidad",
    description:
      "Evaluaciones de riesgo de cada accidente: gravedad, responsabilidad, factores, puntaje, nivel sugerido y medidas correctivas.",
  },
  {
    name: "accidente_eventos",
    domain: "accidentabilidad",
    description: "Historial de cambios de estado de cada accidente.",
  },
  {
    name: "accidente_vehiculos",
    domain: "accidentabilidad",
    description: "Vehículos involucrados en cada accidente.",
  },

  // ── Reclutamiento / RRHH ────────────────────────────────────────────────────
  {
    name: "candidates",
    domain: "reclutamiento",
    description:
      "Banco de candidatos: nombre, teléfono, email, documento, fuente y estado.",
    defaultOrder: "created_at",
  },
  {
    name: "vacancies",
    domain: "reclutamiento",
    description:
      "Vacantes/posiciones: título y estado (activa/borrador/cerrada/archivada).",
  },
  {
    name: "candidate_vacancy",
    domain: "reclutamiento",
    description:
      "Relación candidato–vacante con la etapa actual del pipeline (recibido/en_revision/.../aprobado).",
  },
  {
    name: "stage_history",
    domain: "reclutamiento",
    description: "Historial de avance de candidatos por las etapas del pipeline.",
  },
  {
    name: "employees",
    domain: "reclutamiento",
    description:
      "Maestro de empleados: nombre, documento, cargo, fecha de ingreso y estado (activo/retirado/permiso).",
  },
  {
    name: "documents",
    domain: "reclutamiento",
    description:
      "Documentos de candidatos/empleados: tipo, mime, estado (pendiente/firmado/vencido). No incluye el archivo binario, solo metadatos.",
  },
  {
    name: "procesos_contratacion",
    domain: "reclutamiento",
    description:
      "Procesos de contratación de conductores: nombre, cédula, estado (pendiente/citado/en_examenes/.../contratado/cierre), validaciones SIMIT y antecedentes, categoría de licencia y fechas del proceso.",
    defaultOrder: "fecha_creacion",
  },

  // ── Familia / Incentivos ────────────────────────────────────────────────────
  {
    name: "familia",
    domain: "rrhh",
    description:
      "Dependientes/familiares de los empleados: cédula del empleado, nombre del familiar, parentesco y edad.",
  },
  {
    name: "incentivos",
    domain: "rrhh",
    description:
      "Pagos de incentivos: cédula, mes de entrega, periodo, valor y concepto.",
    // mes_entrega es texto ("ENERO 2026") y ordena alfabéticamente; periodo es fecha.
    defaultOrder: "periodo",
  },

  // ── GEMA (sincronizado por procedimientos) ──────────────────────────────────
  {
    name: "puntos_virtuales",
    domain: "gema",
    description:
      "Registros GPS de puntos virtuales por vehículo (~90k filas/día, sincronizado desde GEMA): placa, código de vehículo, fecha/hora, punto virtual, subidas/bajadas/abordo, velocidad, latitud/longitud y dirección. Filtre siempre por fecha para acotar.",
    defaultOrder: "fecha_hora",
    idColumn: "numero",
  },
  {
    name: "viajes_recaudados",
    domain: "gema",
    description:
      "Viajes recaudados (sincronizado desde GEMA): fecha del viaje, horas de despacho/llegada, vehículo, conductor, timbradas, bruto, anticipo, neto y fecha de recaudo.",
    defaultOrder: "fecha_viaje",
    idColumn: "numero",
  },
  {
    name: "ingreso_tercero",
    domain: "gema",
    description:
      "Liquidación diaria de ingresos a terceros (sincronizado desde GEMA): fecha, ruta, vehículo, conductor, propietario, pasaje, viajes, timbradas, descuentos, FET, bruto y total cartulina.",
    defaultOrder: "fecha",
  },
  {
    name: "propietarios",
    domain: "gema",
    description:
      "Maestro de propietarios de vehículos (sincronizado desde GEMA): cédula, código, nombre, tipo de propietario, datos de contacto y estado.",
    idColumn: "cedula",
  },

  // ── Campañas (Meta Ads) ─────────────────────────────────────────────────────
  {
    name: "meta_campaigns",
    domain: "campanas",
    description: "Campañas de Meta Ads sincronizadas.",
  },
  {
    name: "meta_spend_daily",
    domain: "campanas",
    description: "Gasto diario por campaña de Meta Ads.",
    defaultOrder: "fecha",
  },

  // ── Organización ────────────────────────────────────────────────────────────
  {
    name: "departments",
    domain: "config",
    description: "Unidades organizacionales / departamentos.",
  },

  // ── Tesorería ──────────────────────────────────────────────────────────────
  {
    name: "devengados_entregas",
    domain: "tesoreria",
    description:
      "Entregas de 'otros devengados' aprobadas en caja a conductores: fecha contable, periodo y quincena, cédula/código/nombre del conductor, viajes liquidados, valor entregado, cuenta contable (281505010, débito) y si ya fue trasladada manualmente a GEMA.",
    defaultOrder: "fecha",
  },

  // ── Ausentismo diario ──────────────────────────────────────────────────────
  {
    name: "ausentismo_registros",
    domain: "ausentismo",
    description:
      "Ausencias diarias de conductores (una fila por conductor y día, cualquier causa: permiso, no justificada, incapacidad, vacaciones, taller), con soporte, vehículo y reclasificación; histórico desde 2026-01-01.",
    defaultOrder: "fecha",
  },
  {
    name: "ausentismo_conceptos",
    domain: "ausentismo",
    description:
      "Catálogo de tipos de ausencia del registro diario, con si cuentan para reincidencia y si exigen soporte.",
    defaultOrder: "created_at",
    idColumn: "key",
  },
  {
    name: "ausentismo_notificaciones",
    domain: "ausentismo",
    description:
      "Marcas de notificación de citación a descargos (4 días seguidos sin justificar) y terminación de contrato (5 o más), con anulación trazable.",
    defaultOrder: "notificado_en",
  },
  {
    name: "ausentismo_catalogos",
    domain: "ausentismo",
    description:
      "Catálogos validados de la matriz EPS: EPS, ARL, IPS, profesionales, CIE10 con diagnóstico y GRD.",
    defaultOrder: "usos",
  },

  // ── Riesgo predictivo ──────────────────────────────────────────────────────
  {
    name: "riesgo_corridas",
    domain: "riesgo",
    description:
      "Una ejecución diaria (o a mano) del análisis predictivo de riesgo de conductores, con corte, estado, calidad y pesos de los modelos de retiro y falta no justificada.",
    defaultOrder: "ejecutada_at",
  },
  {
    name: "riesgo_conductores",
    domain: "riesgo",
    description:
      "Probabilidad estimada de retiro en 60 días y de falta no justificada en 30 días por conductor en cada corrida, con nivel, factores y variables; filtrar siempre por corrida_id.",
    defaultOrder: "prob_retiro",
    // La llave real es (corrida_id, cedula): una cédula aparece en cada corrida.
    idColumn: "cedula",
  },

  // ── Operativo ──────────────────────────────────────────────────────────────
  {
    name: "vehiculos",
    domain: "operativo",
    description:
      "Maestro de buses sincronizado desde GEMA: placa, marca, capacidad, ruta, conductor y propietario asignados, estado (1 = activo) y vencimientos de SOAT, técnico-mecánica, pólizas y tarjeta de operación.",
    idColumn: "codigo",
  },
  {
    name: "velocidades",
    domain: "operativo",
    description:
      "Eventos GPS de 50 km/h o más por vehículo (~1.300/día, desde GEMA), con posición y dirección, sin conductor; filtre siempre por fecha.",
    defaultOrder: "fecha_hora",
    // La llave real es (codigo_vehiculo, fecha_hora).
    idColumn: "codigo_vehiculo",
  },
  {
    name: "pv_deltas",
    domain: "operativo",
    description:
      "Subidas y bajadas de pasajeros por evento GPS con movimiento (~15.000/día), ya como incrementos sumables, con geocerca, hora, vehículo, despacho y ruta normalizada.",
    defaultOrder: "fecha",
    idColumn: "numero",
  },
  {
    name: "operativo_documento_tipos",
    domain: "operativo",
    description:
      "Catálogo de los 5 documentos del vehículo con su columna de fecha en GEMA y los días de aviso de próximo a vencer y crítico.",
    idColumn: "key",
  },
  {
    name: "operativo_vehiculo_documentos",
    domain: "operativo",
    description:
      "Documentos del vehículo cargados en Gestivo (SOAT, técnico-mecánica, pólizas, tarjeta de operación) con número, entidad, vencimiento, archivo y anulación con rastro.",
    defaultOrder: "created_at",
  },
  {
    name: "operativo_velocidad_reportes",
    domain: "operativo",
    description:
      "Conductores reportados a RRHH por exceso de velocidad en una semana de lunes a domingo, con incidencias y velocidad máxima al marcar.",
    defaultOrder: "semana_desde",
  },
  {
    name: "operativo_velocidad_parametros",
    domain: "operativo",
    description:
      "Parámetros vigentes del informe de velocidad: umbral en km/h, mínimo de incidencias semanales y minutos de agrupación.",
  },
  {
    name: "gema_sync_state",
    domain: "gema",
    description:
      "Estado de cada dataset sincronizado desde GEMA (última corrida, marcador de fecha, filas); juzgue la frescura por last_run_at, no por status.",
    defaultOrder: "last_run_at",
    idColumn: "dataset",
  },

  // ── Mantenimiento ──────────────────────────────────────────────────────────
  {
    name: "mantenimiento_reportes",
    domain: "mantenimiento",
    description:
      "Daños de vehículos reportados por conductores (formulario público, captura interna o importación), por vehículo y concepto, ligados a su alerta si se repiten.",
    defaultOrder: "fecha_reporte",
  },
  {
    name: "mantenimiento_alertas",
    domain: "mantenimiento",
    description:
      "Alertas que abre la base cuando un vehículo acumula 2 o más reportes del mismo concepto en 30 días, con estado, orden de taller y cierre.",
    defaultOrder: "created_at",
  },
  {
    name: "mantenimiento_frenos",
    domain: "mantenimiento",
    description:
      "Bitácora diaria por vehículo de si se graduaron los frenos (sí/no con observación), base del formato CPA-R-31.",
    defaultOrder: "fecha",
  },
  {
    name: "mantenimiento_conceptos",
    domain: "mantenimiento",
    description:
      "Catálogo de los 15 tipos de daño mecánico con que se clasifican reportes y alertas.",
  },
];

const RESOURCE_BY_NAME = new Map(
  EXTERNAL_RESOURCES.map((r) => [r.name, r] as const)
);

export function getResource(name: string): ExternalResource | undefined {
  return RESOURCE_BY_NAME.get(name);
}
