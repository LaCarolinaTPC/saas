"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

/** Lo que devuelve la acción de cada pantalla (ver `refrescarRecobrosDelDia`). */
export interface RespuestaActualizarGema {
  ok: boolean;
  error?: string;
  refresco?: {
    refrescado: boolean;
    motivo?: string;
    ms?: number;
    solicitudes?: { apagado?: boolean; creadas: number; vinculadas: number; anuladas: number };
  };
}

const hace = (iso: string | null) => {
  if (!iso) return "nunca se ha traído";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return "hace menos de un minuto";
  if (min < 60) return `hace ${min} min`;
  return new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
};

function resumen(r: RespuestaActualizarGema): string {
  const s = r.refresco?.solicitudes;
  if (r.refresco?.motivo === "lo está trayendo otro") return "Otra pestaña lo está trayendo de GEMA; en un momento se ve.";
  if (!s || s.apagado) return "Datos de GEMA actualizados.";
  const partes = [
    s.creadas && `${s.creadas} ${s.creadas === 1 ? "solicitud nueva" : "solicitudes nuevas"}`,
    s.vinculadas && `${s.vinculadas} ${s.vinculadas === 1 ? "vinculada a su abono" : "vinculadas a su abono"}`,
    s.anuladas && `${s.anuladas} ${s.anuladas === 1 ? "anulada" : "anuladas"}`,
  ].filter(Boolean);
  return partes.length ? `Actualizado: ${partes.join(" · ")}.` : "Actualizado: no hay abonos nuevos de revisión de cámara.";
}

/**
 * «Actualizar desde GEMA» de las pantallas de revisión de recobros. Trae los
 * abonos, el despacho y el recaudo de hoy sin esperar la ventana de 15
 * minutos con que la pantalla los trae sola al abrirse.
 */
export function ActualizarGemaRecobros({
  accion,
  actualizadoAt,
  error,
  soloAbonos = false,
}: {
  accion: () => Promise<RespuestaActualizarGema>;
  actualizadoAt: string | null;
  /** Error del refresco automático al abrir la pantalla. */
  error?: string | null;
  /**
   * Rótulo para una pantalla que ya tiene su propio «Actualizar ahora» de GEMA
   * (Revisión cartulina): este botón se presenta como lo que añade, los abonos.
   */
  soloAbonos?: boolean;
}) {
  const router = useRouter();
  const [trayendo, start] = useTransition();
  const [fallo, setFallo] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
      {/* Un solo texto: la hora relativa cambia entre el servidor y el navegador. */}
      <span suppressHydrationWarning>
        {`${soloAbonos ? "Abonos «REVISIÓN CÁMARA» de GEMA" : "Datos de GEMA"}: ${hace(actualizadoAt)}`}
      </span>
      <button
        type="button"
        onClick={() => {
          setFallo(null);
          start(async () => {
            const r = await accion();
            if (!r.ok) setFallo(r.error ?? "No se pudo traer de GEMA.");
            else toast.success(resumen(r));
            router.refresh();
          });
        }}
        disabled={trayendo}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${trayendo ? "animate-spin" : ""}`} />
        {trayendo ? "Trayendo de GEMA…" : soloAbonos ? "Traer abonos de GEMA" : "Actualizar desde GEMA"}
      </button>
      {(fallo ?? error) && (
        <span className="basis-full font-medium text-red-700">
          No se pudo traer de GEMA: {fallo ?? error}. Lo que ve es lo último guardado.
        </span>
      )}
    </div>
  );
}
