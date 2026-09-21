/** Presentación del módulo Financiera. Pesos enteros, rentabilidad a 2 decimales (acta, punto 8). */

import type { EstadoPeriodo } from "./motor";
import type { TipoCarga } from "./consolidacion";

export function cop(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$ ${Math.round(n).toLocaleString("es-CO")}`;
}

export function entero(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("es-CO");
}

export function porcentaje(n: number | null | undefined, decimales = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}

export function decimal(n: number | null | undefined, decimales = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/**
 * Rótulo del rango activo. Vive aquí y no en filtros.tsx porque ese módulo es
 * de cliente y las pantallas, que son de servidor, no pueden llamar una
 * función que cruce esa frontera.
 */
export function rotuloRango(anio: number, mes: number | null): string {
  return mes ? `Acumulado enero – ${MESES[mes - 1]} ${anio}` : `Año ${anio}`;
}

/** AAAA-MM → "marzo 2026". */
export function nombrePeriodo(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  if (!y || !m) return periodo;
  const nombre = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("es-CO", { month: "long", timeZone: "UTC" });
  return `${nombre} ${y}`;
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = iso.slice(0, 10);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  });
}

export const ESTADO_PERIODO: Record<EstadoPeriodo, { etiqueta: string; clase: string; ayuda: string }> = {
  abierto: {
    etiqueta: "Abierto",
    clase: "bg-blue-50 text-blue-700 border-blue-200",
    ayuda: "GEMA todavía no cerró el mes: se recalcula en cada corrida y las cifras pueden moverse.",
  },
  cerrado: {
    etiqueta: "Cerrado",
    clase: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ayuda: "El marcador del sync de GEMA pasó el último día del mes: las cifras están congeladas.",
  },
  reabierto: {
    etiqueta: "Reabierto",
    clase: "bg-amber-50 text-amber-800 border-amber-200",
    ayuda: "Lo reabrió el administrador; se recalcula en la siguiente corrida y GEMA lo cierra otra vez.",
  },
};

export const TIPO_CARGA: Record<TipoCarga, string> = {
  consolidar_gema: "Consolidación desde GEMA",
  cerrar_periodo: "Cierre de período",
  reabrir_periodo: "Reapertura de período",
  cargar_contable: "Carga del archivo contable",
  reversar_contable: "Reversión del archivo contable",
  cambiar_parametro: "Cambio de parámetro",
};

export const COBERTURA: Record<"completo" | "parcial" | "sin_dato", { etiqueta: string; clase: string }> = {
  completo: { etiqueta: "Contable completa", clase: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  parcial: { etiqueta: "Contable parcial", clase: "bg-amber-50 text-amber-800 border-amber-200" },
  sin_dato: { etiqueta: "Sin archivo contable", clase: "bg-gray-100 text-gray-600 border-gray-200" },
};
