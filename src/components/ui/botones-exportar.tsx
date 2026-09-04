"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";
import type { FormatoExport } from "@/lib/exportar/formatos";

const ETIQUETA: Record<FormatoExport, string> = { pdf: "PDF", xlsx: "Excel", csv: "CSV" };
const TITULO: Record<FormatoExport, string> = {
  pdf: "Descargar PDF con lo que se ve",
  xlsx: "Descargar Excel con lo que se ve",
  csv: "Descargar CSV con lo que se ve",
};

function Icono({ formato }: { formato: FormatoExport }) {
  if (formato === "pdf") return <FileText className="h-4 w-4 text-[#DC2626]" />;
  if (formato === "xlsx") return <FileSpreadsheet className="h-4 w-4 text-[#059669]" />;
  return <Table2 className="h-4 w-4 text-gray-500" />;
}

/**
 * Descargas de lo que se ve en la pantalla, con los filtros aplicados. La
 * generación corre en el navegador con las filas ya cargadas. Nació en
 * Ausentismo y lo comparten los módulos que exportan listados.
 */
export function BotonesExportar({ sinDatos, onExportar, formatos = ["pdf", "csv"] }: {
  sinDatos: boolean;
  onExportar: (formato: FormatoExport) => Promise<void>;
  formatos?: FormatoExport[];
}) {
  const [generando, setGenerando] = useState<FormatoExport | null>(null);

  async function exportar(formato: FormatoExport) {
    setGenerando(formato);
    try {
      await onExportar(formato);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el archivo");
    } finally {
      setGenerando(null);
    }
  }

  const cls = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      {formatos.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => exportar(f)}
          disabled={sinDatos || generando !== null}
          title={sinDatos ? "No hay filas para exportar" : TITULO[f]}
          className={cls}
        >
          {generando === f ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icono formato={f} />}
          {ETIQUETA[f]}
        </button>
      ))}
    </div>
  );
}
