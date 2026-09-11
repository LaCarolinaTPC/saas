"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Loader2, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { ADJUNTO_ACCEPT, RELACIONADO_LABEL, RELACIONADO_TIPOS, tamanoLegible, type AdjuntoConUrl } from "@/lib/incapacidades/adjuntos";
import { fechaHora } from "@/lib/incapacidades/formato";
import { accionAnularAdjunto } from "./actions";

/**
 * Soportes del expediente (fase 6): lista con enlace firmado, carga por la
 * ruta API (el PDF no cabe en una server action) y anulación con motivo.
 */
export function AdjuntosPanel({ expedienteId, adjuntos, puedeEditar }: { expedienteId: string; adjuntos: AdjuntoConUrl[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function subir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      toast.error("Adjunta un archivo.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/incapacidades/adjuntos", { method: "POST", body: form });
      const json = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) {
        toast.error(json.error ?? `No se pudo cargar el soporte (${r.status})`);
        return;
      }
      toast.success("Soporte cargado.");
      formRef.current?.reset();
      router.refresh();
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const inputCls = "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
  const labelCls = "mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-gray-500";

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4" style={{ borderTop: "3px solid #047857" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Paperclip className="h-4 w-4" /> Soportes</h3>
        <span className="text-xs text-gray-500">Bucket privado; los enlaces valen una hora. Se anulan con motivo, no se borran.</span>
      </div>

      {adjuntos.length === 0 ? (
        <p className="mt-3 text-xs italic text-gray-400">Sin soportes.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {adjuntos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F8FAFC] p-2">
              <div className="flex min-w-0 items-center gap-2">
                {a.archivo_mime === "application/pdf" ? <FileText className="h-4 w-4 shrink-0 text-red-600" /> : <ImageIcon className="h-4 w-4 shrink-0 text-gray-500" />}
                <div className="min-w-0">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-[#0F766E] underline">{a.archivo_nombre}</a>
                  ) : (
                    <span className="block truncate font-medium text-gray-900">{a.archivo_nombre}</span>
                  )}
                  <div className="text-xs text-gray-500">
                    {RELACIONADO_LABEL[a.relacionado_tipo as keyof typeof RELACIONADO_LABEL]?.split(" (")[0] ?? a.relacionado_tipo} · {tamanoLegible(a.archivo_tamano)} · {a.subido_por_email ?? ""} · {fechaHora(a.created_at)}
                  </div>
                </div>
              </div>
              {puedeEditar && (
                <form action={accionAnularAdjunto} className="flex gap-2">
                  <input type="hidden" name="id" value={expedienteId} />
                  <input type="hidden" name="adjunto_id" value={a.id} />
                  <input name="motivo" placeholder="Motivo de la anulación" required minLength={5} className="h-8 w-48 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs" />
                  <button type="submit" className="h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs text-red-700">Anular</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <form ref={formRef} onSubmit={subir} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-[#E2E8F0] p-3">
          <input type="hidden" name="expediente_id" value={expedienteId} />
          <label className="block w-56">
            <span className={labelCls}>Qué soporta</span>
            <select name="relacionado_tipo" defaultValue="expediente" className={inputCls}>
              {RELACIONADO_TIPOS.map((t) => <option key={t} value={t}>{RELACIONADO_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="block flex-1 min-w-[220px]">
            <span className={labelCls}>Archivo (PDF, JPG, PNG o WebP, máx. 10 MB)</span>
            <input name="archivo" type="file" accept={ADJUNTO_ACCEPT} required className="block w-full text-sm text-gray-700 file:mr-3 file:h-9 file:rounded-lg file:border file:border-[#E2E8F0] file:bg-white file:px-3 file:text-sm file:font-medium file:text-gray-700" />
          </label>
          <button type="submit" disabled={enviando} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Cargar soporte
          </button>
        </form>
      )}
    </section>
  );
}
