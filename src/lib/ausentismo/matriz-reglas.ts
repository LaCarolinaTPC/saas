/**
 * Reglas puras de la Matriz de Ausentismo (usables en cliente y servidor).
 * Lo que aquí se deriva de la fecha coincide con la migración 20260902220946
 * y con el lector de Excel: el Excel traía estos valores escritos a mano.
 */

export const MESES_MATRIZ = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
] as const;

export const DIAS_MATRIZ = [
  "DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO",
] as const;

export const INDICADORES_PRORROGA = [
  { key: "INICIAL", label: "Inicial" },
  { key: "PRORROGA", label: "Prórroga" },
] as const;

/** Valores que trae el maestro de conductores; ADMINISTRATIVO es para el resto del personal. */
export const TIPOS_CONDUCTOR = ["EMPRESA", "AFILIADO", "REUBICADO", "ADMINISTRATIVO"] as const;

/** Orígenes cuyo pagador es la ARL: el formulario pide ARL en vez de EPS. */
export const ORIGENES_ARL = new Set(["AT", "EL"]);

/** Orígenes en los que puede haber SOAT (accidente de trabajo en tránsito). */
export const ORIGENES_SOAT = new Set(["AT"]);

// ── Cobro de incapacidades al pagador ────────────────────────────────────────

/**
 * Segmento de cobro:
 *  - eps: incapacidades que paga la EPS (origen distinto de AT/EL) con más de
 *    `COBRO_EPS_DIAS_MIN` días, el criterio que usa RRHH para reclamarlas.
 *  - arl: accidente y enfermedad laboral (AT/EL); la ARL reconoce desde el día 1.
 */
export type SegmentoCobro = "eps" | "arl";
export const SEGMENTOS_COBRO: { key: SegmentoCobro; label: string; descripcion: string }[] = [
  { key: "eps", label: "Cobro EPS · más de 3 días", descripcion: "Origen distinto de AT/EL y más de 3 días de incapacidad" },
  { key: "arl", label: "Cobro ARL · desde 1 día", descripcion: "Accidente o enfermedad laboral (AT/EL), cualquier duración" },
];
/** Mínimo de días para cobrar a la EPS: "más de 3" ⇒ desde 4. */
export const COBRO_EPS_DIAS_MIN = 4;
/** Días de una incapacidad inicial de origen común que asume el empleador (la EPS paga desde el día 3). */
export const DIAS_EMPLEADOR_EPS = 2;

export function esSegmentoCobro(v: string | null | undefined): v is SegmentoCobro {
  return v === "eps" || v === "arl";
}

/** Días mínimos que aplica un segmento cuando el usuario no escribe otro. */
export function diasMinimosCobro(segmento: SegmentoCobro | null | undefined, diasMin: number | null | undefined): number | null {
  if (diasMin != null && Number.isFinite(diasMin) && diasMin > 0) return Math.trunc(diasMin);
  if (segmento === "eps") return COBRO_EPS_DIAS_MIN;
  if (segmento === "arl") return 1;
  return null;
}

/**
 * Días que reconoce el pagador. ARL (AT/EL): todos. EPS: en una incapacidad
 * inicial los dos primeros días los asume el empleador; una prórroga se
 * reconoce completa porque esos dos días ya corrieron en la inicial.
 */
export function diasACargoPagador(f: {
  origen: string | null;
  indicador_prorroga: string | null;
  dias_it_pagados: number | null;
}): number {
  const dias = f.dias_it_pagados ?? 0;
  if (ORIGENES_ARL.has(f.origen ?? "")) return dias;
  if (f.indicador_prorroga === "PRORROGA") return dias;
  return Math.max(dias - DIAS_EMPLEADOR_EPS, 0);
}

/**
 * Formato CIE10 tal como está en la matriz: letra, dos dígitos y opcional un
 * carácter más (dígito o X), con o sin punto. M545, I10X, J00, S82.1.
 */
export const CIE10_RE = /^[A-Z]\d{2}(\.?[0-9X])?$/;

/** Mayúsculas, sin espacios ni punto: "m54.5" → "M545", como guarda la matriz. */
export function normalizarCie10(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[\s.]/g, "");
}

export const ESTADOS_REGISTRO = [
  { key: "pendiente", label: "Pendiente de diagnóstico" },
  { key: "cerrado", label: "Cerrado" },
] as const;

export const REVISION_LABEL: Record<string, string> = {
  prorroga_sin_previa: "Prórroga sin incapacidad previa contigua",
  solape: "Se cruza con otra incapacidad del mismo empleado",
  duplicado_retirado: "Venía repetida en el Excel; se apartó la copia",
};

export const FECHA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function mesDe(fechaISO: string): string {
  return MESES_MATRIZ[Number(fechaISO.slice(5, 7)) - 1] ?? "";
}

export function diaDe(fechaISO: string): string {
  return DIAS_MATRIZ[new Date(`${fechaISO}T00:00:00Z`).getUTCDay()] ?? "";
}

/** Días calendario entre dos fechas ISO, ambos extremos incluidos. */
export function diasEntre(inicio: string, fin: string): number {
  return (
    Math.round(
      (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000
    ) + 1
  );
}

/** Fecha ISO del día anterior. */
export function diaAnterior(fechaISO: string): string {
  return new Date(Date.parse(`${fechaISO}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** AA/MM/DD, el formato en que RRHH lee la matriz. */
export function fechaAAMMDD(fechaISO: string | null | undefined): string {
  if (!fechaISO) return "—";
  return `${fechaISO.slice(2, 4)}/${fechaISO.slice(5, 7)}/${fechaISO.slice(8, 10)}`;
}

/** Texto sin espacios sobrantes; misma regla que `ausentismo_limpio` en la base. */
export function limpio(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
}

/** Clave de comparación sin tildes ni mayúsculas; misma regla que `ausentismo_clave`. */
export function clave(v: string): string {
  return (limpio(v) ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
