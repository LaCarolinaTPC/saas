/**
 * Lectura paginada de la base para los indicadores (los de Comunicaciones y,
 * desde la entrega 4, los de selección). Se piden solo las columnas
 * necesarias, de 1000 en 1000 (PostgREST corta ahí): primero la primera
 * página y, si viene llena, se cuenta y se piden las demás.
 *
 * Si una columna opcional no existe en esta base (una migración sin aplicar),
 * se quita de la consulta y se sigue: esa sección se muestra sin datos y el
 * resto sí. Solo servidor.
 */

const PAGINA = 1000;

/**
 * La base autoalojada atiende peor muchas consultas a la vez: 16 páginas de
 * mensajes tardaban 8 s de a una y 32 s todas juntas. Por eso las consultas
 * de los indicadores pasan de a `MAX_A_LA_VEZ`, compartido entre peticiones.
 */
const MAX_A_LA_VEZ = 2;
let enCurso = 0;
const espera: (() => void)[] = [];
export async function turno<T>(f: () => PromiseLike<T>): Promise<T> {
  if (enCurso >= MAX_A_LA_VEZ) await new Promise<void>((listo) => espera.push(listo));
  enCurso++;
  try {
    return await f();
  } finally {
    enCurso--;
    espera.shift()?.();
  }
}

// El cliente no tiene tipos generados de la base: el constructor de consultas va sin tipar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Consulta = any;

/** «column wa_conversaciones.prefiltro does not exist» → «prefiltro». */
function columnaFaltante(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  const m = /column "?(?:[\w]+\.)?([\w]+)"? does not exist/i.exec(error.message ?? "");
  if (m) return m[1];
  // PostgREST con el caché de esquema: «Could not find the 'x' column…».
  const m2 = /find the '([\w]+)' column/i.exec(error.message ?? "");
  return m2 ? m2[1] : null;
}

/**
 * Todas las filas de una consulta. `armar(columnas, conteo)` arma la consulta
 * con sus filtros. Las columnas de `opcionales` que no existan se quitan.
 */
export async function leerTodo<T>(
  tabla: string,
  columnas: string[],
  opcionales: string[],
  armar: (sel: string, conteo: boolean) => Consulta,
  orden: string[],
  faltantes: string[]
): Promise<T[]> {
  let cols = [...columnas];
  const pagina = (sel: string, i: number) =>
    turno(() => {
      let q = armar(sel, false);
      for (const o of orden) q = q.order(o, { ascending: true });
      return q.range(i * PAGINA, (i + 1) * PAGINA - 1);
    }) as Promise<{ data: T[] | null; error: { code?: string; message?: string } | null }>;
  for (let intento = 0; intento < 8; intento++) {
    const sel = cols.join(", ");
    // 24-nov-2026: primero la primera página (antes, siempre se contaba antes). Casi
    // todas las lecturas caben en una (las de por lotes de ids): un viaje en vez de dos.
    const primera = await pagina(sel, 0);
    const falta = columnaFaltante(primera.error);
    if (falta && opcionales.includes(falta) && cols.includes(falta)) {
      faltantes.push(`${tabla}.${falta}`);
      cols = cols.filter((c) => c !== falta);
      continue;
    }
    if (primera.error) {
      faltantes.push(tabla);
      console.error(`[indicadores] ${tabla}:`, primera.error.message);
      return [];
    }
    const out: T[] = [...(primera.data ?? [])];
    if (out.length < PAGINA) return out;
    // Vino llena: se cuenta y se piden las demás páginas.
    const { count, error } = (await turno(() => armar(sel, true))) as { count: number | null; error: { code?: string; message?: string } | null };
    if (error) {
      faltantes.push(tabla);
      console.error(`[indicadores] ${tabla}:`, error.message);
      return [];
    }
    const paginas = Math.ceil((count ?? 0) / PAGINA);
    const resultados = await Promise.all(Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => pagina(sel, i + 1)));
    for (const r of resultados) {
      if (r.error) {
        faltantes.push(tabla);
        console.error(`[indicadores] ${tabla}:`, r.error.message);
        return [];
      }
      out.push(...(r.data ?? []));
    }
    return out;
  }
  return [];
}
