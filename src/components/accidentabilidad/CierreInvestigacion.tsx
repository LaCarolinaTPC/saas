"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { guardarCierreInvestigacion } from "@/lib/accidentabilidad/actions";
import { inputCls, labelCls } from "./FormatoSecciones";

export default function CierreInvestigacion({
  accidenteId, funcionario, puedeEditar,
}: { accidenteId: string; funcionario: string | null; puedeEditar: boolean }) {
  const [valor, setValor] = useState(funcionario ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!puedeEditar) {
    return (
      <div className="flex justify-between py-1.5">
        <span className="text-sm text-gray-500">Funcionario que atendió el accidente</span>
        <span className="text-sm font-medium text-gray-900">{funcionario || "—"}</span>
      </div>
    );
  }

  const cambio = valor.trim() !== (funcionario ?? "");
  return (
    <div>
      <label className={labelCls}>Funcionario que atendió el accidente</label>
      <div className="flex gap-2">
        <input className={inputCls} value={valor} onChange={(e) => { setValor(e.target.value); setMsg(null); }} placeholder="Nombre del funcionario" />
        <button
          type="button"
          disabled={pending || !cambio}
          onClick={() =>
            startTransition(async () => {
              try {
                await guardarCierreInvestigacion(accidenteId, valor);
                setMsg({ ok: true, text: "Guardado." });
              } catch (e) {
                setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo guardar." });
              }
            })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </button>
      </div>
      {msg && <p className={`mt-1.5 text-xs ${msg.ok ? "text-[#059669]" : "text-[#EF4444]"}`}>{msg.text}</p>}
    </div>
  );
}
