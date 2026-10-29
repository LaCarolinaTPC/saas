"use client";

/**
 * Aviso de datos del día en curso: vienen de GEMA casi en tiempo real pero
 * GEMA todavía no ha cerrado el día, así que pueden cambiar. Con el botón se
 * traen otra vez sin esperar la relectura automática (5 min).
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, RefreshCw } from "lucide-react";
import { actualizarCartulinaHoy } from "./actions";

export function AvisoProvisional({
  esHoy,
  actualizadoAt,
  error,
}: {
  /** true: la fecha revisada es hoy. false: solo las llegadas nocturnas caen en hoy. */
  esHoy: boolean;
  actualizadoAt: string | null;
  error?: string | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Mientras la pestaña esté a la vista, se relee cada 5 min: el servidor trae
  // de GEMA si el dato ya tiene 5 min. Con la pestaña oculta no hace nada.
  useEffect(() => {
    const reloj = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5 * 60_000);
    return () => window.clearInterval(reloj);
  }, [router]);

  function actualizar() {
    setMensaje(null);
    iniciar(async () => {
      const r = await actualizarCartulinaHoy();
      if (r.ocupado) setMensaje("Otra persona lo está actualizando en este momento; en unos segundos se verá.");
      else if (!r.ok) setMensaje(r.error ?? "No se pudo traer de GEMA.");
      router.refresh();
    });
  }

  const hora = actualizadoAt
    ? new Date(actualizadoAt).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Datos sujetos al proceso de cierre de GEMA</p>
          <p className="text-xs">
            {esHoy
              ? "El día está en curso: el despacho, la geocerca del terminal, el recaudo y los descuentos vienen de GEMA casi en tiempo real y pueden cambiar cuando GEMA cierre el día."
              : "Las llegadas pasada la medianoche caen en el día en curso: esos eventos del terminal vienen de GEMA casi en tiempo real y pueden cambiar al cierre."}
            {hora ? ` Última actualización: ${hora}.` : " Todavía no se han traído."} Se actualiza sola cada 5 minutos mientras la página esté abierta.
          </p>
          {error && <p className="mt-1 text-xs font-medium text-red-700">Última actualización con problemas: {error}</p>}
          {mensaje && <p className="mt-1 text-xs font-medium">{mensaje}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={actualizar}
        disabled={pendiente}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#F59E0B] bg-white px-3 py-1.5 text-xs font-semibold text-[#92400E] hover:bg-[#FEF3C7] disabled:opacity-50"
      >
        {pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {pendiente ? "Trayendo de GEMA…" : "Actualizar ahora"}
      </button>
    </div>
  );
}
