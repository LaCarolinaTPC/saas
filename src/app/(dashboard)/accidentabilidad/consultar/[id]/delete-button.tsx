"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { eliminarAccidente } from "@/lib/actions";

export default function DeleteButton({ id, consecutivo }: { id: string; consecutivo: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await eliminarAccidente(id);
      if (!res.success) setError(res.error || "No se pudo eliminar.");
      else router.push("/accidentabilidad/consultar");
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-gray-600 hover:bg-[#FEE2E2] hover:text-[#EF4444]"
      >
        <Trash2 className="h-4 w-4" /> Eliminar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">¿Eliminar #{consecutivo}?</span>
      <button
        onClick={remove}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#EF4444] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Sí, eliminar
      </button>
      <button onClick={() => setConfirming(false)} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-gray-600">
        Cancelar
      </button>
      {error && <span className="text-sm text-[#EF4444]">{error}</span>}
    </div>
  );
}
