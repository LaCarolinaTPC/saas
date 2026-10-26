"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Deshacer / rehacer con tope de pasos (como el historial del croquis).
 *
 * `grupo` junta cambios seguidos en un solo paso: todos los movimientos de un
 * arrastre, o las teclas al escribir un texto. Un grupo se corta cuando pasa
 * más de `ventanaMs` sin cambios o llega otro grupo.
 */
export function useHistorial<T>(inicial: T, max = 50, ventanaMs = 1200) {
  const [estado, setEstado] = useState<{ pasado: T[]; presente: T; futuro: T[] }>({ pasado: [], presente: inicial, futuro: [] });
  const ultimo = useRef<{ grupo: string; t: number } | null>(null);

  const set = useCallback(
    (v: T | ((p: T) => T), opts?: { grupo?: string }) => {
      // La decisión de agrupar se toma FUERA del updater: React puede llamarlo
      // dos veces en desarrollo y el ref no debe cambiar entre una y otra.
      const ahora = Date.now();
      const g = opts?.grupo;
      const fusionar = Boolean(g && ultimo.current?.grupo === g && ahora - ultimo.current.t < ventanaMs);
      ultimo.current = g ? { grupo: g, t: ahora } : null;
      setEstado((e) => {
        const nuevo = typeof v === "function" ? (v as (p: T) => T)(e.presente) : v;
        if (Object.is(nuevo, e.presente)) return e;
        if (fusionar) return { ...e, presente: nuevo, futuro: [] };
        return { pasado: [...e.pasado, e.presente].slice(-max), presente: nuevo, futuro: [] };
      });
    },
    [max, ventanaMs]
  );

  const deshacer = useCallback(() => {
    ultimo.current = null;
    setEstado((e) =>
      e.pasado.length === 0 ? e : { pasado: e.pasado.slice(0, -1), presente: e.pasado[e.pasado.length - 1], futuro: [e.presente, ...e.futuro] }
    );
  }, []);

  const rehacer = useCallback(() => {
    ultimo.current = null;
    setEstado((e) => (e.futuro.length === 0 ? e : { pasado: [...e.pasado, e.presente], presente: e.futuro[0], futuro: e.futuro.slice(1) }));
  }, []);

  /** Reemplaza todo sin historial (al recargar tras un conflicto). */
  const reiniciar = useCallback((v: T) => {
    ultimo.current = null;
    setEstado({ pasado: [], presente: v, futuro: [] });
  }, []);

  return {
    valor: estado.presente,
    set,
    deshacer,
    rehacer,
    reiniciar,
    puedeDeshacer: estado.pasado.length > 0,
    puedeRehacer: estado.futuro.length > 0,
  };
}
