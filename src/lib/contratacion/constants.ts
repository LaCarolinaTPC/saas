/** Catálogos del módulo Procesos de contratación (compartidos cliente/servidor). */

/**
 * Estados en el orden real del proceso (requerimientos de selección, 2026-11-10):
 * preselección → antecedentes → citado → prueba de manejo → escuela → fase 1 →
 * fase 2 y rutas → listo para contratar → contratado. La clave `pendiente` se conserva (ahora es la
 * preselección) para no migrar datos ni romper Padrino, MCP y reportes.
 */
export const PROCESO_ESTADOS = [
  { value: "pendiente", label: "Preselección", bg: "#F1F5F9", color: "#64748B" },
  { value: "antecedentes", label: "Antecedentes", bg: "#FCE7F3", color: "#DB2777" },
  { value: "citado", label: "Citado", bg: "#DBEAFE", color: "#2563EB" },
  { value: "prueba_manejo", label: "Prueba de manejo", bg: "#E0E7FF", color: "#4F46E5" },
  { value: "en_escuela", label: "En escuela", bg: "#F3E8FF", color: "#7C3AED" },
  { value: "en_examenes", label: "Exámenes médicos · fase 1", bg: "#FEF3C7", color: "#D97706" },
  { value: "en_examenes_fase2", label: "Fase 2 y reconocimiento de ruta", bg: "#FFEDD5", color: "#EA580C" },
  { value: "reconocimiento_ruta", label: "Reconocimiento de ruta", bg: "#CFFAFE", color: "#0891B2" },
  // 25-nov-2026: cumple todo para contratar menos el visto bueno. Entra y sale solo
  // (lib/seleccion/listo-contratar-servidor): Gestión Humana lo revisa y lo contrata.
  { value: "listo_contratar", label: "Listo para contratar", bg: "#ECFCCB", color: "#4D7C0F" },
  { value: "contratado", label: "Contratado", bg: "#D1FAE5", color: "#059669" },
  { value: "cierre", label: "Cierre de proceso", bg: "#FEE2E2", color: "#EF4444" },
] as const;

export type ProcesoEstado = (typeof PROCESO_ESTADOS)[number]["value"];

/** Estados que cuentan como "en curso" (ni contratado ni cerrado). */
export const ESTADOS_EN_CURSO: ProcesoEstado[] = PROCESO_ESTADOS.map((e) => e.value).filter(
  (v): v is ProcesoEstado => v !== "contratado" && v !== "cierre"
);

/** Posición del estado en el embudo (-1 si no se reconoce). */
export function ordenEstado(value: string | null | undefined): number {
  return PROCESO_ESTADOS.findIndex((e) => e.value === value);
}

/** Causas de cierre en la preselección (B1), una por requisito. */
export const CAUSAS_PRESELECCION = {
  edad: "Edad fuera del rango",
  residencia: "Fuera de la zona y sin traslado",
  licencia: "Licencia no válida (no tiene, vencida o distinta de C2/C3)",
  simit: "SIMIT por encima del tope",
  autorizacion: "No autorizó el tratamiento de datos",
} as const;

/** Cierre por antecedentes: al aspirante se le dice solo que no pasó el proceso, sin el motivo. */
export const CAUSA_ANTECEDENTES = "Antecedentes";

/**
 * Filtro de Candidatos «Reingresos por revisar»: aspirantes del asistente que
 * ya trabajaron en la empresa (reingreso) y siguen en la preselección. Los
 * revisa una persona; al citarlos o cerrarlos salen de la lista.
 */
export const FILTRO_REINGRESOS = "reingresos_por_revisar";

/**
 * Filtro «Apadrinados sin padrino»: candidatos en curso que dijeron venir
 * recomendados por alguien de la empresa (primera pregunta del asistente, o
 * marcados a mano) y todavía no tienen registro en el Plan Padrino. Gestión
 * Humana les asigna el padrino; al asignarlo salen de la lista.
 */
export const FILTRO_APADRINADOS = "apadrinados_sin_padrino";
export const ESTADOS_REVISION_REINGRESO = ["pendiente", "antecedentes"] as const;

/**
 * Filtro «Revisión de antecedentes» (entrega 3): las reglas mandaron el caso a
 * una persona (revisión o cierre propuesto) y nadie ha decidido todavía.
 */
export const FILTRO_ANTECEDENTES = "antecedentes_por_revisar";

/**
 * Filtro «Psicosensotécnica: por inscribir» (24-nov-2026): confirmaron su
 * correo y Gestión Humana todavía no los inscribe en la plataforma.
 */
export const FILTRO_PSICO_INSCRIBIR = "psico_por_inscribir";

/** Cierre automático: la cédula ya es de un conductor activo de la empresa (Gestivo). */
export const CAUSA_YA_TRABAJA = "Ya trabaja en la empresa";

/** Causas frecuentes de no contratación (la columna admite texto libre). */
export const CAUSAS_NO_CONTRATO = [
  "No se ajusta al perfil",
  "Desistimiento",
  "Incomunicado",
  ...Object.values(CAUSAS_PRESELECCION),
  CAUSA_ANTECEDENTES,
  CAUSA_YA_TRABAJA,
  "Exámenes médicos",
  "No aprobado reintegro",
  "Proceso psicotécnico",
  "No pasó prueba de manejo",
  "No pasó reconocimiento de ruta",
  "No aceptado por el profesor",
  "Laborando en otra empresa",
  "Deuda SIMIT",
] as const;

export const SIMIT_ESTADOS = [
  { value: "ok", label: "OK (sin deuda)" },
  { value: "deuda", label: "Deuda" },
  { value: "acuerdo_pago", label: "Acuerdo de pago" },
  { value: "pendiente", label: "Pendiente verificar" },
] as const;

export const ANTECEDENTES_ESTADOS = [
  { value: "ok", label: "Sin antecedentes" },
  { value: "con_antecedentes", label: "Con antecedentes" },
  { value: "pendiente", label: "Pendiente verificar" },
] as const;

export const MEDIOS_POSTULACION = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "computrabajo", label: "Computrabajo" },
  { value: "referido", label: "Referido" },
  { value: "varylo", label: "Varylo" },
  { value: "manychat", label: "ManyChat" },
  { value: "voluntario", label: "Voluntario" },
  { value: "reingreso", label: "Reingreso" },
  { value: "otro", label: "Otro" },
] as const;

export const LICENCIA_CATEGORIAS = ["A1", "A2", "B1", "B2", "B3", "C1", "C2", "C3"] as const;

export function estadoInfo(value: string | null | undefined) {
  return PROCESO_ESTADOS.find((e) => e.value === value) ?? null;
}

/**
 * Cómo se ve la etapa de una postulación (candidate_vacancy.current_stage).
 * Es el estado del proceso de contratación, salvo «pendiente», que se guarda
 * como «recibido», y «cierre», como «rechazado» (contratacion/servidor.ts).
 * Lo que no se reconoce (etapas antiguas) se muestra tal cual, en gris.
 */
export function etapaDePostulacion(stage: string | null | undefined): { label: string; bg: string; color: string } {
  const info = estadoInfo(stage === "recibido" ? "pendiente" : stage === "rechazado" ? "cierre" : stage);
  if (info) return { label: info.label, bg: info.bg, color: info.color };
  const label = (stage || "—").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { label, bg: "#F1F5F9", color: "#64748B" };
}

export interface ProcesoContratacion {
  id: string;
  candidate_id: string | null;
  vacancy_id: string | null;
  vacancies?: { title: string } | null;
  fecha_creacion: string;
  nombre: string;
  cedula: string;
  celular: string | null;
  reingreso: boolean;
  estado: string;
  causa_no_contrato: string | null;
  observacion: string | null;
  simit: string | null;
  simit_valor: number;
  antecedentes: string | null;
  licencia_categoria: string | null;
  medio_postulacion: string | null;
  /**
   * Viene recomendado por alguien de la empresa («apadrinado»): lo dijo por
   * WhatsApp o lo marcó Gestión Humana. null = no ha respondido (migración 20261121181420).
   */
  recomendado?: boolean | null;
  /** Cuándo lo dijo: cuenta como fecha de registro en el Plan Padrino (regla R13). */
  recomendado_at?: string | null;
  /** Quién lo recomendó, como lo escribió. Pista para asignar el padrino; no se valida. */
  recomendado_por?: string | null;
  fecha_citacion: string | null;
  /** Citación a exámenes médicos, fase 1. */
  fecha_examenes: string | null;
  /** Citación a exámenes médicos, fase 2. */
  fecha_examenes_fase2: string | null;
  /** Concepto final del profesor de manejo (entrega 2 de selección). */
  profesor_concepto?: "acepta" | "rechaza" | null;
  fecha_prueba_manejo: string | null;
  fecha_contrato: string | null;
  // Prefiltro y preselección (entrega 1 de selección; migración 20261113205625).
  edad?: number | null;
  /** La que dio por WhatsApp; la edad se calcula con ella (migración 20261117214219). */
  fecha_nacimiento?: string | null;
  /** Fecha de expedición de la cédula: la exige el RNMC (migración 20261117214219). */
  cedula_fecha_expedicion?: string | null;
  /** Licencia vencida en el RUNT: ¿dijo por WhatsApp que la va a renovar? (migración 20261117214219). */
  renovara_licencia?: boolean | null;
  ciudad_residencia?: string | null;
  dispuesto_traslado?: boolean | null;
  /** Si se traslada: cuándo estaría en la ciudad, como lo dijo por WhatsApp (migración 20261120011552). */
  llegada_ciudad?: string | null;
  /** Desde cuándo puede empezar a trabajar, como lo dijo por WhatsApp (migración 20261120011552). */
  disponibilidad?: string | null;
  experiencia_meses?: number | null;
  /** Respuestas a las preguntas de los mensajes de exámenes (migración 20261124194635). */
  banco_cuenta?: "si" | "no" | null;
  banco_preguntado_at?: string | null;
  banco_respondido_at?: string | null;
  rutas_declaradas?: number | null;
  rutas_preguntado_at?: string | null;
  rutas_respondido_at?: string | null;
  /** Reconocimiento de ruta con su encargado (migración 20261124203802). */
  reconocimiento_estado?: "pendiente" | "por_verificar" | "en_curso" | "finalizado" | null;
  reconocimiento_finalizado_at?: string | null;
  reconocimiento_finalizado_por?: string | null;
  /** Visto bueno de la directora para contratar (entrega 3); en «Listo para contratar» la tarjeta dice si ya lo tiene. */
  aprobacion_contratacion_at?: string | null;
  /** Solo en el tablero: un documento leído trae una cédula distinta a la del proceso, sin revisar (25-nov-2026). */
  cedula_no_coincide?: boolean;
  /** Solo en el tablero: examen no apto por revisar (o aplazado), para marcar la tarjeta (24-nov-2026). */
  revision_examen?: { fase: 1 | 2; resultado: "no_apto" | "aplazado"; observacion: string | null } | null;
  licencia_verificada_runt?: boolean;
  /** Licencia según el RUNT (Croma); con ella la verificación ya no es manual (migración 20261114180402). */
  licencia_runt?: {
    tieneLicencia: boolean;
    categorias: { categoria: string; vence: string | null; activa: boolean }[];
    consultadoEl: string;
    /** Nombre y restricciones del RUNT (desde el 17-nov-2026; las consultas anteriores no los traen). */
    nombre?: string | null;
    restricciones?: string[];
  } | null;
  hoja_vida_recibida_at?: string | null;
  autorizacion_datos?: "si" | "no" | null;
  autorizacion_datos_at?: string | null;
  preseleccion?: ResultadoPreseleccionGuardado | null;
  requisito_incumplido?: string | null;
  carta_laboral_pendiente?: boolean;
  /** chat_prueba: guardado desde el chat de prueba de la selección (casilla «Guardar en Candidatos»). */
  origen?: "manual" | "whatsapp_agente" | "webhook" | "chat_prueba";
  created_at: string;
  updated_at: string;
}

export type ColorSemaforo = "verde" | "rojo" | "pendiente";
export type RequisitoPreseleccion = "edad" | "residencia" | "licencia" | "simit";

export interface ResultadoRequisito {
  color: ColorSemaforo;
  motivo: string;
  /** declarado: lo dijo el aspirante; verificado: fuente externa o GH. */
  origen: "declarado" | "verificado" | null;
}

export interface ResultadoPreseleccionGuardado {
  edad: ResultadoRequisito;
  residencia: ResultadoRequisito;
  licencia: ResultadoRequisito;
  simit: ResultadoRequisito;
  /** pasa: los 4 en verde · no_cumple: alguno en rojo · incompleto: falta algún dato. */
  global: "pasa" | "no_cumple" | "incompleto";
  /** Primer requisito en rojo, si hay. */
  incumplido: RequisitoPreseleccion | null;
  evaluado_at: string;
}

export const REQUISITOS_PRESELECCION: { key: RequisitoPreseleccion; label: string }[] = [
  { key: "edad", label: "Edad" },
  { key: "residencia", label: "Residencia" },
  { key: "licencia", label: "Licencia" },
  { key: "simit", label: "SIMIT" },
];

/** Campo de fecha sobre el que actúan los filtros de rango (mes / desde / hasta). */
export const CAMPOS_FECHA = [
  { value: "creacion", columna: "fecha_creacion", label: "Fecha de creación", corto: "Fecha creación" },
  { value: "citacion", columna: "fecha_citacion", label: "Fecha de citación", corto: "Fecha citación" },
] as const;

export type CampoFecha = (typeof CAMPOS_FECHA)[number]["value"];

/** Campo de fecha pedido, o el de creación cuando no viene o no se reconoce. */
export function campoFecha(value: string | null | undefined) {
  return CAMPOS_FECHA.find((c) => c.value === value) ?? CAMPOS_FECHA[0];
}
