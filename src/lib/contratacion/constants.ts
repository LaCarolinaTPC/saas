/** Catálogos del módulo Procesos de contratación (compartidos cliente/servidor). */

/**
 * Estados en el orden real del proceso (requerimientos de selección, 2026-11-10):
 * preselección → antecedentes → citado → prueba de manejo → escuela → fase 1 →
 * fase 2 y rutas → contratado. La clave `pendiente` se conserva (ahora es la
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

/** Causas frecuentes de no contratación (la columna admite texto libre). */
export const CAUSAS_NO_CONTRATO = [
  "No se ajusta al perfil",
  "Desistimiento",
  "Incomunicado",
  ...Object.values(CAUSAS_PRESELECCION),
  "Exámenes médicos",
  "No aprobado reintegro",
  "Proceso psicotécnico",
  "No pasó prueba de manejo",
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
  fecha_citacion: string | null;
  /** Citación a exámenes médicos, fase 1. */
  fecha_examenes: string | null;
  /** Citación a exámenes médicos, fase 2. */
  fecha_examenes_fase2: string | null;
  fecha_prueba_manejo: string | null;
  fecha_contrato: string | null;
  // Prefiltro y preselección (entrega 1 de selección; migración 20261113205625).
  edad?: number | null;
  ciudad_residencia?: string | null;
  dispuesto_traslado?: boolean | null;
  experiencia_meses?: number | null;
  licencia_verificada_runt?: boolean;
  /** Licencia según el RUNT (Croma); con ella la verificación ya no es manual (migración 20261114180402). */
  licencia_runt?: { tieneLicencia: boolean; categorias: { categoria: string; vence: string | null; activa: boolean }[]; consultadoEl: string } | null;
  hoja_vida_recibida_at?: string | null;
  autorizacion_datos?: "si" | "no" | null;
  autorizacion_datos_at?: string | null;
  preseleccion?: ResultadoPreseleccionGuardado | null;
  requisito_incumplido?: string | null;
  carta_laboral_pendiente?: boolean;
  origen?: "manual" | "whatsapp_agente" | "webhook";
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
