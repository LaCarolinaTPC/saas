"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { guardarBaseDiaria, guardarFechaOperativa } from "@/lib/devengados/actions";
import { sincronizarGema, type EstadoSyncGema, type SincronizacionGema } from "@/lib/gema/actions";
import type { FechaOperativa } from "@/lib/devengados/data";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function ParametrosClient({
  baseDiaria,
  fechaOperativa,
  esAdmin,
  syncGema,
}: {
  baseDiaria: number;
  fechaOperativa: FechaOperativa;
  esAdmin: boolean;
  syncGema: EstadoSyncGema[];
}) {
  const router = useRouter();
  const [syncPending, setSyncPending] = useState(false);
  const [syncRes, setSyncRes] = useState<SincronizacionGema | null>(null);

  async function sincronizar() {
    setSyncPending(true);
    setSyncRes(null);
    try {
      const res = await sincronizarGema();
      setSyncRes(res);
      router.refresh();
    } catch (e) {
      setSyncRes({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSyncPending(false);
    }
  }
  const [valor, setValor] = useState(String(baseDiaria));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [fecha, setFecha] = useState(fechaOperativa.fecha);
  const [msgFecha, setMsgFecha] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendingFecha, startTransitionFecha] = useTransition();

  function guardar() {
    setMsg(null);
    startTransition(async () => {
      const res = await guardarBaseDiaria(Number(valor));
      setMsg(
        res.success
          ? { ok: true, texto: "Base diaria actualizada. Se propaga a toda la simulación y al análisis." }
          : { ok: false, texto: res.error ?? "No se pudo guardar." }
      );
    });
  }

  function guardarFecha(nueva: string | null) {
    setMsgFecha(null);
    startTransitionFecha(async () => {
      const res = await guardarFechaOperativa(nueva);
      setMsgFecha(
        res.success
          ? {
              ok: true,
              texto: nueva
                ? `Fecha operativa fijada en ${nueva}. Todo el módulo (caja, entregas y análisis) queda parado en ese día.`
                : "Fecha operativa liberada: el módulo vuelve al día real de Bogotá.",
            }
          : { ok: false, texto: res.error ?? "No se pudo guardar." }
      );
      if (res.success && !nueva) setFecha(fechaOperativa.hoyReal);
    });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Devengados · Parámetros</h1>
      </div>

      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">Base diaria</h2>
          <p className="mt-1 text-sm text-gray-500">
            Valor fijo definido por la empresa (vigente: {cop.format(baseDiaria)}). No se
            calcula con el SMMLV ni el auxilio de transporte, y ninguna pantalla lo tiene
            escrito de forma fija: todo el módulo lo lee de aquí.
          </p>
          <div className="mt-4 flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Valor por día (COP)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-48 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
              />
            </div>
            <button
              onClick={guardar}
              disabled={pending || Number(valor) <= 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
          </div>
          {msg && (
            <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
              {msg.texto}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Fecha operativa (pruebas)</h2>
            {fechaOperativa.esSimulada && (
              <span className="inline-flex items-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
                Fijada en {fechaOperativa.fecha}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            El módulo opera normalmente con el día real de Bogotá (hoy:{" "}
            {fechaOperativa.hoyReal}). Para hacer pruebas sobre días ya cerrados, el
            administrador puede parar todo el módulo —caja, entregas y análisis, incluido el
            registro de entregas— en una fecha anterior. Las entregas registradas quedan con
            esa fecha contable.
          </p>
          {esAdmin ? (
            <>
              <div className="mt-4 flex items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Fecha operativa
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    max={fechaOperativa.hoyReal}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-48 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <button
                  onClick={() => guardarFecha(fecha)}
                  disabled={pendingFecha || !fecha}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {pendingFecha ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Fijar fecha
                </button>
                <button
                  onClick={() => guardarFecha(null)}
                  disabled={pendingFecha || !fechaOperativa.esSimulada}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" />
                  Volver al día real
                </button>
              </div>
              {msgFecha && (
                <p className={`mt-3 text-sm ${msgFecha.ok ? "text-emerald-700" : "text-red-600"}`}>
                  {msgFecha.texto}
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-amber-700">
              Solo el administrador puede mover la fecha operativa.
            </p>
          )}
        </div>

        {/* Sincronización manual con GEMA (mismo trabajo del cron diario) */}
        <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Sincronización con GEMA</h2>
            </div>
            {esAdmin && (
              <button
                onClick={sincronizar}
                disabled={syncPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {syncPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {syncPending ? "Sincronizando..." : "Sincronizar ahora"}
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Trae de GEMA los conductores, empleados, propietarios, cierres, viajes y recaudos
            (re-procesa la ventana reciente; los ajustes extemporáneos se actualizan solos).
            Corre automáticamente cada día; usa el botón cuando necesites los datos al momento.
            Puede tardar un par de minutos.
          </p>

          {syncRes && (
            <div
              className={`mt-3 rounded-lg border p-3 text-sm ${
                syncRes.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {syncRes.error ? (
                <>No se pudo sincronizar: {syncRes.error}</>
              ) : (
                <>
                  Sincronización {syncRes.ok ? "completa" : "con errores"} · rango{" "}
                  {syncRes.rango?.from} → {syncRes.rango?.to}
                  <ul className="mt-1 text-xs">
                    {syncRes.results?.map((r) => (
                      <li key={r.dataset}>
                        {r.dataset}: {r.rows.toLocaleString("es-CO")} filas
                        {r.error && <span className="text-red-600"> · {r.error}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {syncGema.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#F1F5F9] text-left uppercase tracking-wide text-gray-500">
                    <th className="py-1.5 pr-3">Dataset</th>
                    <th className="py-1.5 pr-3">Sincronizado hasta</th>
                    <th className="py-1.5 pr-3">Última corrida</th>
                    <th className="py-1.5 pr-3 text-right">Filas</th>
                    <th className="py-1.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {syncGema.map((s) => (
                    <tr key={s.dataset} className="border-b border-[#F1F5F9]">
                      <td className="py-1.5 pr-3 font-medium text-gray-700">{s.dataset}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{s.last_synced_date ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-gray-600">
                        {s.last_run_at
                          ? new Date(s.last_run_at).toLocaleString("es-CO", {
                              timeZone: "America/Bogota",
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">
                        {(s.rows_synced ?? 0).toLocaleString("es-CO")}
                      </td>
                      <td className="py-1.5">
                        <span
                          className={
                            s.error
                              ? "font-medium text-red-600"
                              : s.status === "ok" || s.status === "idle"
                                ? "text-emerald-600"
                                : "text-gray-600"
                          }
                          title={s.error ?? undefined}
                        >
                          {s.error ? "error" : (s.status ?? "—")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!esAdmin && (
            <p className="mt-3 text-sm text-amber-700">
              Solo el administrador puede ejecutar la sincronización manual.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
