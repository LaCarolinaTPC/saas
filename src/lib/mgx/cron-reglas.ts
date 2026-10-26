/**
 * Orden de las tablas en la corrida nocturna de MGX (PURO).
 *
 * El cron tiene ~4 minutos por noche. Hoy una corrida completa tarda 1,5-3,
 * pero si algún día no alcanza, la siguiente noche vuelve a empezar por el
 * principio del catálogo: sin un orden, las últimas tablas podrían quedarse
 * atrás para siempre. Por eso van primero las que quedaron a medias o con
 * error, luego las que nunca se copiaron, y después las de sincronización más
 * vieja.
 */

import type { Par } from "./catalogo";
import type { EstadoPar } from "./sync";

export interface EstadoParCron {
  empresa: string;
  modulo: string;
  tabla: string;
  estado: EstadoPar;
  ultima_corrida_at: string | null;
}

const PRIORIDAD: Record<EstadoPar, number> = {
  // «corriendo» que llega aquí es una corrida cortada: abrirCorrida ya
  // descartó que haya una viva.
  corriendo: 0,
  pendiente: 0,
  error: 1,
  nunca: 2,
  ok: 3,
};

const clave = (p: { empresa: string; modulo: string; tabla: string }) => `${p.empresa}.${p.modulo}.${p.tabla}`;

export function ordenarParaCron(pares: readonly Par[], estados: readonly EstadoParCron[]): Par[] {
  const por = new Map(estados.map((e) => [clave(e), e]));
  return pares
    .map((p, i) => ({ p, i, e: por.get(clave(p)) }))
    .sort((a, b) => {
      const pa = PRIORIDAD[a.e?.estado ?? "nunca"];
      const pb = PRIORIDAD[b.e?.estado ?? "nunca"];
      if (pa !== pb) return pa - pb;
      // Entre iguales, la sincronizada hace más tiempo primero; sin fecha, primero.
      const ta = a.e?.ultima_corrida_at ?? "";
      const tb = b.e?.ultima_corrida_at ?? "";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.p);
}
