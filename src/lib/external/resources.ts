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
};

export const EXTERNAL_RESOURCES: ExternalResource[] = [
  // ── Rotación ───────────────────────────────────────────────────────────────
  {
    name: "conductores_con_grupo",
    domain: "rotacion",
    description:
      "Maestro de conductores con su grupo de antigüedad. Incluye cédula, nombre, código, tipo de conductor, estado (ACTIVO/RETIRADO), grupo y meses de antigüedad, fecha de ingreso.",
    defaultOrder: "fecha_ingreso",
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
    defaultOrder: "mes_entrega",
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
];

const RESOURCE_BY_NAME = new Map(
  EXTERNAL_RESOURCES.map((r) => [r.name, r] as const)
);

export function getResource(name: string): ExternalResource | undefined {
  return RESOURCE_BY_NAME.get(name);
}
