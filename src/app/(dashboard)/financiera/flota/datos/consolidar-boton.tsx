"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { consolidarAhora } from "./actions";

/** Dispara la consolidación a demanda y refresca la tabla de períodos. */
export function ConsolidarBoton() {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  function consolidar() {
    empezar(async () => {
      const res = await consolidarAhora();
      if (res.success && res.resultado) {
        const r = res.resultado;
        const hechos = r.periodos.filter((p) => !p.omitido).map((p) => p.periodo);
        const cierre = r.cerrados.length ? ` · cerrados: ${r.cerrados.join(", ")}` : "";
        toast.success(
          hechos.length
            ? `Consolidados ${hechos.join(", ")}${cierre}.`
            : `No había meses abiertos que consolidar${cierre}.`
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo consolidar");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={consolidar}
      disabled={pendiente}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
    >
      {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {pendiente ? "Consolidando…" : "Consolidar ahora"}
    </button>
  );
}
