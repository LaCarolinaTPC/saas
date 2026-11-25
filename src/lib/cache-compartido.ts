/**
 * Resultados guardados unos minutos y compartidos por todos los servidores
 * (24-nov-2026, para los indicadores). Usa `unstable_cache` de Next, que en
 * Vercel persiste entre instancias (la memoria de cada instancia no: cada
 * visita puede caer en otra). Solo para resultados ya calculados y pequeños,
 * que se puedan pasar a JSON, que no dependan de la petición (cookies,
 * permisos) y que puedan tener unos minutos de atraso.
 *
 * Fuera de Next (scripts, baterías) no hay caché: se llama directo.
 */
import { unstable_cache } from "next/cache";

const SIN_CACHE = /incrementalCache|static generation store|work(Unit)?Store|Invariant/i;

export function guardadoCompartido<A extends (string | number | boolean | null)[], R>(
  fn: (...args: A) => Promise<R>,
  clave: string,
  segundos: number
): (...args: A) => Promise<R> {
  const enCache = unstable_cache(fn, [clave], { revalidate: segundos, tags: [clave] });
  return async (...args: A) => {
    try {
      return await enCache(...args);
    } catch (e) {
      if (SIN_CACHE.test(e instanceof Error ? e.message : String(e))) return fn(...args);
      throw e;
    }
  };
}
