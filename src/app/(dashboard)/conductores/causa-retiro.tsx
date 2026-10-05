"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, NotebookPen, X } from "lucide-react";
import { toast } from "sonner";
import { formatDateBogota } from "@/lib/utils";
import {
  CAUSAS_RETIRO, NOTA_MAX, TIPO_RETIRO_LABEL, causaLabel, causaRetiro, validarRetiro,
  type RetiroRegistrado, type TipoRetiro,
} from "@/lib/conductores/retiro";
import { guardarCausaRetiro } from "./actions";

const TIPO_COLOR: Record<TipoRetiro, { bg: string; color: string }> = {
  voluntario: { bg: "#E0E7FF", color: "#3730A3" },
  empresa: { bg: "#FEF3C7", color: "#92400E" },
  otro: { bg: "#F1F5F9", color: "#475569" },
};

/** Chip con la causa; sin causa, un aviso de que falta registrarla. */
export function ChipCausa({ causa }: { causa: string | null }) {
  const c = causaRetiro(causa);
  if (!causa) {
    return <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Sin causa registrada</span>;
  }
  const st = TIPO_COLOR[c?.tipo ?? "otro"];
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: st.bg, color: st.color }} title={c ? TIPO_RETIRO_LABEL[c.tipo] : undefined}>
      {causaLabel(causa)}
    </span>
  );
}

export interface ConductorRetirado {
  cedula: string;
  nombre: string;
  fechaRetiro: string | null;
}

/** Ventana para registrar o corregir la causa y la nota de retiro. */
export function ModalCausaRetiro({
  conductor, actual, onCerrar, onGuardado,
}: {
  conductor: ConductorRetirado;
  actual: RetiroRegistrado | null;
  onCerrar: () => void;
  onGuardado?: (r: RetiroRegistrado) => void;
}) {
  const router = useRouter();
  const [causa, setCausa] = useState(actual?.causa ?? "");
  const [nota, setNota] = useState(actual?.nota ?? "");
  const [pendiente, startTransition] = useTransition();
  const error = causa ? validarRetiro(causa, nota) : null;

  function guardar() {
    const invalido = validarRetiro(causa, nota);
    if (invalido) {
      toast.error(invalido);
      return;
    }
    startTransition(async () => {
      const r = await guardarCausaRetiro({ cedula: conductor.cedula, causa, nota });
      if (!r.success || !r.retiro) {
        toast.error(r.error ?? "No se pudo guardar la causa de retiro.");
        return;
      }
      toast.success(actual ? "Causa de retiro actualizada." : "Causa de retiro registrada.");
      onGuardado?.(r.retiro);
      router.refresh();
      onCerrar();
    });
  }

  const tipos: TipoRetiro[] = ["voluntario", "empresa", "otro"];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-causa-retiro"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pendiente) onCerrar();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
          <div>
            <h2 id="titulo-causa-retiro" className="text-base font-semibold text-gray-900">Causa de retiro</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {conductor.nombre} · {conductor.cedula}
              {conductor.fechaRetiro && ` · retirado el ${formatDateBogota(conductor.fechaRetiro)}`}
            </p>
          </div>
          <button type="button" onClick={onCerrar} disabled={pendiente} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Causa</span>
            <select
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-800 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
            >
              <option value="" disabled>Elija la causa…</option>
              {tipos.map((t) => (
                <optgroup key={t} label={TIPO_RETIRO_LABEL[t]}>
                  {CAUSAS_RETIRO.filter((c) => c.tipo === t).map((c) => (
                    <option key={c.clave} value={c.clave}>{c.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Nota {causa === "OTRA" ? <span className="text-red-600">(obligatoria)</span> : <span className="font-normal text-gray-400">(opcional)</span>}
            </span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={NOTA_MAX}
              rows={5}
              placeholder="Qué pasó, quién lo comunicó, si es recontratable…"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
            />
            <span className="mt-0.5 block text-right text-xs text-gray-400">{nota.length}/{NOTA_MAX}</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {actual && (
            <p className="text-xs text-gray-500">
              Registrada por {actual.registradoPor ?? "—"} el {formatDateBogota(actual.registradoAt)}
              {actual.actualizadoAt !== actual.registradoAt && ` · última edición de ${actual.actualizadoPor ?? "—"} el ${formatDateBogota(actual.actualizadoAt)}`}.
              Los cambios quedan en la auditoría.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#E2E8F0] px-5 py-3">
          <button type="button" onClick={onCerrar} disabled={pendiente} className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente || !causa || !!error}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {pendiente && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sección "Retiro" de la ficha del conductor. */
export function FichaRetiro({
  conductor, actual, puedeEditar, disponible,
}: {
  conductor: ConductorRetirado;
  actual: RetiroRegistrado | null;
  puedeEditar: boolean;
  disponible: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-5 w-5 text-[#4F46E5]" />
          <h2 className="text-base font-semibold text-gray-900">Causa de retiro</h2>
        </div>
        {puedeEditar && disponible && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="h-8 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {actual ? "Editar causa" : "Registrar causa"}
          </button>
        )}
      </div>
      {!disponible ? (
        <p className="text-sm text-gray-500">Falta aplicar la migración 20261005214330 para registrar causas de retiro.</p>
      ) : actual ? (
        <div className="space-y-2">
          <ChipCausa causa={actual.causa} />
          {actual.nota ? <p className="whitespace-pre-wrap text-sm text-gray-800">{actual.nota}</p> : <p className="text-sm text-gray-400">Sin nota.</p>}
          <p className="text-xs text-gray-500">
            Registrada por {actual.registradoPor ?? "—"} el {formatDateBogota(actual.registradoAt)}
            {actual.actualizadoAt !== actual.registradoAt && ` · editada por ${actual.actualizadoPor ?? "—"} el ${formatDateBogota(actual.actualizadoAt)}`}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Todavía no se ha registrado por qué se retiró.{!puedeEditar && " Tu tipo de usuario es de solo consulta."}
        </p>
      )}
      {abierto && <ModalCausaRetiro conductor={conductor} actual={actual} onCerrar={() => setAbierto(false)} />}
    </section>
  );
}
