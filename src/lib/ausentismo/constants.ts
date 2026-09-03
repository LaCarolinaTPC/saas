/** Catálogos del módulo de Ausentismo — parte pura, usable en cliente. */

/**
 * Concepto (tipo) de ausencia. Vive en la tabla `ausentismo_conceptos` y se
 * puede ampliar desde el propio formulario; en código solo queda la forma.
 * Las claves históricas (incapacidad, permiso, vacaciones, descanso,
 * suspension, calamidad, licencia, eps, taller, no_justificada, renuncia,
 * otra) siguen existiendo como filas sembradas por la migración.
 */
export interface Concepto {
  key: string;
  nombre: string;
  orden: number;
  activo: boolean;
  /** Vacaciones y descansos son programados: no suman como reincidencia. */
  cuenta_reincidencia: boolean;
  /** Al elegirlo, el formulario sugiere "Debe traer soporte". */
  exige_soporte: boolean;
}

/** Concepto por defecto al abrir el formulario de alta. */
export const CONCEPTO_DEFECTO = "permiso";

/** Claves con comportamiento propio en el formulario (campos extra). */
export const CONCEPTO_INCAPACIDAD = "incapacidad";
export const CONCEPTO_NO_JUSTIFICADA = "no_justificada";

/** Mapa clave → nombre a partir del catálogo cargado. */
export function conceptoLabels(conceptos: Concepto[]): Record<string, string> {
  return Object.fromEntries(conceptos.map((c) => [c.key, c.nombre]));
}

/**
 * Clave estable a partir del nombre: minúsculas, sin tildes, guiones bajos.
 * "Cita médica / EPS" → "cita_medica_eps". Se usa al crear un concepto.
 */
export function claveDesdeNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    // Quita las marcas diacríticas que NFD separó (tildes, diéresis).
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

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

export const CONTACTO_LABEL = Object.fromEntries(
  CONTACTOS.map((c) => [c.key, c.label])
) as Record<string, string>;
export const SOPORTE_LABEL = Object.fromEntries(
  SOPORTES.map((s) => [s.key, s.label])
) as Record<string, string>;

export const CONTACTO_KEYS = new Set(CONTACTOS.map((c) => c.key as string));
export const SOPORTE_KEYS = new Set(SOPORTES.map((s) => s.key as string));

/**
 * Tope de filas del historial. Si la consulta lo alcanza, la pantalla y las
 * exportaciones avisan que hay que acotar el rango.
 */
export const HISTORIAL_LIMITE = 1000;

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
  /** Clave de `ausentismo_conceptos`. */
  tipo: string;
  contacto: string | null;
  justificacion: string | null;
  incapacidad_inicio: string | null;
  incapacidad_fin: string | null;
  reintegro: string | null;
  soporte: string;
  /** Anotación que se despliega al elegir un soporte (qué se pidió / qué llegó). */
  soporte_observaciones: string | null;
  /** Llave del maestro `vehiculos` (GEMA); la placa se resuelve en la consulta. */
  codigo_vehiculo: string | null;
  /** Rango de la ausencia. `fecha` sigue siendo el día en que se registra. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /**
   * Concepto con el que se creó el registro. Lo sella un trigger y no se
   * muestra en el formulario: sirve para validar después el registro inicial
   * contra el actual (vista `vw_ausentismo_reclasificados`).
   */
  tipo_inicial: string;
  tipo_modificado_at: string | null;
  modificado_por_email: string | null;
  motivo_modificacion: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  /** Join con el maestro: solo para mostrar la placa. */
  vehiculos?: { placa: string | null } | null;
}

/** Vehículo activo del maestro, para el selector del formulario. */
export interface VehiculoOpcion {
  codigo: string;
  placa: string | null;
  cedula_conductor: string | null;
}

export function etiquetaVehiculo(v: { codigo: string; placa: string | null }) {
  return v.placa ? `${v.codigo} — ${v.placa}` : v.codigo;
}
