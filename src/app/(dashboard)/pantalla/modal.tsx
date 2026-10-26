"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Modal simple del módulo (mismo estilo que Configuración › API). Cierra con Esc. */
export function Modal({
  titulo,
  onCerrar,
  children,
  ancho = "max-w-md",
}: {
  titulo: React.ReactNode;
  onCerrar: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={`w-full ${ancho} max-h-[90vh] overflow-auto rounded-xl bg-white p-6 shadow-xl`} role="dialog" aria-modal>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-900">{titulo}</h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const claseInput =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";
export const claseBotonPrimario =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50";
export const claseBotonSecundario =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
export const claseBotonPeligro =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50";

export function fechaHora(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** «hace 3 min», «hace 2 h», o la fecha. */
export function haceCuanto(v: string | null): string {
  if (!v) return "nunca";
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 90) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return fechaHora(v);
}
