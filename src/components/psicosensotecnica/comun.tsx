"use client";

/** Piezas compartidas por las cuatro pruebas del navegador. */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { RUTA_PUBLICA } from "@/lib/psicosensotecnica/tipos";

const sinCambios = () => () => {};

/** Dirección completa de la página pública. En el servidor solo se conoce la ruta. */
export function useEnlacePublico(): string {
  return useSyncExternalStore(sinCambios, () => `${window.location.origin}${RUTA_PUBLICA}`, () => RUTA_PUBLICA);
}

/**
 * Cuenta las veces que la persona sale de la pantalla (cambia de pestaña,
 * bloquea el celular) mientras `activo`. No invalida la prueba: se le informa
 * a la psicóloga.
 */
export function useInterrupciones(activo: boolean) {
  const cuenta = useRef(0);
  useEffect(() => {
    if (!activo) return;
    const alOcultar = () => {
      if (document.visibilityState === "hidden") cuenta.current += 1;
    };
    document.addEventListener("visibilitychange", alOcultar);
    return () => document.removeEventListener("visibilitychange", alOcultar);
  }, [activo]);
  return cuenta;
}

export const azar = (min: number, max: number) => min + Math.random() * (max - min);

export function barajar<T>(lista: T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Tarjeta({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">{children}</div>;
}

export function BotonPrincipal({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
    >
      {children}
    </button>
  );
}

/** Pantalla de instrucciones antes de una prueba o de su práctica. */
export function Instrucciones({ titulo, pasos, boton, onSeguir }: { titulo: string; pasos: string[]; boton: string; onSeguir: () => void }) {
  return (
    <Tarjeta>
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-gray-700">
        {pasos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="mt-5">
        <BotonPrincipal onClick={onSeguir}>{boton}</BotonPrincipal>
      </div>
    </Tarjeta>
  );
}

export function Avance({ hecho, total, etiqueta }: { hecho: number; total: number; etiqueta?: string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{etiqueta ?? ""}</span>
        <span>
          {Math.min(hecho, total)} de {total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${(Math.min(hecho, total) / total) * 100}%` }} />
      </div>
    </div>
  );
}
