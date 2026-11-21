/**
 * Costo del asistente y tope mensual (entrega 3, NF1). PURO.
 *
 * Cada llamada al modelo queda en `seleccion_consumos` con sus tokens y su
 * costo en dólares; el gasto del mes se compara con el tope en pesos
 * (ajustes `tope_mensual_cop` y `trm`). Al 80 % se avisa; al 100 % se detienen
 * los envíos y las consultas automáticas, y lo que hace una persona sigue.
 */

/**
 * Dólares por millón de tokens (entrada, salida). Mismos precios que muestra
 * la configuración del agente (`MODELOS_ANTHROPIC`). Un modelo que no está
 * aquí (OpenRouter elige solo) se cobra al precio del más caro, para no
 * quedarse corto con el tope.
 */
export const PRECIOS_MODELO: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const PRECIO_DESCONOCIDO: [number, number] = [4, 20];

/** Precio del modelo: por id exacto o por familia («anthropic/claude-haiku-5-5», «claude-haiku-5-5-20261101»). */
export function precioModelo(modelo: string | null | undefined): [number, number] {
  // OpenRouter escribe la versión con punto: «anthropic/claude-sonnet-5.5».
  const m = String(modelo ?? "").toLowerCase().replace(/(\d)\.(\d)/g, "$1-$2");
  const id = Object.keys(PRECIOS_MODELO).find((k) => m === k || m.endsWith(`/${k}`) || m.startsWith(`${k}-`) || m.includes(k));
  return id ? PRECIOS_MODELO[id] : PRECIO_DESCONOCIDO;
}

export function costoUsd(modelo: string | null | undefined, tokensEntrada: number | null | undefined, tokensSalida: number | null | undefined): number {
  const [e, s] = precioModelo(modelo);
  const te = Math.max(0, Number(tokensEntrada) || 0);
  const ts = Math.max(0, Number(tokensSalida) || 0);
  return Math.round(((te * e + ts * s) / 1_000_000) * 1_000_000) / 1_000_000;
}

export type NivelTope = "normal" | "aviso" | "alcanzado";

export interface EstadoTope {
  gastoCop: number;
  topeCop: number;
  porcentaje: number;
  nivel: NivelTope;
}

/** Sin tope (0) nunca se alcanza. */
export function estadoTope(gastoUsd: number, topeCop: number, trm: number): EstadoTope {
  const gastoCop = Math.round(Math.max(0, gastoUsd) * Math.max(0, trm));
  const porcentaje = topeCop > 0 ? Math.round((gastoCop / topeCop) * 1000) / 10 : 0;
  return { gastoCop, topeCop, porcentaje, nivel: topeCop <= 0 ? "normal" : porcentaje >= 100 ? "alcanzado" : porcentaje >= 80 ? "aviso" : "normal" };
}

/** Primer instante del mes en Bogotá (UTC-5, sin horario de verano), en ISO. */
export function inicioMesBogota(ahora: Date): string {
  const bogota = new Date(ahora.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), 1, 5, 0, 0)).toISOString();
}
