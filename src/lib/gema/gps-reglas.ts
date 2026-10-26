/**
 * Reglas PURAS de la sincronización del GPS de GEMA (kilometraje, bloqueos del
 * sensor y eventos). Sin E/S: se prueban con node --test (`npm run test:gps`).
 * La parte que habla con GEMA y Supabase está en `gps.ts`.
 */

/**
 * Eventos que NO se guardan. Lista de descarte (no de permitidos) para que un
 * código nuevo que agregue GEMA se guarde y se pueda ver:
 *   0   Modo de estacionamiento (ping con el bus quieto)
 *   1   Modo de conducción (ping cada pocos segundos: el 94 % del día)
 *   100 Over Speed PolyGeo-Fence   ┐ geocerca de velocidad; los excesos ya
 *   101 Under Speed PolyGeoFence   ┘ están en `velocidades`
 * Con esto un día pasa de ~200.000 filas a ~4.400.
 */
export const EVENTOS_DESCARTADOS: ReadonlySet<number> = new Set([0, 1, 100, 101]);

export function eventoSeGuarda(cod: number | null): boolean {
  return cod != null && !EVENTOS_DESCARTADOS.has(cod);
}

/** Más de esto en un día no es un recorrido sino un salto del odómetro. */
export const KM_DIA_MAXIMO = 600;

export function kmSospechoso(total: number | null): boolean {
  return total != null && (total < 0 || total > KM_DIA_MAXIMO);
}

/**
 * Franjas del día para pedir los eventos. GEMA incluye ambos extremos del rango
 * de horas, así que no se solapan. Cuatro llamadas en vez de una para no tener
 * las ~200.000 filas del día en memoria a la vez.
 */
export const TRAMOS_HORA: readonly (readonly [string, string])[] = [
  ["00:00:00", "05:59:59"],
  ["06:00:00", "11:59:59"],
  ["12:00:00", "17:59:59"],
  ["18:00:00", "23:59:59"],
];

/** GEMA rechaza rangos de kilometraje de más de 31 días. */
export const MAX_DIAS_KM = 31;

/** Suma `delta` días a una fecha 'AAAA-MM-DD'. */
export function sumarDias(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Días de [desde, hasta], ambos incluidos. */
export function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d);
  return out;
}

/**
 * Desde dónde repasar lo reciente: los últimos `diasRepaso` días (incluido
 * hoy) o, si el cron estuvo caído, desde el último día que alcanzó a cargar.
 */
export function desdeReciente(hoy: string, marcador: string | null, diasRepaso: number): string {
  const repaso = sumarDias(hoy, -(Math.max(1, diasRepaso) - 1));
  return marcador && marcador < repaso ? marcador : repaso;
}

/** Parte [desde, hasta] en tramos de como mucho 31 días, en orden. */
export function tramosKm(desde: string, hasta: string): { desde: string; hasta: string }[] {
  const out: { desde: string; hasta: string }[] = [];
  for (let a = desde; a <= hasta; a = sumarDias(a, MAX_DIAS_KM)) {
    const b = sumarDias(a, MAX_DIAS_KM - 1);
    out.push({ desde: a, hasta: b < hasta ? b : hasta });
  }
  return out;
}
