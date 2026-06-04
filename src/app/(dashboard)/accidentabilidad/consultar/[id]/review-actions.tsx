"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle, ClipboardCheck } from "lucide-react";
import { setAccidenteEstado, aprobarAccidente } from "@/lib/actions";

export default function ReviewActions({ id, estado }: { id: string; estado: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (estado === "aprobado") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-positive-bg px-4 py-3 text-sm font-medium text-positive">
        <CheckCircle2 className="h-4 w-4" /> Reporte aprobado.
      </div>
    );
  }

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.success) setError(res.error || "Error");
      else {
        setShowComment(false);
        setComment("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-negative">{error}</p>}

      {showComment && (
        <div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="¿Qué información falta?"
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-gold"
          />
          <button
            onClick={() => run(() => setAccidenteEstado(id, "falta_informacion", comment))}
            disabled={pending}
            className="mt-2 rounded-lg bg-negative px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            Confirmar "falta información"
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!showComment && (
          <button
            onClick={() => setShowComment(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-negative-bg hover:text-negative"
          >
            <AlertTriangle className="h-4 w-4" /> Falta información
          </button>
        )}
        <button
          onClick={() => run(() => setAccidenteEstado(id, "completada"))}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-gold-subtle"
        >
          <ClipboardCheck className="h-4 w-4" /> Marcar completada
        </button>
        <button
          onClick={() => run(() => aprobarAccidente(id))}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-positive px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Aprobar reporte
        </button>
      </div>
    </div>
  );
}
