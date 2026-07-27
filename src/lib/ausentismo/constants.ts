/** Catálogos del módulo de Ausentismo — parte pura, usable en cliente. */

/**
 * Tipos de ausencia, derivados de las justificaciones reales del Excel
 * "AUSENTES DE 2026" (incapacidad, vacaciones, descanso, permiso, suspensión,
 * calamidad, licencia de paternidad, cita EPS, taller, apagado/no contesta…).
 */
export const TIPOS_AUSENCIA = [
  { key: "incapacidad", label: "Incapacidad" },
  { key: "permiso", label: "Permiso" },
  { key: "vacaciones", label: "Vacaciones" },
  { key: "descanso", label: "Descanso" },
  { key: "suspension", label: "Suspensión" },
  { key: "calamidad", label: "Calamidad familiar" },
  { key: "licencia", label: "Licencia (paternidad/maternidad)" },
  { key: "eps", label: "Cita médica / EPS" },
  { key: "taller", label: "Vehículo en taller" },
  { key: "no_justificada", label: "No justificada" },
  { key: "renuncia", label: "Renuncia / retiro" },
  { key: "otra", label: "Otra" },
] as const;

export type TipoAusencia = (typeof TIPOS_AUSENCIA)[number]["key"];

/** Resultado del intento de contacto (columna "apagado / no contesta…"). */
export const CONTACTOS = [
  { key: "apagado", label: "Apagado" },
  { key: "no_contesta", label: "No contesta" },
  { key: "desvia_llamadas", label: "Desvía llamadas" },
  { key: "localizado", label: "Localizado" },
] as const;

export const SOPORTES = [
  { key: "no_aplica", label: "No aplica" },
  { key: "pendiente", label: "Debe traer soporte" },
  { key: "presentado", label: "Soporte presentado" },
] as const;

export const TIPO_LABEL = Object.fromEntries(
  TIPOS_AUSENCIA.map((t) => [t.key, t.label])
) as Record<string, string>;
export const CONTACTO_LABEL = Object.fromEntries(
  CONTACTOS.map((c) => [c.key, c.label])
) as Record<string, string>;
export const SOPORTE_LABEL = Object.fromEntries(
  SOPORTES.map((s) => [s.key, s.label])
) as Record<string, string>;

export const TIPO_KEYS = new Set(TIPOS_AUSENCIA.map((t) => t.key as string));
export const CONTACTO_KEYS = new Set(CONTACTOS.map((c) => c.key as string));
export const SOPORTE_KEYS = new Set(SOPORTES.map((s) => s.key as string));

/** Reincidente: 3 o más ausencias en los últimos 30 días. */
export const REINCIDENCIA_DIAS = 30;
export const REINCIDENCIA_MINIMO = 3;

export interface AusentismoRegistro {
  id: string;
  fecha: string;
  cedula: string;
  codigo: string | null;
  nombre: string;
  telefono: string | null;
  tipo: string;
  contacto: string | null;
  justificacion: string | null;
  incapacidad_inicio: string | null;
  incapacidad_fin: string | null;
  reintegro: string | null;
  soporte: string;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}
