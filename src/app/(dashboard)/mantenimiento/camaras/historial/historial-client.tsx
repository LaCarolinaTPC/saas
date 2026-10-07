"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fechaLegible } from "@/lib/operativo/constants";
import type { RevisionCamaras } from "@/lib/mantenimiento/camaras-data";
import { descargarExcelCamaras } from "@/lib/mantenimiento/camaras-export";
import {
  CONDUCTOR_ORIGEN_LABEL, ELEMENTOS, ELEMENTO_LABEL, compararConAforo, type TipoNovedad,
} from "@/lib/mantenimiento/camaras-reglas";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { ChipDiferencia } from "../camaras-client";
import { eliminarRevision } from "../actions";

const inputCls = "h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";

const ALERTA_LABEL: Record<string, string> = {
  fecha_corregida: "fecha corregida",
  vehiculo_no_existe: "bus fuera del maestro",
  viaje_no_existe: "viaje no está en GEMA",
  sin_viajes_gema: "bus sin viajes en GEMA ese día",
  conductor_distinto: "conductor distinto al de GEMA",
  conteo_invalido: "conteo descartado",
  tipo_deducido: "tipo deducido",
};

export interface FiltrosPantalla {
  desde: string; hasta: string; codigo: string; conductor: string; elemento: string; tipo: string;
  falla: string; origen: string; alertas: boolean;
}

export function HistorialCamarasClient({ filtros, revisiones, tipos, recaudo, puedeEditar, aviso, error }: {
  filtros: FiltrosPantalla;
  revisiones: RevisionCamaras[];
  tipos: TipoNovedad[];
  recaudo: Record<number, number | null>;
  puedeEditar: boolean;
  aviso: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [exportando, setExportando] = useState(false);
  const [pending, startTransition] = useTransition();
  const nombreTipo = useMemo(() => new Map(tipos.map((t) => [t.clave, t.nombre])), [tipos]);

  const resumen = useMemo(() => {
    let fallas = 0, conConteo = 0, cuadra = 0, descuadre = 0;
    for (const r of revisiones) {
      if (r.con_falla) fallas++;
      const d = compararConAforo(r.dfs_optocontrol, r.aforo);
      if (d.nivel !== "sin_dato") conConteo++;
      if (d.nivel === "ok") cuadra++;
      if (d.nivel === "critico") descuadre++;
    }
    return { fallas, conConteo, cuadra, descuadre };
  }, [revisiones]);

  // Se pagina la tabla; el resumen y el Excel cubren todas las revisiones.
  const pagina = usePaginacion(revisiones);
  const ancla = useRef<HTMLDivElement>(null);

  async function exportar() {
    setExportando(true);
    try {
      await descargarExcelCamaras(revisiones, tipos, recaudo, filtros.desde, filtros.hasta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  }

  function eliminar(id: string) {
    if (!confirm("¿Eliminar esta revisión? Deja de contar en el historial y los indicadores.")) return;
    startTransition(async () => {
      const r = await eliminarRevision(id);
      if (!r.success) { toast.error(r.error ?? "No se pudo eliminar."); return; }
      toast.success("Revisión eliminada.");
      router.refresh();
    });
  }

  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : "—");
  const tiposFiltro = tipos.filter((t) => !filtros.elemento || t.elemento === filtros.elemento);
  const chip = "rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-gray-700";

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <form method="get" className="grid grid-cols-2 gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 sm:grid-cols-4 lg:grid-cols-5">
        <label className="text-sm text-gray-600">Desde<input type="date" name="desde" defaultValue={filtros.desde} className={inputCls} /></label>
        <label className="text-sm text-gray-600">Hasta<input type="date" name="hasta" defaultValue={filtros.hasta} className={inputCls} /></label>
        <label className="text-sm text-gray-600">Vehículo<input name="codigo" defaultValue={filtros.codigo} placeholder="Ej. 537" inputMode="numeric" className={inputCls} /></label>
        <label className="text-sm text-gray-600">Conductor<input name="conductor" defaultValue={filtros.conductor} placeholder="Nombre o cédula" className={inputCls} /></label>
        <label className="text-sm text-gray-600">Elemento
          <select name="elemento" defaultValue={filtros.elemento} className={inputCls}>
            <option value="">Todos</option>
            {ELEMENTOS.map((e) => <option key={e} value={e}>{ELEMENTO_LABEL[e]}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-600">Resultado
          <select name="tipo" defaultValue={filtros.tipo} className={inputCls}>
            <option value="">Todos</option>
            {tiposFiltro.map((t) => <option key={t.clave} value={t.clave}>{ELEMENTO_LABEL[t.elemento]} · {t.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-600">Falla
          <select name="falla" defaultValue={filtros.falla} className={inputCls}>
            <option value="">Todas</option>
            <option value="si">Con falla</option>
            <option value="no">Sin falla</option>
          </select>
        </label>
        <label className="text-sm text-gray-600">Registro
          <select name="origen" defaultValue={filtros.origen} className={inputCls}>
            <option value="">Todos</option>
            <option value="formulario">Gestivo</option>
            <option value="migracion">Histórico del Forms</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-gray-600">
          <input type="checkbox" name="alertas" value="1" defaultChecked={filtros.alertas} /> Solo con alertas
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="h-10 flex-1 rounded-lg bg-[#4F46E5] px-3 text-sm font-semibold text-white hover:bg-[#4338CA]">Consultar</button>
          <button type="button" onClick={exportar} disabled={exportando || revisiones.length === 0} title="Descargar Excel" aria-label="Descargar Excel" className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50">
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
        </div>
      </form>

      {aviso && <p className="text-sm text-amber-700">{aviso}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">No se pudo cargar el historial. Detalle: {error}</p>}

      <div className="flex flex-wrap gap-2 text-sm">
        <span className={chip}><strong>{revisiones.length}</strong> revisiones</span>
        <span className={chip}>Con falla: <strong>{resumen.fallas}</strong> ({pct(resumen.fallas, revisiones.length)})</span>
        <span className={chip}>DFS cuadra con el aforo: <strong>{pct(resumen.cuadra, resumen.conConteo)}</strong></span>
        <span className={chip}>Descuadres: <strong>{resumen.descuadre}</strong></span>
      </div>

      {revisiones.length === 0 && !error ? (
        <p className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-center text-sm text-gray-500">No hay revisiones con estos filtros.</p>
      ) : (
        <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Viaje</th>
                  <th className="px-3 py-2">Conductor</th>
                  <th className="px-3 py-2">Resultado</th>
                  <th className="px-3 py-2 text-right">DFS</th>
                  <th className="px-3 py-2 text-right">Aforo</th>
                  <th className="px-3 py-2 text-right">Caja</th>
                  <th className="px-3 py-2">Semáforo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pagina.filas.map((r) => {
                  const caja = r.despacho_numero != null ? (recaudo[r.despacho_numero] ?? null) : null;
                  return (
                    <tr key={r.id} className="border-t border-[#F1F5F9] align-top">
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="font-semibold">{r.vehiculo_codigo} · viaje {r.viaje}</div>
                        <div className="text-xs text-gray-500">{fechaLegible(r.fecha_viaje)}{r.revision_repetida && " · repetida"}</div>
                        {r.origen === "migracion" && <div className="text-xs text-gray-400">Forms</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-gray-800">{r.conductor_nombre ?? "—"}</div>
                        {r.conductor_origen !== "gema_viaje" && (
                          <div className="text-xs text-amber-700">{CONDUCTOR_ORIGEN_LABEL[r.conductor_origen]}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div>{ELEMENTO_LABEL[r.elemento]}</div>
                        <div className={`text-xs ${r.con_falla ? "text-red-700" : "text-emerald-700"}`}>{nombreTipo.get(r.tipo_novedad) ?? r.tipo_novedad}</div>
                        {r.observaciones && <div className="max-w-xs text-xs text-gray-500">{r.observaciones}</div>}
                        {r.alertas.length > 0 && (
                          <div className="text-xs text-amber-700">{r.alertas.map((a) => ALERTA_LABEL[a] ?? a).join(" · ")}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.dfs_optocontrol ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.aforo ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{caja ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.aforo != null && (
                          <div className="flex flex-col items-start gap-1">
                            <ChipDiferencia etiqueta="DFS" conteo={r.dfs_optocontrol} aforo={r.aforo} />
                            {caja != null && <ChipDiferencia etiqueta="Caja" conteo={caja} aforo={r.aforo} />}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {puedeEditar && (
                          <button type="button" disabled={pending} onClick={() => eliminar(r.id)} className="text-gray-400 hover:text-red-600" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
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
