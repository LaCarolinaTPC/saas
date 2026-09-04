/** Módulo Operativo — parte pura, usable en cliente: tipos, niveles y colores. */

/** Fila del catálogo `operativo_documento_tipos`. */
export interface TipoDocumento {
  key: string;
  nombre: string;
  /** Columna DATE de `vehiculos` que GEMA sincroniza para este documento. */
  columna_gema: string | null;
  dias_proximo: number;
  dias_critico: number;
  orden: number;
  activo: boolean;
}

/**
 * Nivel de vencimiento, ordenado por gravedad (menor índice = más grave):
 *  - sin_dato: ni GEMA ni un documento cargado tienen fecha; lo más grave,
 *    porque no se sabe si el vehículo está cubierto;
 *  - vencido: la fecha que rige ya pasó;
 *  - critico: vence dentro de `dias_critico` días;
 *  - proximo: vence dentro de `dias_proximo` días;
 *  - al_dia: vence después.
 */
export type NivelVencimiento = "sin_dato" | "vencido" | "critico" | "proximo" | "al_dia";
export const NIVELES_VENCIMIENTO: NivelVencimiento[] = ["sin_dato", "vencido", "critico", "proximo", "al_dia"];
/** Los que alertan (todo menos al día). */
export const NIVELES_ALERTA: NivelVencimiento[] = ["sin_dato", "vencido", "critico", "proximo"];
export const ORDEN_NIVEL: Record<NivelVencimiento, number> = { sin_dato: 0, vencido: 1, critico: 2, proximo: 3, al_dia: 4 };

export const NIVEL_LABEL: Record<NivelVencimiento, string> = {
  sin_dato: "Sin dato",
  vencido: "Vencido",
  critico: "Crítico",
  proximo: "Próximo a vencer",
  al_dia: "Al día",
};
/** Qué debe hacer Operativo en cada nivel; sale junto al chip y en los informes. */
export const NIVEL_ACCION: Record<NivelVencimiento, string> = {
  sin_dato: "Sin fecha en GEMA ni documento cargado: verificar y cargar el documento",
  vencido: "Documento vencido: el vehículo no debe operar hasta renovarlo",
  critico: "Renovar de inmediato",
  proximo: "Programar la renovación",
  al_dia: "Sin acción",
};
/**
 * Un color por nivel, compartido por la pantalla, el PDF y los avisos:
 * `fuerte` para chips y títulos, `suave` para el fondo de la fila.
 */
export const NIVEL_COLOR: Record<NivelVencimiento, { fuerte: string; suave: string; texto: string }> = {
  sin_dato: { fuerte: "#6B7280", suave: "#F3F4F6", texto: "#374151" },
  vencido: { fuerte: "#111827", suave: "#E5E7EB", texto: "#111827" },
  critico: { fuerte: "#DC2626", suave: "#FEF2F2", texto: "#991B1B" },
  proximo: { fuerte: "#F59E0B", suave: "#FFFBEB", texto: "#92400E" },
  al_dia: { fuerte: "#059669", suave: "#ECFDF5", texto: "#065F46" },
};

/** Nivel a partir de los días que faltan (null = sin fecha) y los umbrales del tipo. */
export function nivelVencimiento(
  dias: number | null,
  umbrales: { dias_proximo: number; dias_critico: number }
): NivelVencimiento {
  if (dias === null) return "sin_dato";
  if (dias < 0) return "vencido";
  if (dias <= umbrales.dias_critico) return "critico";
  if (dias <= umbrales.dias_proximo) return "proximo";
  return "al_dia";
}

export function conteoPorNivel(filas: { nivel: NivelVencimiento }[]): Record<NivelVencimiento, number> {
  const c: Record<NivelVencimiento, number> = { sin_dato: 0, vencido: 0, critico: 0, proximo: 0, al_dia: 0 };
  for (const f of filas) c[f.nivel] += 1;
  return c;
}

/** El nivel más grave presente entre los que alertan, o null si todo está al día. */
export function nivelMasGrave(c: Record<NivelVencimiento, number>): NivelVencimiento | null {
  return NIVELES_ALERTA.find((n) => c[n] > 0) ?? null;
}

/** El peor nivel de una lista de filas (al_dia si está vacía). */
export function peorNivel(filas: { nivel: NivelVencimiento }[]): NivelVencimiento {
  return filas.reduce<NivelVencimiento>(
    (peor, f) => (ORDEN_NIVEL[f.nivel] < ORDEN_NIVEL[peor] ? f.nivel : peor),
    "al_dia"
  );
}

/** Texto corto de los días: "vence en 12 días", "venció hace 3 días", "vence hoy". */
export function textoDias(dias: number | null): string {
  if (dias === null) return "sin fecha";
  if (dias === 0) return "vence hoy";
  if (dias < 0) return `venció hace ${-dias} día${dias === -1 ? "" : "s"}`;
  return `vence en ${dias} día${dias === 1 ? "" : "s"}`;
}

/** Fila de `vw_operativo_vencimientos` más lo que calcula la app. */
export interface Vencimiento {
  codigo: string;
  placa: string | null;
  marca: string | null;
  clase: string | null;
  ruta: string | null;
  conductor_nombre: string | null;
  cedula_conductor: string | null;
  tipo: string;
  tipo_nombre: string;
  tipo_orden: number;
  dias_proximo: number;
  dias_critico: number;
  fecha_gema: string | null;
  documento_id: string | null;
  fecha_documento: string | null;
  numero: string | null;
  entidad: string | null;
  archivo_ruta: string | null;
  archivo_nombre: string | null;
  /** La más reciente entre GEMA y el documento; null si no hay ninguna. */
  fecha_vigente: string | null;
  discrepancia: boolean;
  /** Calculados con la fecha de Bogotá. */
  dias: number | null;
  nivel: NivelVencimiento;
}

/** Documento cargado, tal como se guarda, más la URL firmada para verlo. */
export interface DocumentoVehiculo {
  id: string;
  codigo_vehiculo: string;
  tipo: string;
  numero: string | null;
  entidad: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string;
  archivo_ruta: string | null;
  archivo_nombre: string | null;
  archivo_mime: string | null;
  archivo_tamano: number | null;
  observaciones: string | null;
  created_by_email: string | null;
  created_at: string;
  anulado_en: string | null;
  anulado_por_email: string | null;
  motivo_anulacion: string | null;
  /** URL firmada de una hora, o null si no hay archivo. */
  url: string | null;
}

/** Vehículo del maestro GEMA, con los campos que muestra la ficha. */
export interface VehiculoFicha {
  codigo: string;
  placa: string | null;
  marca: string | null;
  clase: string | null;
  modelo: string | null;
  color: string | null;
  motor: string | null;
  chasis: string | null;
  tipo_carroceria: string | null;
  capacidad_sentado: number | null;
  capacidad_en_pie: number | null;
  ruta: string | null;
  estado: number | null;
  numero_tarjeta_op: string | null;
  tarjeta_propiedad: string | null;
  activo_poliza: boolean | null;
  activo_cartulina: boolean | null;
  conductor_nombre: string | null;
  cedula_conductor: string | null;
  propietario_nombre: string | null;
  cedula_propietario: string | null;
  propietario_admin: string | null;
  fecha_soat: string | null;
  fecha_tecno: string | null;
  fecha_tarjeta_op: string | null;
  fecha_srcc: string | null;
  fecha_srce: string | null;
  fecha_full_amparo: string | null;
  fecha_contrato: string | null;
  updated_at: string | null;
}

export function etiquetaVehiculo(v: { codigo: string; placa: string | null }) {
  return v.placa ? `${v.codigo} — ${v.placa}` : v.codigo;
}

/**
 * Límites del archivo, compartidos por el <input accept>, la comprobación en
 * el navegador y la ruta API. Vercel corta el cuerpo en ~4,5 MB: 4 MB deja
 * margen para el resto del formulario.
 */
export const ARCHIVO_LIMITE_BYTES = 4 * 1024 * 1024;
export const ARCHIVO_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const ARCHIVO_ACCEPT = ".pdf,image/jpeg,image/png,image/webp";

export function tamanoLegible(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * "2026-09-04" → "04/09/2026". Se arma desde el texto, sin pasar por Date:
 * `new Date("2026-09-04")` es medianoche UTC, que en Bogotá todavía es el
 * día anterior y corre la fecha un día.
 */
export function fechaLegible(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Fecha de hoy en Bogotá, como AAAA-MM-DD (los vencimientos son del día local). */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

const DIA_MS = 24 * 3600 * 1000;

/** Días calendario entre dos fechas ISO (YYYY-MM-DD), sin zona horaria. */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
    - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / DIA_MS);
}
