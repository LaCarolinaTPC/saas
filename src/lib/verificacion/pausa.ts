/**
 * Pausa de Croma (24-nov-2026): con el ajuste `croma_pausado` en «sí»
 * (Selección › Tiempos y reglas › Verificaciones con Croma) no se consulta nada
 * en Croma, como si no estuviera configurado: el proceso sigue como si las
 * verificaciones no fueran obligatorias, el asistente le pide la licencia al
 * aspirante y lo que falta queda para revisar a mano. Al quitar la pausa, la
 * revisión periódica retoma los pendientes. Solo servidor.
 */

let cache: { hasta: number; pausado: Promise<boolean> } | null = null;

/** ¿Está pausada? Unos segundos en memoria: se consulta en cada llamada a Croma. */
export async function cromaPausado(): Promise<boolean> {
  if (cache && cache.hasta > Date.now()) return cache.pausado;
  const pausado = (async () => {
    try {
      // Import tardío: el módulo de ajustes de Selección importa el de verificación.
      const { leerAjustes, valorAjuste } = await import("@/lib/seleccion/servidor");
      const v = valorAjuste<unknown>(await leerAjustes(), "croma_pausado", false);
      return v === true || v === "true";
    } catch {
      return false;
    }
  })();
  cache = { hasta: Date.now() + 15_000, pausado };
  return pausado;
}

/** El proveedor de Croma, o null si está pausada (igual que sin CROMA_API_KEY). */
export async function siCromaActivo<T>(proveedor: T | null): Promise<T | null> {
  if (!proveedor) return null;
  return (await cromaPausado()) ? null : proveedor;
}

/** Para las pruebas: olvida lo leído. */
export function olvidarPausaCroma(): void {
  cache = null;
}
