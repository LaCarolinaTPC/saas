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
/** Cita médica / EPS: categoría propia de la alerta de reincidentes. */
export const CONCEPTO_EPS = "eps";

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

/** Reincidente: 3 o más ausencias en los últimos 30 días (valores por defecto). */
export const REINCIDENCIA_DIAS = 30;
export const REINCIDENCIA_MINIMO = 3;
/** Ventanas y mínimos que se pueden elegir en la pestaña. */
export const VENTANAS_REINCIDENCIA = [30, 60, 90] as const;
export const MINIMOS_REINCIDENCIA = [2, 3, 4] as const;

/**
 * Días seguidos sin justificar que disparan el proceso disciplinario:
 * al cuarto día se notifica la citación a descargos y al quinto la
 * terminación del contrato. Los días son calendario, contados sobre las
 * fechas que cubren los registros "No justificada" (fecha del registro y su
 * rango inicio–fin) hasta el corte.
 */
export const DIAS_DESCARGOS = 4;
export const DIAS_TERMINACION = 5;

/**
 * Alerta de reincidente no justificado. Se calcula del propio registro, de
 * mayor a menor gravedad:
 *  - terminación: cinco o más días seguidos sin justificar;
 *  - descargos: cuatro días seguidos sin justificar;
 *  - crítica: dos o más ausencias "No justificada" en la ventana;
 *  - alta: una "No justificada", o soportes pendientes por entregar;
 *  - null: reincidente con todo justificado (se lista, no alerta).
 */
export type NivelAlerta = "terminacion" | "descargos" | "critica" | "alta";
export const NIVELES_ALERTA: NivelAlerta[] = ["terminacion", "descargos", "critica", "alta"];
export const NIVEL_ALERTA_LABEL: Record<NivelAlerta, string> = {
  terminacion: "Terminación",
  descargos: "Descargos",
  critica: "Crítica",
  alta: "Alta",
};
/** Qué debe hacer RRHH en cada nivel; sale junto al chip y en los informes. */
export const NIVEL_ALERTA_ACCION: Record<NivelAlerta, string> = {
  terminacion: `Notificar terminación de contrato (${DIAS_TERMINACION}+ días seguidos sin justificar)`,
  descargos: `Notificar citación a descargos (${DIAS_DESCARGOS} días seguidos sin justificar)`,
  critica: "Dos o más faltas no justificadas en la ventana",
  alta: "Una falta no justificada o soportes pendientes",
};
/**
 * Un color por nivel, compartido por la pantalla, el PDF y el aviso del día:
 * `fuerte` para chips y títulos, `suave` para el fondo de la fila.
 */
export const NIVEL_ALERTA_COLOR: Record<NivelAlerta, { fuerte: string; suave: string; texto: string }> = {
  terminacion: { fuerte: "#111827", suave: "#E5E7EB", texto: "#111827" },
  descargos: { fuerte: "#7C3AED", suave: "#F3E8FF", texto: "#5B21B6" },
  critica: { fuerte: "#DC2626", suave: "#FEF2F2", texto: "#991B1B" },
  alta: { fuerte: "#F59E0B", suave: "#FFFBEB", texto: "#92400E" },
};
/** Orden de gravedad para ordenar y agrupar (menor = más grave). */
export const ORDEN_NIVEL: Record<NivelAlerta, number> = { terminacion: 0, descargos: 1, critica: 2, alta: 3 };

/** Cuántos hay en cada nivel; sirve al aviso del día, la pestaña y los informes. */
export function conteoPorNivel(lista: { alerta: NivelAlerta | null }[]): Record<NivelAlerta, number> {
  const c: Record<NivelAlerta, number> = { terminacion: 0, descargos: 0, critica: 0, alta: 0 };
  for (const r of lista) if (r.alerta) c[r.alerta] += 1;
  return c;
}

/** El nivel más grave presente en el conteo, o null si no hay alertas. */
export function nivelMasGrave(c: Record<NivelAlerta, number>): NivelAlerta | null {
  return NIVELES_ALERTA.find((n) => c[n] > 0) ?? null;
}

export function nivelAlertaReincidente(r: {
  noJustificadas: number;
  soportesPendientes: number;
  /** Días seguidos sin justificar (racha vigente más reciente). */
  rachaNoJustificada?: number;
}): NivelAlerta | null {
  const racha = r.rachaNoJustificada ?? 0;
  if (racha >= DIAS_TERMINACION) return "terminacion";
  if (racha >= DIAS_DESCARGOS) return "descargos";
  if (r.noJustificadas >= 2) return "critica";
  if (r.noJustificadas >= 1 || r.soportesPendientes >= 1) return "alta";
  return null;
}

/** Racha de días calendario consecutivos: la más reciente, con su rango. */
export interface Racha {
  dias: number;
  desde: string | null;
  hasta: string | null;
}

const DIA_MS = 24 * 3600 * 1000;

/** Días calendario entre dos fechas ISO (YYYY-MM-DD), sin zona horaria. */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
    - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / DIA_MS);
}

/** Suma `n` días a una fecha ISO. */
export function sumarDias(fecha: string, n: number): string {
  return new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)) + n * DIA_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Racha más reciente de días consecutivos dentro de un conjunto de fechas
 * ISO (con repetidos o desordenadas). Termina en la fecha mayor y retrocede
 * mientras el día anterior también esté en el conjunto.
 */
export function rachaMasReciente(fechas: Iterable<string>): Racha {
  const set = new Set(fechas);
  if (set.size === 0) return { dias: 0, desde: null, hasta: null };
  const hasta = [...set].sort().at(-1)!;
  let desde = hasta;
  while (set.has(sumarDias(desde, -1))) desde = sumarDias(desde, -1);
  return { dias: diasEntre(desde, hasta) + 1, desde, hasta };
}

/**
 * Categoría por la que se mide la reincidencia. Vacía, se cuentan todas las
 * ausencias que el catálogo marca como reincidencia; con una clave, solo las
 * de ese concepto (y el mínimo se aplica sobre ese conteo).
 */
export const CATEGORIAS_REINCIDENCIA = [
  { key: "", label: "Todas las ausencias" },
  { key: CONCEPTO_EPS, label: "Citas médicas / EPS" },
  { key: CONCEPTO_INCAPACIDAD, label: "Incapacidades" },
  { key: CONCEPTO_NO_JUSTIFICADA, label: "No justificadas" },
] as const;
export type CategoriaReincidencia = (typeof CATEGORIAS_REINCIDENCIA)[number]["key"];
export const CATEGORIA_KEYS = new Set<string>(CATEGORIAS_REINCIDENCIA.map((c) => c.key));

export const CRITERIOS_REINCIDENCIA = [
  { key: "", label: "Todos" },
  { key: "alerta", label: "Solo con alerta" },
  { key: "terminacion", label: `Terminación de contrato (${DIAS_TERMINACION}+ días)` },
  { key: "descargos", label: `Citación a descargos (${DIAS_DESCARGOS} días)` },
  { key: "critica", label: "Solo críticas" },
  { key: "soportes", label: "Solo soportes pendientes" },
] as const;
export const CRITERIO_KEYS = new Set<string>(CRITERIOS_REINCIDENCIA.map((c) => c.key));

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
