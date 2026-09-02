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
