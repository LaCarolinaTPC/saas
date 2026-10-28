/**
 * Tareas programadas estilo wp-cron: cuándo le toca correr a una tarea.
 *
 * Vercel Hobby solo corre un cron al día y con holgura de ±59 min, así que las
 * tareas «a una hora» las dispara el **latido** de cualquier página abierta de
 * Gestivo (y del televisor): cada pocos minutos el navegador avisa y el
 * servidor corre las que ya vencieron.
 *
 * Lo que impide repetir es la **ranura**: el día y la hora configurada
 * («2026-10-27@09:00»). Una tarea corre una vez por ranura. Si alguien cambia
 * la hora, la ranura cambia y vuelve a correr; si alguien la ejecuta a mano,
 * corre aunque ya hubiera corrido.
 *
 * PURO: `npm run test:tareas`.
 */

/** Cada cuánto late una página abierta. */
export const LATIDO_MS = 5 * 60_000;

/** Cuánto dura el candado de una ejecución: más que lo que tarda la tarea. */
export const CANDADO_MS = 4 * 60_000;

/** Candado libre (`'epoch'` en la base). */
export const SIN_CANDADO = new Date(0).toISOString();

export const ranura = (dia: string, hora: string) => `${dia}@${hora}`;

/** «HH:MM» a minutos desde medianoche, o null si no es una hora. */
export function minutosDe(hora: string | null | undefined): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((hora ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export type Vencimiento =
  | { vence: true; ranura: string }
  | { vence: false; motivo: "apagada" | "hora_invalida" | "aun_no" | "ya_corrio" };

/** ¿Le toca a la tarea en este latido? */
export function vencimiento(e: {
  hoy: string;
  ahoraMinutos: number;
  hora: string;
  activa: boolean;
  ultimaRanura: string | null | undefined;
}): Vencimiento {
  if (!e.activa) return { vence: false, motivo: "apagada" };
  const corte = minutosDe(e.hora);
  if (corte === null) return { vence: false, motivo: "hora_invalida" };
  if (e.ahoraMinutos < corte) return { vence: false, motivo: "aun_no" };
  const r = ranura(e.hoy, e.hora.trim());
  if (e.ultimaRanura === r) return { vence: false, motivo: "ya_corrio" };
  return { vence: true, ranura: r };
}

/**
 * La ranura que queda anotada después de correr.
 *
 * La automática anota la suya. La manual solo «gasta» la del día si ya pasó la
 * hora: si alguien la corre a las 07:00 y la hora es 09:00, a las 09:00 tiene
 * que volver a correr, porque para entonces puede faltar más gente.
 */
export function ranuraTrasEjecutar(e: {
  hoy: string;
  ahoraMinutos: number;
  hora: string;
  manual: boolean;
  ranuraPrevia: string;
}): string {
  const corte = minutosDe(e.hora);
  if (corte === null) return e.ranuraPrevia;
  if (e.manual && e.ahoraMinutos < corte) return e.ranuraPrevia;
  return ranura(e.hoy, e.hora.trim());
}
