"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { guardarBaseDiaria } from "@/lib/devengados/actions";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function ParametrosClient({ baseDiaria }: { baseDiaria: number }) {
  const [valor, setValor] = useState(String(baseDiaria));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function guardar() {
    setMsg(null);
    startTransition(async () => {
      const res = await guardarBaseDiaria(Number(valor));
      setMsg(
        res.success
          ? { ok: true, texto: "Base diaria actualizada. Se propaga a toda la simulación y al análisis." }
          : { ok: false, texto: res.error ?? "No se pudo guardar." }
      );
    });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Devengados · Parámetros</h1>
      </div>

      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">Base diaria</h2>
          <p className="mt-1 text-sm text-gray-500">
            Valor fijo definido por la empresa (vigente: {cop.format(baseDiaria)}). No se
            calcula con el SMMLV ni el auxilio de transporte, y ninguna pantalla lo tiene
            escrito de forma fija: todo el módulo lo lee de aquí.
          </p>
          <div className="mt-4 flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Valor por día (COP)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-48 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
              />
            </div>
            <button
              onClick={guardar}
              disabled={pending || Number(valor) <= 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
          </div>
          {msg && (
            <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
              {msg.texto}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
