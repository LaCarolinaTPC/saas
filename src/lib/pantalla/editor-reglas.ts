/**
 * Geometría del editor de diapositivas (PURO). Separado del componente para
 * poder probarlo: el arrastre con el mouse solo traduce píxeles a estas
 * funciones, en coordenadas del lienzo 1920×1080.
 */

import { LIENZO } from "./modelo";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Guía visible mientras se arrastra: vertical (x fija) u horizontal (y fija). */
export type Guia = { eje: "x" | "y"; pos: number };

/** Esquinas y lados: n, s, e, o y sus combinaciones. */
export type Handle = "n" | "s" | "e" | "o" | "ne" | "no" | "se" | "so";
export const HANDLES: Handle[] = ["no", "n", "ne", "e", "se", "s", "so", "o"];

/**
 * Ajusta la caja a los centros/bordes del lienzo y de las otras cajas cuando
 * queda a menos de `umbral`. Devuelve la posición ajustada y las guías que la
 * produjeron (para dibujarlas).
 */
export function ajustarASnap(caja: Rect, otras: readonly Rect[], umbral = 10): { x: number; y: number; guias: Guia[] } {
  const objetivosX = [0, LIENZO.ancho / 2, LIENZO.ancho];
  const objetivosY = [0, LIENZO.alto / 2, LIENZO.alto];
  for (const o of otras) {
    objetivosX.push(o.x, o.x + o.w / 2, o.x + o.w);
    objetivosY.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const mejor = (bordes: number[], objetivos: number[]) => {
    let r: { delta: number; pos: number } | null = null;
    for (const b of bordes) {
      for (const t of objetivos) {
        const d = t - b;
        if (Math.abs(d) <= umbral && (!r || Math.abs(d) < Math.abs(r.delta))) r = { delta: d, pos: t };
      }
    }
    return r;
  };
  const sx = mejor([caja.x, caja.x + caja.w / 2, caja.x + caja.w], objetivosX);
  const sy = mejor([caja.y, caja.y + caja.h / 2, caja.y + caja.h], objetivosY);
  const guias: Guia[] = [];
  if (sx) guias.push({ eje: "x", pos: sx.pos });
  if (sy) guias.push({ eje: "y", pos: sy.pos });
  return { x: caja.x + (sx?.delta ?? 0), y: caja.y + (sy?.delta ?? 0), guias };
}

/**
 * Nueva caja al arrastrar un handle `dx, dy` (lienzo, sin rotación). Con
 * `proporcion` las esquinas conservan la relación de aspecto. Nunca queda por
 * debajo de `min` y el lado opuesto al handle no se mueve.
 */
export function redimensionar(caja: Rect, handle: Handle, dx: number, dy: number, proporcion = false, min = 20): Rect {
  let { x, y, w, h } = caja;
  const derecha = x + w;
  const abajo = y + h;
  if (handle.includes("e")) w = Math.max(min, caja.w + dx);
  if (handle.includes("o")) w = Math.max(min, caja.w - dx);
  if (handle.startsWith("s")) h = Math.max(min, caja.h + dy);
  if (handle.startsWith("n")) h = Math.max(min, caja.h - dy);

  const esquina = handle.length === 2;
  if (proporcion && esquina && caja.w > 0 && caja.h > 0) {
    const ratio = caja.w / caja.h;
    // Manda el eje que más cambió en proporción.
    if (Math.abs(w / caja.w - 1) >= Math.abs(h / caja.h - 1)) h = Math.max(min, w / ratio);
    else w = Math.max(min, h * ratio);
  }
  if (handle.includes("o")) x = derecha - w;
  if (handle.startsWith("n")) y = abajo - h;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Ángulo (0-359) del puntero respecto al centro; 0 = el handle arriba. Con `snap15` redondea a 15°. */
export function rotacionDesde(cx: number, cy: number, px: number, py: number, snap15 = false): number {
  const rad = Math.atan2(px - cx, -(py - cy));
  let g = (rad * 180) / Math.PI;
  g = ((g % 360) + 360) % 360;
  if (snap15) g = (Math.round(g / 15) * 15) % 360;
  return Math.round(g * 10) / 10;
}

/** Deja al menos `visible` px de la caja dentro del lienzo, para no perder un elemento fuera de la vista. */
export function dentroDelLienzo(caja: Rect, visible = 40): Rect {
  const x = Math.min(LIENZO.ancho - visible, Math.max(visible - caja.w, caja.x));
  const y = Math.min(LIENZO.alto - visible, Math.max(visible - caja.h, caja.y));
  return { ...caja, x: Math.round(x), y: Math.round(y) };
}
