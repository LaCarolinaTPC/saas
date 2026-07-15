"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Clock, Loader2 } from "lucide-react";
import { marcarTrasladada } from "@/lib/devengados/actions";
import type { EntregaRow } from "@/lib/devengados/data";
import { formatDateTimeBogota } from "@/lib/utils";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function EntregasClient({
  entregas,
  fecha,
}: {
  entregas: EntregaRow[];
  fecha: string;
}) {
  const router = useRouter();
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = entregas.reduce((s, e) => s + e.valor_entregado, 0);
  const pendientes = entregas.filter((e) => !e.trasladada_gema);

  function toggle(e: EntregaRow) {
    setPendienteId(e.id);
    startTransition(async () => {
      await marcarTrasladada(e.id, !e.trasladada_gema);
      setPendienteId(null);
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Devengados · Entregas del día</h1>
            <span className="inline-flex items-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
              {entregas.length}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <input
              type="date"
              value={fecha}
              onChange={(e) => router.push(`/tesoreria/devengados/entregas?fecha=${e.target.value}`)}
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
            />
            <span className="text-gray-500">
              Total: <strong className="text-gray-900">{cop.format(total)}</strong>
            </span>
            <span className="text-gray-500">
              Pendientes de trasladar a GEMA:{" "}
              <strong className={pendientes.length ? "text-amber-600" : "text-emerald-600"}>
                {pendientes.length}
              </strong>
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-4 py-3 text-xs text-gray-500">
            Cada entrega debe registrarse manualmente en GEMA — cuenta contable{" "}
            <strong>281505010</strong> (movimiento débito), en el cierre del día de la transacción.
            Marca la casilla cuando quede digitada.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Trasladada</th>
                  <th className="px-4 py-2">Conductor</th>
                  <th className="px-4 py-2 text-right">Valor entregado</th>
                  <th className="px-4 py-2">Cuenta</th>
                  <th className="px-4 py-2">Viajes</th>
                  <th className="px-4 py-2">Registrada</th>
                  <th className="px-4 py-2">Observación</th>
                </tr>
              </thead>
              <tbody>
                {entregas.map((e) => (
                  <tr key={e.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2">
                      <button
                        onClick={() => toggle(e)}
                        disabled={pending && pendienteId === e.id}
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        title={
                          e.trasladada_gema
                            ? `Trasladada ${formatDateTimeBogota(e.trasladada_at)}`
                            : "Marcar como trasladada a GEMA"
                        }
                      >
                        {pending && pendienteId === e.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : e.trasladada_gema ? (
                          <CircleCheck className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-500" />
                        )}
                        <span className={e.trasladada_gema ? "text-emerald-700" : "text-amber-600"}>
                          {e.trasladada_gema ? "Sí" : "Pendiente"}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-medium text-gray-900">{e.conductor_nombre ?? "—"}</p>
                      <p className="text-xs text-gray-500">
                        CC {e.cedula_conductor}
                        {e.codigo_conductor ? ` · Cód. ${e.codigo_conductor}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {cop.format(e.valor_entregado)}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {e.cuenta_contable} · {e.movimiento}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {e.viajes.length ? e.viajes.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {formatDateTimeBogota(e.created_at)}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{e.observacion ?? "—"}</td>
                  </tr>
                ))}
                {entregas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                      Sin entregas registradas el {fecha}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
