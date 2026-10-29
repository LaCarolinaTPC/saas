import { AlertTriangle, History } from "lucide-react";
import type { CorridasGema } from "@/lib/gema/actions";
import type { EstadoCorridaGema } from "@/lib/gema/corridas";

const ESTADO: Record<EstadoCorridaGema, { texto: string; cls: string }> = {
  corriendo: { texto: "corriendo", cls: "text-[#4338CA]" },
  ok: { texto: "ok", cls: "text-emerald-600" },
  parcial: { texto: "parcial", cls: "font-medium text-amber-700" },
  error: { texto: "con errores", cls: "font-medium text-red-600" },
  abandonada: { texto: "no terminó", cls: "font-medium text-red-600" },
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "medium" });

/**
 * Bitácora de sincronizaciones con GEMA: cada corrida del cron de las 03:00 y
 * del botón, con quién, cuánto tardó y qué tablas fallaron. Avisa si el cron
 * lleva más de 26 h sin correr.
 */
export function CorridasGemaPanel({ datos }: { datos: CorridasGema }) {
  if (!datos.disponible) {
    return (
      <p className="mt-4 text-xs text-gray-400">
        Bitácora de corridas no disponible: falta aplicar la migración
        <code className="mx-1">20261029181941_gema_bitacora_de_corridas_y_candados_de_sincronizacion.sql</code>.
      </p>
    );
  }
  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <History className="h-3.5 w-3.5" /> Últimas corridas
      </h3>
      {datos.cronAtrasado && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {datos.ultimaCron
            ? `La sincronización automática de las 03:00 no corre desde el ${fechaHora(datos.ultimaCron.iniciada_at)}. `
            : "La sincronización automática de las 03:00 no ha corrido desde que existe esta bitácora. "}
          Los datos solo se actualizan con el botón. Hay que revisar el cron (vercel.json) y el CRON_SECRET.
        </p>
      )}
      {datos.corridas.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400">Todavía no hay corridas registradas.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-3">Inicio</th>
                <th className="py-1.5 pr-3">Origen</th>
                <th className="py-1.5 pr-3">Rango</th>
                <th className="py-1.5 pr-3 text-right">Duración</th>
                <th className="py-1.5 pr-3">Estado</th>
                <th className="py-1.5">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {datos.corridas.map((c) => {
                const fallidas = (c.resultados ?? []).filter((r) => r.error);
                const estado = ESTADO[c.estado] ?? { texto: c.estado, cls: "text-gray-600" };
                return (
                  <tr key={c.id} className="border-b border-[#F1F5F9] align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-gray-600">{fechaHora(c.iniciada_at)}</td>
                    <td className="py-1.5 pr-3 text-gray-700">
                      {c.origen === "cron" ? "Automática (03:00)" : `Manual${c.usuario_email ? ` · ${c.usuario_email}` : ""}`}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-gray-600">
                      {c.rango_desde && c.rango_hasta ? `${c.rango_desde} → ${c.rango_hasta}` : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">
                      {c.duracion_ms != null ? `${(c.duracion_ms / 1000).toFixed(0)} s` : "—"}
                    </td>
                    <td className={`py-1.5 pr-3 ${estado.cls}`}>{estado.texto}</td>
                    <td className="py-1.5 text-gray-500">
                      {fallidas.length > 0
                        ? fallidas.map((r) => `${r.dataset}: ${r.error}`).join(" · ")
                        : c.error ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
