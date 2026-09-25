/** Formato de cifras de la liquidación, igual que el GAF-R-12 de GEMA. */
import type { FormatoColumna } from "./liquidacion-afiliados";
import { diaIso, fechaCorta } from "./calendario-pago";

const miles = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** "$1.052.644", y los negativos como los imprime GEMA: "$-22.283". */
export function pesos(n: number): string {
  const v = Math.round(n);
  return `$${v < 0 ? "-" : ""}${miles.format(Math.abs(v))}`;
}

export function cifra(n: number | null | undefined, formato: FormatoColumna): string {
  const v = Number(n ?? 0);
  if (formato === "pesos") return pesos(v);
  if (formato === "decimal") return v === 0 ? "-" : decimal.format(v);
  return miles.format(v);
}

/** "2026-09-29" → "mar 29 sep 2026". */
export function fechaConDia(f: string): string {
  return `${DIAS_CORTOS[diaIso(f) - 1]} ${fechaCorta(f)}`;
}

const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
