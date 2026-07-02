/** Catálogos del módulo Procesos de contratación (compartidos cliente/servidor). */

export const PROCESO_ESTADOS = [
  { value: "pendiente", label: "Pendiente por citar", bg: "#F1F5F9", color: "#64748B" },
  { value: "citado", label: "Citado", bg: "#DBEAFE", color: "#2563EB" },
  { value: "en_examenes", label: "En exámenes médicos", bg: "#FEF3C7", color: "#D97706" },
  { value: "prueba_manejo", label: "Prueba de manejo", bg: "#E0E7FF", color: "#4F46E5" },
  { value: "en_escuela", label: "En escuela", bg: "#F3E8FF", color: "#7C3AED" },
  { value: "reconocimiento_ruta", label: "Reconocimiento de ruta", bg: "#CFFAFE", color: "#0891B2" },
  { value: "contratado", label: "Contratado", bg: "#D1FAE5", color: "#059669" },
  { value: "cierre", label: "Cierre de proceso", bg: "#FEE2E2", color: "#EF4444" },
] as const;

export type ProcesoEstado = (typeof PROCESO_ESTADOS)[number]["value"];

/** Estados que cuentan como "en curso" (ni contratado ni cerrado). */
export const ESTADOS_EN_CURSO: ProcesoEstado[] = [
  "pendiente", "citado", "en_examenes", "prueba_manejo", "en_escuela", "reconocimiento_ruta",
];

/** Causas frecuentes de no contratación (la columna admite texto libre). */
export const CAUSAS_NO_CONTRATO = [
  "No se ajusta al perfil",
  "Desistimiento",
  "Incomunicado",
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
  fecha_examenes: string | null;
  fecha_prueba_manejo: string | null;
  fecha_contrato: string | null;
  created_at: string;
  updated_at: string;
}
