"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lo escucha `BuscadorGlobal`, montado una sola vez en el layout del panel. */
export const EVENTO_ABRIR_BUSCADOR = "gestivo:abrir-buscador";

/** Abre el buscador global. Funciona en cualquier página, servidor o cliente. */
export function BotonBuscador({ className, compacto = false, alPulsar }: { className?: string; compacto?: boolean; alPulsar?: () => void }) {
  return (
    <button
      type="button"
      aria-label="Buscar en Gestivo"
      title={compacto ? "Buscar (Ctrl+K)" : undefined}
      onClick={() => {
        alPulsar?.();
        window.dispatchEvent(new Event(EVENTO_ABRIR_BUSCADOR));
      }}
      className={cn(
        compacto
          ? "flex h-10 w-10 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          : "flex h-10 w-full items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#94A3B8] transition-colors hover:border-[#94A3B8] hover:text-[#64748B]",
        className
      )}
    >
      <Search className={cn("shrink-0", compacto ? "h-5 w-5" : "h-[18px] w-[18px]")} />
      {!compacto && (
        <>
          <span className="truncate">Buscar...</span>
          <kbd className="ml-auto hidden rounded border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 font-mono text-[10px] text-[#64748B] sm:inline">Ctrl K</kbd>
        </>
      )}
    </button>
  );
}
