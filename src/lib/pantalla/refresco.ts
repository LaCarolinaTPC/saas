/**
 * Intervalo de actualización de los televisores (E/S, solo servidor). Se guarda
 * en `app_settings` y aplica a todos. Cada TV lo recibe en `/api/display`, así
 * que una caché corta evita sumar una lectura a cada consulta.
 */

import { getSettingValue, setSettingValue } from "@/lib/settings";
import { normalizarSondeoMin } from "./tipos-display";

const CLAVE = "pantalla.refresco_min";
const CACHE_MS = 5 * 60_000;

const g = globalThis as unknown as { __pantallaRefresco?: { valor: number; vence: number } };

export async function getRefrescoMin(): Promise<number> {
  const e = g.__pantallaRefresco;
  if (e && e.vence > Date.now()) return e.valor;
  const valor = normalizarSondeoMin(await getSettingValue(CLAVE));
  g.__pantallaRefresco = { valor, vence: Date.now() + CACHE_MS };
  return valor;
}

export async function guardarRefrescoMin(minutos: number, userId?: string): Promise<void> {
  await setSettingValue(CLAVE, String(minutos), userId);
  g.__pantallaRefresco = undefined;
}
