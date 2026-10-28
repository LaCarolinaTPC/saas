"use client";

import { SiExporta } from "@/components/permisos/permisos-provider";

import { useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TanqueoFila } from "@/lib/mantenimiento/combustible-data";
import { descargarExcelCombustible, etiquetasAlertas } from "@/lib/mantenimiento/combustible-export";
import { cop, decimal, entero, fechaCorta } from "@/lib/financiera/formato";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { CAUSA_CONCILIACION_LABEL, type ConciliacionGema } from "@/lib/mantenimiento/combustible-conciliacion";
import { IndicadorGema } from "../indicador-gema";

const inputCls = "h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";

export interface FiltrosPantalla {
  desde: string; hasta: string; codigo: string; placa: string; alertas: boolean;
}

export function HistorialCombustibleClient({ filtros, tanqueos, conciliacion, aviso, error }: {
  filtros: FiltrosPantalla;
  tanqueos: TanqueoFila[];
  /** Cruce con el cierre de GEMA del rango filtrado; null si no se pudo calcular. */
  conciliacion: ConciliacionGema | null;
  aviso: string | null;
  error: string | null;
}) {
  const [exportando, setExportando] = useState(false);

  const resumen = useMemo(() => {
    let galones = 0, valor = 0, conAlerta = 0;
    const buses = new Set<string>();
    const porBusDia = new Map<string, number>();
    for (const t of tanqueos) {
      galones += t.galones;
      valor += t.valor;
      if (t.alertas.length) conAlerta++;
      buses.add(t.vehiculo_codigo);
      const k = `${t.fecha}|${t.vehiculo_codigo}`;
      porBusDia.set(k, (porBusDia.get(k) ?? 0) + 1);
    }
    return { galones, valor, conAlerta, buses: buses.size, porBusDia };
  }, [tanqueos]);

  // Estado de cada bus-día frente a GEMA, para la columna de la tabla.
  const gema = useMemo(() => {
    if (!conciliacion) return null;
    return {
      sinLiquidar: new Set(conciliacion.diasSinLiquidar),
      diferencias: new Map(conciliacion.diferencias.map((d) => [`${d.fecha}|${d.bus}`, d])),
    };
  }, [conciliacion]);

  // Se pagina la tabla; el resumen y el Excel cubren todos los tanqueos.
  const pagina = usePaginacion(tanqueos);
  const ancla = useRef<HTMLDivElement>(null);

  async function exportar() {
    setExportando(true);
    try {
      await descargarExcelCombustible(tanqueos, filtros.desde, filtros.hasta, conciliacion);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  }

  const chip = "rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-gray-700";

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <form method="get" className="grid grid-cols-2 gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-sm text-gray-600">Desde<input type="date" name="desde" defaultValue={filtros.desde} className={inputCls} /></label>
        <label className="text-sm text-gray-600">Hasta<input type="date" name="hasta" defaultValue={filtros.hasta} className={inputCls} /></label>
        <label className="text-sm text-gray-600">Bus<input name="codigo" defaultValue={filtros.codigo} placeholder="Ej. 537" inputMode="numeric" className={inputCls} /></label>
        <label className="text-sm text-gray-600">Placa<input name="placa" defaultValue={filtros.placa} placeholder="Ej. WGD221" className={inputCls} /></label>
        <label className="flex items-end gap-2 pb-2 text-sm text-gray-600">
          <input type="checkbox" name="alertas" value="1" defaultChecked={filtros.alertas} /> Solo con alertas
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="h-10 flex-1 rounded-lg bg-[#4F46E5] px-3 text-sm font-semibold text-white hover:bg-[#4338CA]">Consultar</button>
          <SiExporta>
            <button type="button" onClick={exportar} disabled={exportando || tanqueos.length === 0} title="Descargar Excel" aria-label="Descargar Excel" className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50">
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
          </SiExporta>
        </div>
      </form>

      {aviso && <p className="text-sm text-amber-700">{aviso}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">No se pudo cargar el historial. Detalle: {error}</p>}

      <div className="flex flex-wrap gap-2 text-sm">
        <span className={chip}><strong>{entero(tanqueos.length)}</strong> tanqueos</span>
        <span className={chip}><strong>{decimal(resumen.galones, 1)}</strong> galones</span>
        <span className={chip}><strong>{cop(resumen.valor)}</strong></span>
        <span className={chip}>Precio promedio: <strong>{resumen.galones ? cop(resumen.valor / resumen.galones) : "—"}</strong> / galón</span>
        <span className={chip}><strong>{resumen.buses}</strong> buses</span>
        <span className={chip}>Con alerta: <strong>{entero(resumen.conAlerta)}</strong></span>
      </div>

      {conciliacion && tanqueos.length > 0 && (
        <div className="space-y-1">
          <IndicadorGema c={{ ...conciliacion, diferencias: conciliacion.diferencias.slice(0, 50) }} />
          {filtros.alertas && <p className="text-xs text-gray-500">El cruce con GEMA usa todos los tanqueos del filtro, no solo los que tienen alerta.</p>}
          {conciliacion.diferencias.length > 50 && <p className="text-xs text-gray-500">Se muestran las 50 diferencias más grandes; el Excel trae las {entero(conciliacion.diferencias.length)}.</p>}
        </div>
      )}

      {tanqueos.length === 0 && !error ? (
        <p className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-center text-sm text-gray-500">No hay tanqueos con estos filtros.</p>
      ) : (
        <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Bus</th>
                  <th className="px-3 py-2">Factura</th>
                  <th className="px-3 py-2 text-right">Galones</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">$ / galón</th>
                  <th className="px-3 py-2">Alertas</th>
                  <th className="px-3 py-2">Cierre GEMA (bus-día)</th>
                </tr>
              </thead>
              <tbody>
                {pagina.filas.map((t) => {
                  const enElDia = resumen.porBusDia.get(`${t.fecha}|${t.vehiculo_codigo}`) ?? 1;
                  return (
                    <tr key={t.id} className="border-t border-[#F1F5F9] align-top">
                      <td className="whitespace-nowrap px-3 py-2">
                        <div>{fechaCorta(t.fecha)}</div>
                        <div className="text-xs text-gray-500">{t.hora ? t.hora.slice(0, 5) : "sin hora"}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="font-semibold">{t.vehiculo_codigo}</div>
                        <div className="text-xs text-gray-500">{t.placa ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{t.factura}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{decimal(t.galones, 3)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(t.valor)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(t.precio_galon)}</td>
                      <td className="px-3 py-2 text-xs">
                        {t.alertas.length > 0 && <div className="text-amber-700">{etiquetasAlertas(t.alertas)}</div>}
                        {enElDia > 1 && <div className="text-gray-500">{enElDia} tanqueos ese día</div>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <CeldaGema gema={gema} fecha={t.fecha} bus={t.vehiculo_codigo} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginador p={pagina} unidad="tanqueos" ancla={ancla} />
        </div>
      )}
    </div>
  );
}

/** Cómo quedó el bus ese día frente al cierre de GEMA. */
function CeldaGema({ gema, fecha, bus }: {
  gema: { sinLiquidar: Set<string>; diferencias: Map<string, ConciliacionGema["diferencias"][number]> } | null;
  fecha: string;
  bus: string;
}) {
  if (!gema) return <span className="text-gray-400">—</span>;
  if (gema.sinLiquidar.has(fecha)) return <span className="text-gray-500">sin cierre aún</span>;
  const d = gema.diferencias.get(`${fecha}|${bus}`);
  if (!d) return <span className="text-emerald-700">cuadra</span>;
  return (
    <div className="text-amber-700">
      <div className="whitespace-nowrap tabular-nums">GEMA {cop(d.gema)} ({cop(d.diferencia)})</div>
      <div>{CAUSA_CONCILIACION_LABEL[d.causa]}</div>
    </div>
  );
}
