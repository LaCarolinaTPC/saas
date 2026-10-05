"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fechaLegible } from "@/lib/operativo/constants";
import type { RevisionPreop } from "@/lib/operativo/preoperacional-data";
import { descargarExcelPreoperacional } from "@/lib/operativo/preoperacional-export";
import { nombrePunto } from "@/lib/operativo/preoperacional-lista";
import { RESULTADOS_PREOP, RESULTADO_LABEL, type ResultadoPreop } from "@/lib/operativo/preoperacional-reglas";
import { ChipResultado, horaBogota } from "../comunes";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";

const inputCls = "h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";

function duracion(seg: number | null): string {
  if (seg == null) return "—";
  if (seg < 60) return `${seg} s`;
  return `${Math.floor(seg / 60)} min ${seg % 60} s`;
}

export function HistorialClient({ desde, hasta, codigo, resultado, revisiones, aviso, error }: {
  desde: string;
  hasta: string;
  codigo: string;
  resultado: string;
  revisiones: RevisionPreop[];
  aviso: string | null;
  error: string | null;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const resumen = useMemo(() => {
    const c: Record<ResultadoPreop, number> = { apto: 0, apto_obs: 0, no_apto: 0 };
    for (const r of revisiones) c[r.resultado]++;
    const tiempos = revisiones.flatMap((r) => (r.duracion_seg != null ? [r.duracion_seg] : [])).sort((a, b) => a - b);
    const mediana = tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : null;
    return { c, mediana };
  }, [revisiones]);

  // Se pagina la tabla; el resumen y el Excel cubren todas las revisiones.
  const pagina = usePaginacion(revisiones);
  const ancla = useRef<HTMLDivElement>(null);

  async function exportar() {
    setExportando(true);
    try {
      await descargarExcelPreoperacional(revisiones, desde, hasta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <form method="get" className="grid grid-cols-2 gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 sm:grid-cols-5">
        <label className="text-sm text-gray-600">Desde<input type="date" name="desde" defaultValue={desde} className={inputCls} /></label>
        <label className="text-sm text-gray-600">Hasta<input type="date" name="hasta" defaultValue={hasta} className={inputCls} /></label>
        <label className="text-sm text-gray-600">Vehículo<input name="codigo" defaultValue={codigo} placeholder="Ej. 501" inputMode="numeric" className={inputCls} /></label>
        <label className="text-sm text-gray-600">Resultado
          <select name="resultado" defaultValue={resultado} className={inputCls}>
            <option value="">Todos</option>
            {RESULTADOS_PREOP.map((r) => <option key={r} value={r}>{RESULTADO_LABEL[r]}</option>)}
          </select>
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button type="submit" className="h-10 flex-1 rounded-lg bg-[#4F46E5] px-3 text-sm font-semibold text-white hover:bg-[#4338CA]">Consultar</button>
          <button type="button" onClick={exportar} disabled={exportando || revisiones.length === 0} title="Descargar Excel" aria-label="Descargar Excel" className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50">
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
        </div>
      </form>

      {aviso && <p className="text-sm text-amber-700">{aviso}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">No se pudo cargar el historial. Detalle: {error}</p>}

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-gray-700"><strong>{revisiones.length}</strong> revisiones</span>
        {RESULTADOS_PREOP.map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-gray-700">
            <ChipResultado estado={r} pequeno /> {resumen.c[r]}
          </span>
        ))}
        {resumen.mediana != null && (
          <span className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-gray-700">Tiempo típico por bus: <strong>{duracion(resumen.mediana)}</strong></span>
        )}
      </div>

      {revisiones.length === 0 && !error ? (
        <p className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-center text-sm text-gray-500">No hay revisiones en este periodo.</p>
      ) : (
        <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Bus</th>
                  <th className="px-3 py-2">Resultado</th>
                  <th className="px-3 py-2">Fallas</th>
                  <th className="px-3 py-2">Conductor</th>
                  <th className="px-3 py-2">Inspector</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pagina.filas.map((r) => {
                  const ver = abierta === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer border-t border-[#F1F5F9] hover:bg-[#F8FAFC]" onClick={() => setAbierta(ver ? null : r.id)}>
                        <td className="whitespace-nowrap px-3 py-2">{fechaLegible(r.fecha)} <span className="text-gray-500">{horaBogota(r.created_at)}</span></td>
                        <td className="px-3 py-2 font-semibold">{r.codigo_vehiculo} <span className="font-normal text-gray-500">{r.placa}</span></td>
                        <td className="px-3 py-2"><ChipResultado estado={r.resultado} pequeno /></td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.fallas === 0 && r.documentos_vencidos === 0 ? "—" : (
                            <>
                              {r.fallas > 0 && `${r.fallas}${r.fallas_criticas ? ` (${r.fallas_criticas} crít.)` : ""}`}
                              {r.documentos_vencidos > 0 && <span className="ml-1 text-red-700">{r.documentos_vencidos} doc. vencido{r.documentos_vencidos === 1 ? "" : "s"}</span>}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{r.conductor_nombre ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{r.inspector_email ?? "—"}</td>
                        <td className="px-3 py-2 text-right"><ChevronDown className={`inline h-4 w-4 text-gray-400 transition ${ver ? "rotate-180" : ""}`} /></td>
                      </tr>
                      {ver && (
                        <tr className="bg-[#F8FAFC]">
                          <td colSpan={7} className="px-3 py-3">
                            {r.detalle.length === 0 ? (
                              <p className="text-sm text-gray-600">Todos los puntos cumplieron.</p>
                            ) : (
                              <ul className="space-y-1 text-sm">
                                {r.detalle.map((f) => (
                                  <li key={f.item_key}>
                                    <span className={f.critico ? "font-semibold text-[#991B1B]" : "text-gray-800"}>{nombrePunto(f.item_key)}</span>
                                    {f.critico && <span className="ml-1 text-[10px] font-semibold uppercase text-[#B91C1C]">crítico</span>}
                                    {f.nota && <span className="text-gray-600"> — {f.nota}</span>}
                                    {f.concepto && (
                                      <span className="ml-1 text-xs text-gray-500">
                                        · {f.mantenimiento_reporte_id ? `reporte en Mantenimiento (${f.concepto})` : `no pasó a Mantenimiento (${f.concepto})`}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {r.documentos.some((d) => d.nivel === "vencido") && (
                              <p className="mt-2 text-sm text-red-700">Vencidos: {r.documentos.filter((d) => d.nivel === "vencido").map((d) => d.nombre).join(", ")}</p>
                            )}
                            {r.observaciones && <p className="mt-2 text-sm text-gray-700">Observaciones: {r.observaciones}</p>}
                            <p className="mt-2 text-xs text-gray-500">Duración: {duracion(r.duracion_seg)} · Lista {r.version_lista}</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginador p={pagina} unidad="revisiones" ancla={ancla} />
        </div>
      )}
    </div>
  );
}
