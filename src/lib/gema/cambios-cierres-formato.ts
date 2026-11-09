import type { CampoVigilado, TipoCambio } from "./cambios-cierres";

/** Etiquetas de los campos vigilados (panel de Parámetros y aviso de Liquidación). */
export const CAMPO_ETIQUETA: Record<CampoVigilado, string> = {
  viajes: "Viajes",
  timbradas: "Timbradas",
  bruto: "Bruto",
  salario_bruto_dia: "Salario bruto",
  salario_neto_dia: "Salario neto",
  ahorro: "Ahorro",
  ahorro_obli: "Ahorro oblig.",
  anticipo: "Anticipo",
};

const CANTIDADES = new Set<CampoVigilado>(["viajes", "timbradas"]);

export const TIPO_CAMBIO: Record<TipoCambio, { texto: string; cls: string }> = {
  modificado: { texto: "Modificado", cls: "font-medium text-amber-700" },
  nuevo: { texto: "Nuevo", cls: "font-medium text-emerald-700" },
  borrado: { texto: "Borrado", cls: "font-medium text-red-600" },
};

/** $ 1.234.567; con `signo`, + o − delante. */
export function pesos(v: number, signo = false): string {
  const s = `$ ${Math.abs(Math.round(v)).toLocaleString("es-CO")}`;
  if (!signo || Math.round(v) === 0) return s;
  return `${v < 0 ? "−" : "+"}${s}`;
}

export function formatoValor(campo: CampoVigilado, v: number | null): string {
  if (v == null) return "—";
  return CANTIDADES.has(campo) ? v.toLocaleString("es-CO") : pesos(v);
}
