"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { reversarPeriodo } from "./actions";

/** Borra el archivo contable de un mes (solo sus rubros). Pide confirmación. */
export function ReversarBoton({ periodo, deshabilitado, motivo }: { periodo: string; deshabilitado?: boolean; motivo?: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  function reversar() {
    if (!window.confirm(`¿Reversar el archivo contable de ${periodo}? Se borran los rubros del archivo de todos los vehículos del mes; lo que vino de GEMA no se toca.`)) return;
    empezar(async () => {
      const res = await reversarPeriodo(periodo);
      if (res.success && res.resultado) {
        toast.success(`Reversado ${periodo}: ${res.resultado.filas} vehículos sin archivo contable.`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo reversar");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={reversar}
      disabled={pendiente || deshabilitado}
      title={deshabilitado ? motivo : "Borrar el archivo contable de este mes"}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E2E8F0] px-2 text-xs text-gray-700 hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
      Reversar
    </button>
  );
}
