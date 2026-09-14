"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarRange, ChevronDown, ChevronRight, Loader2, Search, TriangleAlert } from "lucide-react";
import {
  MINIMOS_REINCIDENCIA, etiquetaMes,
} from "@/lib/ausentismo/constants";
import type { FilaHistorico, HistoricoReincidencias } from "@/lib/ausentismo/data";
import { exportarHistoricoReincidencias, textoSituacion } from "@/lib/ausentismo/exportar";
import { obtenerHistoricoReincidencias } from "../actions";
import { BotonesExportar } from "../botones-exportar";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

/** Celda de un mes: el total y, en rojo, las no justificadas de ese mes. */
function CeldaMes({ fila, mes }: { fila: FilaHistorico; mes: string }) {
  const v = fila.porMes[mes];
  if (!v) return <td className="px-2 py-2 text-center text-xs text-gray-300">·</td>;
  return (
    <td
      className="px-2 py-2 text-center text-xs"
      style={{ backgroundColor: v.noJustificadas > 0 ? "#FEF2F2" : "#EEF2FF" }}
      title={`${etiquetaMes(mes)}: ${v.total} ausencia${v.total === 1 ? "" : "s"}${
        v.noJustificadas > 0 ? `, ${v.noJustificadas} sin justificar` : ""
      }`}
    >
      <span className={v.total >= 3 ? "font-bold text-gray-900" : "font-medium text-gray-700"}>{v.total}</span>
      {v.noJustificadas > 0 && (
        <span className="ml-0.5 font-semibold text-red-700">({v.noJustificadas})</span>
      )}
    </td>
  );
}

/**
 * Reporte de reincidencias históricas: el rango largo (por defecto el año en
 * curso) abierto mes a mes, para ver quién repite mes tras mes y no solo
 * quién está en alerta hoy. No se calcula al abrir la pestaña — son miles de
 * registros —: se pide con "Generar".
 */
export function HistoricoClient({ corte, labels }: {
  corte: string;
  labels: Record<string, string>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(`${corte.slice(0, 4)}-01-01`);
  const [hasta, setHasta] = useState(corte);
  const [minimo, setMinimo] = useState("2");
  const [retirados, setRetirados] = useState(false);
  const [datos, setDatos] = useState<HistoricoReincidencias | null>(null);
  const [pending, start] = useTransition();

  function generar() {
    if (hasta < desde) {
      toast.error("El rango termina antes de empezar.");
      return;
    }
    start(async () => {
      const res = await obtenerHistoricoReincidencias({
        desde, hasta, minimo: Number(minimo), incluirRetirados: retirados,
      });
      if (!res.success || !res.historico) {
        toast.error(res.error ?? "No se pudo generar el reporte histórico");
        return;
      }
      setDatos(res.historico);
      if (res.historico.filas.length === 0) {
        toast.info(`Ningún conductor llega a ${minimo} ausencias en el rango.`);
      }
    });
  }

  const campo = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm text-gray-600">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {el}
    </label>
  );

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-[#F8FAFC]"
      >
        {abierto ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
        <CalendarRange className="h-4 w-4 text-[#4F46E5]" />
        Reporte de reincidencias históricas
        <span className="font-normal text-gray-500">
          · el rango completo, mes a mes {datos ? `· ${datos.filas.length} conductores` : ""}
        </span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-[#F1F5F9] p-4">
          <p className="text-xs text-gray-500">
            Mientras la alerta del día mira el mes en curso, este reporte abre todo el rango mes a mes: arriba
            quedan los conductores que repiten en más meses. Cuenta las ausencias que el catálogo marca como
            reincidencia; entre paréntesis, las no justificadas del mes.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {campo("Desde", <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={inputCls} />)}
            {campo("Hasta", <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={inputCls} />)}
            {campo("Mínimo en el rango", (
              <select value={minimo} onChange={(e) => setMinimo(e.target.value)} className={inputCls}>
                {MINIMOS_REINCIDENCIA.map((m) => <option key={m} value={String(m)}>{m} o más</option>)}
              </select>
            ))}
            <label className="flex h-9 items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={retirados} onChange={(e) => setRetirados(e.target.checked)} className="h-4 w-4 rounded border-[#CBD5E1]" />
              Incluir retirados
            </label>
            <button
              type="button"
              onClick={generar}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Generar
            </button>
            {datos && (
              <div className="ml-auto">
                <BotonesExportar
                  formatos={["pdf", "xlsx", "csv"]}
                  sinDatos={datos.filas.length === 0}
                  onExportar={(formato) => exportarHistoricoReincidencias({ formato, historico: datos, labels })}
                />
              </div>
            )}
          </div>

          {datos && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span>
                  {datos.filas.length} conductor{datos.filas.length === 1 ? "" : "es"} con {datos.minimo}+ ausencias
                  entre el {datos.desde} y el {datos.hasta}
                </span>
                <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-gray-600">
                  {datos.filas.filter((r) => r.mesesConAusencia >= 3).length} con 3+ meses
                </span>
                <span className="rounded-full bg-[#FEF2F2] px-2.5 py-1 text-xs font-semibold text-red-700">
                  {datos.filas.reduce((s, r) => s + r.noJustificadas, 0)} no justificadas
                </span>
                <span className="rounded-full bg-[#FFFBEB] px-2.5 py-1 text-xs font-semibold text-amber-700">
                  {datos.filas.reduce((s, r) => s + r.soportesPendientes, 0)} soportes pendientes
                </span>
                {datos.retiradosOcultos > 0 && (
                  <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs text-gray-500">
                    {datos.retiradosOcultos} retirado{datos.retiradosOcultos === 1 ? "" : "s"} fuera del reporte
                  </span>
                )}
              </div>
              {datos.truncado && (
                <p className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  El rango llegó al tope de lectura de registros: acótelo para que no falten ausencias.
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Conductor</th>
                      <th className="px-2 py-2 text-right">Meses</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-right">No justif.</th>
                      <th className="px-2 py-2 text-right">EPS</th>
                      <th className="px-2 py-2 text-right">Incap.</th>
                      <th className="px-2 py-2 text-right">Sop.</th>
                      {datos.meses.map((m) => (
                        <th key={m} className="px-2 py-2 text-center">{etiquetaMes(m)}</th>
                      ))}
                      <th className="px-3 py-2">Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.filas.map((r) => (
                      <tr key={r.cedula} className="border-b border-[#F1F5F9]">
                        <td className="px-3 py-2">
                          <p className="whitespace-nowrap font-medium text-gray-900">
                            {r.codigo ? `${r.codigo} · ` : ""}{r.nombre}
                          </p>
                          <p className="text-xs text-gray-500">
                            CC {r.cedula}
                            {r.retirado && (
                              <span className="ml-1 font-semibold text-gray-600">· {textoSituacion(r)}</span>
                            )}
                          </p>
                        </td>
                        <td className={`px-2 py-2 text-right ${r.mesesConAusencia >= 3 ? "font-bold text-gray-900" : ""}`}>
                          {r.mesesConAusencia}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">{r.total}</td>
                        <td className={`px-2 py-2 text-right ${r.noJustificadas > 0 ? "font-semibold text-red-700" : "text-gray-400"}`}>
                          {r.noJustificadas}
                        </td>
                        <td className={`px-2 py-2 text-right ${r.eps > 0 ? "text-[#4338CA]" : "text-gray-400"}`}>{r.eps}</td>
                        <td className={`px-2 py-2 text-right ${r.incapacidades > 0 ? "text-[#DC2626]" : "text-gray-400"}`}>
                          {r.incapacidades}
                          {r.incapacidades > 0 && <span className="ml-1 text-xs text-gray-500">({r.diasIncapacidad} d)</span>}
                        </td>
                        <td className={`px-2 py-2 text-right ${r.soportesPendientes > 0 ? "font-semibold text-amber-700" : "text-gray-400"}`}>
                          {r.soportesPendientes}
                        </td>
                        {datos.meses.map((m) => <CeldaMes key={m} fila={r} mes={m} />)}
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{r.ultimaFecha}</td>
                      </tr>
                    ))}
                    {datos.filas.length === 0 && (
                      <tr>
                        <td colSpan={8 + datos.meses.length} className="px-4 py-8 text-center text-sm text-gray-500">
                          Ningún conductor llega a {datos.minimo} ausencias entre el {datos.desde} y el {datos.hasta}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
