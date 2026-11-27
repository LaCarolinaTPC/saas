"use client";

/**
 * Reloj virtual del chat de prueba (27-nov-2026). Con el simulador del cron
 * encendido, el tiempo avanza `velocidad` veces más rápido (×60: un minuto real
 * es una hora) y se puede adelantar a saltos. Lo usan el simulador del cron
 * (los pasos del cron corren con esta hora) y la IA del chat de prueba (para
 * que sepa qué día es). Queda en el navegador (sessionStorage) mientras la
 * pestaña esté abierta.
 */

export interface EstadoReloj {
  /** El simulador del cron está encendido (el reloj corre acelerado). */
  activo: boolean;
  velocidad: number;
  /** Milisegundos que el reloj ya lleva adelantado (sin contar el tramo acelerado en curso). */
  adelanto: number;
  /** Desde cuándo (hora real) corre el tramo acelerado en curso. */
  desde: number;
}

const CLAVE = "seleccion-reloj-prueba";
const INICIAL: EstadoReloj = { activo: false, velocidad: 60, adelanto: 0, desde: 0 };
let estado: EstadoReloj = INICIAL;
let cargado = false;
const oyentes = new Set<() => void>();

function cargar() {
  if (cargado || typeof window === "undefined") return;
  cargado = true;
  try {
    const s = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null") as EstadoReloj | null;
    if (s && typeof s.adelanto === "number") estado = { ...INICIAL, ...s };
  } catch {
    // Sin almacenamiento: empieza de cero.
  }
}

function guardar(nuevo: EstadoReloj) {
  estado = nuevo;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(nuevo));
  } catch {
    // Sin almacenamiento: solo en memoria.
  }
  for (const o of oyentes) o();
}

/** Lo que el reloj lleva adelantado ahora mismo (ms). */
export function adelantoActual(e: EstadoReloj = (cargar(), estado), real = Date.now()): number {
  return e.adelanto + (e.activo ? Math.max(0, real - e.desde) * (e.velocidad - 1) : 0);
}

/** La hora del reloj virtual (ms). */
export function ahoraPrueba(): number {
  cargar();
  return Date.now() + adelantoActual();
}

/** La hora virtual para la IA del chat de prueba, o null si el reloj no se ha tocado. */
export function ahoraPruebaIso(): string | null {
  cargar();
  return estado.activo || estado.adelanto ? new Date(ahoraPrueba()).toISOString() : null;
}

export function estadoReloj(): EstadoReloj {
  cargar();
  return estado;
}

export function suscribirReloj(fn: () => void): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Enciende o apaga el simulador (lo acelerado hasta ahora queda como adelanto). */
export function activarReloj(activo: boolean) {
  cargar();
  const real = Date.now();
  guardar({ ...estado, activo, adelanto: adelantoActual(estado, real), desde: real });
}

export function cambiarVelocidad(velocidad: number) {
  cargar();
  const real = Date.now();
  guardar({ ...estado, velocidad: Math.max(1, Math.min(velocidad, 600)), adelanto: adelantoActual(estado, real), desde: real });
}

/** Adelanta el reloj `ms` de una vez. */
export function adelantarReloj(ms: number) {
  cargar();
  const real = Date.now();
  guardar({ ...estado, adelanto: adelantoActual(estado, real) + ms, desde: real });
}

/** Vuelve a la hora real. */
export function reiniciarReloj() {
  cargar();
  guardar({ ...estado, adelanto: 0, desde: Date.now() });
}
