"use client";

import { Printer } from "lucide-react";

/** Barra de impresión: usa el diálogo del navegador (Guardar como PDF). */
export function PrintButton() {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
      <p className="text-xs text-gray-500">
        Usa «Imprimir» y elige «Guardar como PDF» para generar el archivo.
      </p>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white"
      >
        <Printer className="h-4 w-4" /> Imprimir / PDF
      </button>
    </div>
  );
}
