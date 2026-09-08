"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { sidebarStore, type EstadoSidebar, type ModoSidebar } from "./sidebar-store";

type ContextoSidebar = EstadoSidebar & {
  /** Alterna entre menú con texto y rail de solo iconos. */
  alternarModo: () => void;
  fijarModo: (modo: ModoSidebar) => void;
  /** Abre o cierra un grupo del menú y lo recuerda. */
  alternarGrupo: (key: string) => void;
  /** Deja exactamente estos grupos abiertos (`false` = cerrado a propósito). */
  fijarGrupos: (grupos: Record<string, boolean>) => void;
};

const Contexto = createContext<ContextoSidebar | null>(null);

/**
 * Estado compartido del menú lateral. Envuelve al Sidebar y al contenido en
 * el layout del dashboard para que ambos reaccionen al ancho del menú.
 * El layout es un Server Component; este provider es la frontera cliente.
 */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const estado = useSyncExternalStore(
    sidebarStore.subscribe,
    sidebarStore.get,
    sidebarStore.getServer
  );

  const fijarModo = useCallback((modo: ModoSidebar) => sidebarStore.set({ modo }), []);
  const alternarModo = useCallback(() => {
    sidebarStore.set({
      modo: sidebarStore.get().modo === "iconos" ? "expandido" : "iconos",
    });
  }, []);
  const fijarGrupos = useCallback(
    (gruposAbiertos: Record<string, boolean>) => sidebarStore.set({ gruposAbiertos }),
    []
  );
  const alternarGrupo = useCallback((key: string) => {
    const actual = sidebarStore.get().gruposAbiertos;
    sidebarStore.set({ gruposAbiertos: { ...actual, [key]: actual[key] !== true } });
  }, []);

  const valor = useMemo<ContextoSidebar>(
    () => ({ ...estado, alternarModo, fijarModo, alternarGrupo, fijarGrupos }),
    [estado, alternarModo, fijarModo, alternarGrupo, fijarGrupos]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSidebar(): ContextoSidebar {
  const ctx = useContext(Contexto);
  if (!ctx) {
    throw new Error("useSidebar debe usarse dentro de <SidebarProvider>");
  }
  return ctx;
}
