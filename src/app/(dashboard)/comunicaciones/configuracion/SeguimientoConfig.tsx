"use client";

/**
 * Configuración del seguimiento a quien no responde: el «¿sigues interesado?»
 * automático y cuándo se marca el chat para GH. Reglas en
 * src/lib/comunicaciones/seguimiento.ts.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { guardarSeguimiento } from "@/lib/comunicaciones/seguimiento-actions";
import { textoRecordatorio, type ConfigSeguimiento } from "@/lib/comunicaciones/seguimiento";

const campo =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none " +
  "placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30";

export default function SeguimientoConfig({ actual, disponible }: { actual: ConfigSeguimiento; disponible: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<ConfigSeguimiento>(actual);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const set = <K extends keyof ConfigSeguimiento>(k: K, v: ConfigSeguimiento[K]) => setF((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setGuardando(true);
    setResultado(null);
    const r = await guardarSeguimiento(f);
    setGuardando(false);
    setResultado(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error ?? "No se pudo guardar." });
    if (r.ok) router.refresh();
  }

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-border bg-surface-raised p-5">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Seguimiento a quien no responde</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            Si el último mensaje del chat es nuestro (de la IA o de alguien de GH) y el aspirante no contesta, se le pregunta una vez si sigue
            interesado. Solo se envía con la ventana de 24 h de WhatsApp abierta y dentro del horario. Si tampoco responde, el chat queda «Para
            humano». Se revisa cada 15 minutos.
          </p>
        </div>
      </div>

      {!disponible && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Apagado: falta aplicar la migración <code>20261109221237_comunicaciones_seguimiento_a_quien_no_responde.sql</code>.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={f.activo} onChange={(e) => set("activo", e.target.checked)} className="h-4 w-4" />
        Activo
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">Preguntar después de (horas sin respuesta)</span>
          <input type="number" min={0.5} max={20} step={0.5} className={campo} value={f.horasEspera} onChange={(e) => set("horasEspera", Number(e.target.value))} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">Marcar «Para humano» si no responde en (horas; 0 = no marcar)</span>
          <input type="number" min={0} max={168} step={1} className={campo} value={f.horasEscalar} onChange={(e) => set("horasEscalar", Number(e.target.value))} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">Enviar desde (hora de Colombia)</span>
          <input type="time" className={campo} value={f.horaDesde} onChange={(e) => set("horaDesde", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-secondary">Hasta</span>
          <input type="time" className={campo} value={f.horaHasta} onChange={(e) => set("horaHasta", e.target.value)} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-secondary">Mensaje (use {"{nombre}"} para el primer nombre del contacto)</span>
        <textarea className={`${campo} min-h-[80px] resize-y`} maxLength={1000} value={f.mensaje} onChange={(e) => set("mensaje", e.target.value)} />
      </label>
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-text-secondary">
        Así llega: «{textoRecordatorio(f.mensaje, "JUAN PÉREZ")}»
      </p>

      <div className="flex items-center justify-end gap-3">
        {resultado && (
          <span className={`flex items-center gap-1 text-xs ${resultado.ok ? "text-emerald-700" : "text-red-600"}`}>
            {resultado.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
            {resultado.texto}
          </span>
        )}
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar seguimiento
        </button>
      </div>
    </div>
  );
}
