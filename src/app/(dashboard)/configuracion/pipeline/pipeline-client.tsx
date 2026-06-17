"use client";

import { useState, useTransition } from "react";
import { GitBranch, Plus, ChevronUp, ChevronDown, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { createStage, updateStage, deleteStage, moveStage } from "./actions";

interface Stage {
  id: string;
  key: string;
  label: string;
  color: string;
  text_color: string;
  orden: number;
  tipo: string;
  activo: boolean;
}

const TIPO_LABELS: Record<string, string> = {
  normal: "Normal",
  ganado: "Ganado (contratado)",
  perdido: "Perdido (rechazado)",
};

export function PipelineClient({
  stages,
  counts,
}: {
  stages: Stage[];
  counts: Record<string, number>;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Pipeline · Etapas</h1>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[#4F46E5]" />
            <h2 className="text-base font-semibold text-gray-900">
              Etapas del pipeline ({stages.length})
            </h2>
          </div>
          <div className="space-y-2">
            {stages.map((s, i) => (
              <StageRow
                key={s.id}
                stage={s}
                count={counts[s.key] ?? 0}
                isFirst={i === 0}
                isLast={i === stages.length - 1}
              />
            ))}
          </div>
        </section>

        <NewStageForm />
      </div>
    </div>
  );
}

function StageRow({
  stage, count, isFirst, isLast,
}: {
  stage: Stage; count: number; isFirst: boolean; isLast: boolean;
}) {
  const [label, setLabel] = useState(stage.label);
  const [color, setColor] = useState(stage.color);
  const [textColor, setTextColor] = useState(stage.text_color);
  const [tipo, setTipo] = useState(stage.tipo);
  const [activo, setActivo] = useState(stage.activo);
  const [pending, start] = useTransition();

  const dirty =
    label !== stage.label || color !== stage.color ||
    textColor !== stage.text_color || tipo !== stage.tipo || activo !== stage.activo;

  function run(fn: () => Promise<void>, ok: string) {
    start(async () => {
      try { await fn(); toast.success(ok); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <div className={`rounded-lg border border-[#E2E8F0] p-3 ${!activo ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <button
            onClick={() => run(() => moveStage(stage.id, "up"), "Reordenado")}
            disabled={isFirst || pending}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
          ><ChevronUp className="h-4 w-4" /></button>
          <button
            onClick={() => run(() => moveStage(stage.id, "down"), "Reordenado")}
            disabled={isLast || pending}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
          ><ChevronDown className="h-4 w-4" /></button>
        </div>

        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: color, color: textColor }}
        >
          {label || "—"}
        </span>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-[#E2E8F0] px-2 text-sm outline-none focus:border-[#4F46E5]"
        />

        <label className="flex items-center gap-1 text-xs text-gray-500">
          Fondo
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-8 cursor-pointer rounded border" />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Texto
          <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-7 w-8 cursor-pointer rounded border" />
        </label>

        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
        >
          {Object.entries(TIPO_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activa
        </label>

        <span className="text-xs text-gray-400">{count} cand.</span>

        <button
          onClick={() =>
            run(() => updateStage(stage.id, { label, color, text_color: textColor, tipo, activo }), "Guardado")
          }
          disabled={!dirty || pending}
          className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4338CA] disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" /> Guardar
        </button>
        <button
          onClick={() => {
            if (!confirm(`¿Eliminar la etapa "${stage.label}"?`)) return;
            run(() => deleteStage(stage.id, stage.key), "Etapa eliminada");
          }}
          disabled={pending}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
        ><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function NewStageForm() {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#E0E7FF");
  const [textColor, setTextColor] = useState("#4F46E5");
  const [tipo, setTipo] = useState("normal");
  const [pending, start] = useTransition();

  function add() {
    if (!label.trim()) { toast.error("Escribe un nombre para la etapa"); return; }
    start(async () => {
      try {
        await createStage({ label, color, text_color: textColor, tipo });
        toast.success("Etapa creada");
        setLabel("");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <section className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Plus className="h-5 w-5 text-[#4F46E5]" />
        <h2 className="text-base font-semibold text-gray-900">Nueva etapa</h2>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej. Examen médico"
            className="h-9 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#4F46E5]"
          />
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Fondo
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded border" />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Texto
          <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded border" />
        </label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
        >
          {Object.entries(TIPO_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>
    </section>
  );
}
