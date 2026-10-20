/**
 * Decidir qué se borra de un maestro para que sea un ESPEJO de GEMA.
 * Parte PURA: se prueba sola, porque es lógica de borrado.
 *
 * ## Por qué existe
 *
 * El sync hacía solo upsert, nunca borraba. Así que una ficha creada con una
 * cédula mal digitada —Contratación crea el conductor al contratar— se quedaba
 * en `ACTIVO` para siempre, como un conductor que no existe. Había 19 así el
 * 2026-10-19; detalle en `src/lib/conductores/confirmacion.ts`.
 *
 * ## Las guardas, y por qué cada una
 *
 * Un borrado mal hecho vacía el maestro, y el maestro no se puede reconstruir
 * desde Gestivo. Así que antes de borrar, dos frenos:
 *
 *   1. **El origen no vino corto** (`MINIMO_ESPEJO`). Si la vista de GEMA trae
 *      mucho menos de lo guardado, lo más probable es una consulta que falló a
 *      medias o un filtro nuevo, no que se fueran 500 conductores de golpe.
 *   2. **No se borra demasiado de una vez** (`MAXIMO_BORRADO`). Aunque el
 *      origen venga completo, una diferencia grande merece que alguien la mire.
 *
 * Medido el 2026-10-19: GEMA trae 1.267 cédulas distintas de 1.269 filas y en
 * Gestivo hay 1.289, así que sobran 22 — un 1,7 %, muy por debajo del tope.
 *
 * Las dos guardas **caen en el mismo punto** cuando el origen es un
 * subconjunto de lo guardado (que es el caso normal): 10 % de sobrantes es lo
 * mismo que 90 % de cobertura. Se diferencian cuando el origen trae llaves
 * nuevas, y entonces la segunda es la que de verdad frena.
 *
 * Consecuencia a tener presente: **en una tabla diminuta las guardas ganan
 * siempre**. Con 3 filas, que falte una ya es un 33 %, así que no se borra. Es
 * lo correcto —más vale no tocar un maestro pequeño— y a `conductores`, con
 * 1.289 filas, no le afecta.
 *
 * La tercera guarda no vive aquí porque no es una decisión sino un hecho de la
 * base: `conductores` tiene tres claves foráneas encima, el DELETE de una fila
 * referenciada falla, y el llamador las cuenta aparte en vez de reventar.
 */

/** Si el origen trae menos de esta parte de lo guardado, no se borra nada. */
export const MINIMO_ESPEJO = 0.9;

/** Ni se borra más de esta parte del maestro en una corrida. */
export const MAXIMO_BORRADO = 0.1;

export type PlanEspejo =
  | { ok: true; borrar: string[] }
  | { ok: false; motivo: string };

/**
 * Qué llaves hay que borrar, o por qué no se va a borrar nada.
 *
 * `guardadas` son las llaves que hay en la tabla y `vigentes` las que el origen
 * reporta ahora. Las llaves repetidas en `guardadas` se cuentan una vez: la
 * decisión es por llave, no por fila.
 */
export function decidirEspejo(guardadas: string[], vigentes: Set<string>): PlanEspejo {
  const unicas = [...new Set(guardadas)];
  const total = unicas.length;

  // Tabla vacía: no hay nada que borrar y nada que proteger.
  if (total === 0) return { ok: true, borrar: [] };

  if (vigentes.size < total * MINIMO_ESPEJO) {
    return {
      ok: false,
      motivo:
        `espejo omitido: el origen trajo ${vigentes.size} y hay ${total} guardadas ` +
        `(menos del ${Math.round(MINIMO_ESPEJO * 100)} %)`,
    };
  }

  const sobran = unicas.filter((k) => !vigentes.has(k));
  if (sobran.length === 0) return { ok: true, borrar: [] };

  if (sobran.length > total * MAXIMO_BORRADO) {
    return {
      ok: false,
      motivo:
        `espejo omitido: habria que borrar ${sobran.length} de ${total}, ` +
        `mas del ${Math.round(MAXIMO_BORRADO * 100)} %`,
    };
  }

  return { ok: true, borrar: sobran };
}
