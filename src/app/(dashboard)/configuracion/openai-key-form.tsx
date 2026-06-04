"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, KeyRound } from "lucide-react";
import { saveOpenAIKey } from "@/lib/actions";

export default function OpenAIKeyForm({
  status,
}: {
  status: { configured: boolean; masked: string | null; source: "config" | "env" | null };
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    if (value.trim().length < 10) {
      setError("Ingresa una API key válida.");
      return;
    }
    startTransition(async () => {
      const res = await saveOpenAIKey(value.trim());
      if (!res.success) setError(res.error || "No se pudo guardar.");
      else {
        setSaved(true);
        setValue("");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
        <span className="text-sm text-gray-600">Estado</span>
        {status.configured ? (
          <span className="text-sm font-medium text-[#059669]">
            Configurada ({status.masked}){status.source === "env" ? " · variable de entorno" : ""}
          </span>
        ) : (
          <span className="text-sm font-medium text-[#D97706]">No configurada</span>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-900">
          {status.configured ? "Reemplazar API key" : "API key de OpenAI"}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-..."
            className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
          />
          <button
            onClick={save}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Guardar
          </button>
        </div>
      </div>

      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-[#059669]">
          <Check className="h-4 w-4" /> API key guardada.
        </p>
      )}
      {error && <p className="text-sm text-[#EF4444]">{error}</p>}
      <p className="text-xs text-gray-500">
        Se usa para transcribir las notas de voz de los reportes de accidente. Se guarda de forma segura y nunca se muestra completa.
      </p>
    </div>
  );
}
