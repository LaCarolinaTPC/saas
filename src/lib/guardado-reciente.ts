"use client";

/**
 * Marca de «acabo de guardar» en esta pestaña (27-nov-2026). Las acciones del
 * servidor ya traen la página nueva al responder; el aviso en tiempo real del
 * mismo cambio pedía la página entera otra vez mientras la persona esperaba
 * (aprobar antecedentes o subir un documento «estaba lento»). Con la marca, ese
 * aviso espera a que termine la ventana y se relee una sola vez.
 */
let hasta = 0;

/** Llamar al terminar un guardado propio. */
export function marcarGuardado(ms = 4000): void {
  hasta = Math.max(hasta, Date.now() + ms);
}

/** Hasta cuándo (ms) hay que esperar antes de releer por un aviso; 0 si no hay guardado reciente. */
export function esperaPorGuardado(): number {
  return Math.max(0, hasta - Date.now());
}
