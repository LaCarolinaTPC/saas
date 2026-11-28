"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { cargarRegistroExamenes } from "./actions";

/** «Cargar el Excel del registro»: el histórico de Salud Ocupacional (27-nov-2026). */
export function CargarRegistro({ puedeEditar }: { puedeEditar: boolean }) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  if (!puedeEditar) return null;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50 ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {ocupado ? "Cargando…" : "Cargar el Excel del registro"}
        <input
          type="file"
          accept=".xlsx,.xls,.xlsm"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const fd = new FormData();
            fd.set("archivo", f);
            enTransicion(async () => {
              setAviso(null);
              const r = await cargarRegistroExamenes(fd).catch((err: Error) => ({ ok: false, error: err.message, texto: undefined }));
              setAviso({ ok: r.ok, texto: r.ok ? (r.texto ?? "Listo.") : (r.error ?? "No se pudo cargar.") });
              if (r.ok) router.refresh();
            });
          }}
        />
      </label>
      {aviso && <p className={`max-w-sm text-right text-xs ${aviso.ok ? "text-emerald-700" : "text-red-700"}`}>{aviso.texto}</p>}
    </div>
  );
}
