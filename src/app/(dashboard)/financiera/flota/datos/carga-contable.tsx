"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { AvisoFila, FilaRechazada, ResumenPeriodo } from "@/lib/financiera/archivo-contable";
import { ESTADO_PERIODO, cop, entero, nombrePeriodo } from "@/lib/financiera/formato";
import { TablaInteractiva } from "../tabla-interactiva";

/** Lo que devuelve POST /api/financiera/contable con accion=previsualizar. */
export interface Previsualizacion {
  errorArchivo: string | null;
  validas: number;
  rechazadas: FilaRechazada[];
  rechazadasTotal: number;
  /** Avisos que no bloquean la carga (hoy: posible doble conteo con GEMA). */
  avisos: AvisoFila[];
  avisosTotal: number;
  celdasVacias: number;
  porPeriodo: ResumenPeriodo[];
  totalFilas: number;
  archivo: string;
}

/**
 * Carga del archivo contable (plan, 6.6): plantilla, previsualización con
 * filas rechazadas y delta de totales, y confirmación. La confirmación
 * reenvía el mismo archivo: el servidor vuelve a validar antes de escribir.
 */
export function CargaContable({ inicial }: { inicial?: Previsualizacion }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previsualizacion | null>(inicial ?? null);
  const [pendiente, empezar] = useTransition();
  const [paso, setPaso] = useState<"previsualizar" | "cargar" | null>(null);

  async function enviar(accion: "previsualizar" | "cargar") {
    if (!archivo) return;
    setPaso(accion);
    const form = new FormData();
    form.set("archivo", archivo);
    form.set("accion", accion);
    try {
      const res = await fetch("/api/financiera/contable", { method: "POST", body: form });
      const json = (await res.json()) as
        | { ok: true; previsualizacion?: Previsualizacion; carga?: { filas: number; rechazadas: number; periodos: string[] } }
        | { ok: false; error: string };
      if (!json.ok) {
        toast.error(json.error);
        return;
      }
      if (accion === "previsualizar" && json.previsualizacion) {
        setPrevia(json.previsualizacion);
        if (json.previsualizacion.errorArchivo) toast.error("El archivo se rechazó entero. Revisa el motivo.");
      }
      if (accion === "cargar" && json.carga) {
        const c = json.carga;
        toast.success(`Cargadas ${c.filas} filas en ${c.periodos.join(", ")}${c.rechazadas ? ` · ${c.rechazadas} rechazadas` : ""}.`);
        setPrevia(null);
        setArchivo(null);
        if (input.current) input.current.value = "";
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPaso(null);
    }
  }

  const ocupado = pendiente || paso !== null;
  const puedeConfirmar = !!previa && !previa.errorArchivo && previa.validas > 0 && !!archivo;

  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Archivo contable</h2>
          <p className="text-xs text-gray-500">
            Los seis rubros que no existen en GEMA (despacho, intereses, otros gastos, repuestos, mano de obra y descuento
            fondo-conductor), una fila por vehículo y mes. CSV o Excel de ocho columnas, más dos opcionales:
            combustible y póliza de vehículos nuevos.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/financiera/plantilla?formato=xlsx" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" /> Plantilla Excel
          </a>
          <a href="/api/financiera/plantilla?formato=csv" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" /> Plantilla CSV
          </a>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 text-sm text-gray-700 hover:bg-white">
            <FileSpreadsheet className="h-4 w-4 text-gray-500" />
            <span className="max-w-[260px] truncate">{archivo ? archivo.name : "Elegir archivo CSV o .xlsx"}</span>
            <input
              ref={input}
              type="file"
              accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setPrevia(null);
              }}
            />
          </label>
          <button
            type="button"
            disabled={!archivo || ocupado}
            onClick={() => empezar(() => enviar("previsualizar"))}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#4F46E5] px-4 text-sm font-medium text-[#4F46E5] hover:bg-indigo-50 disabled:opacity-50"
          >
            {paso === "previsualizar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Previsualizar
          </button>
          <button
            type="button"
            disabled={!puedeConfirmar || ocupado}
            onClick={() => empezar(() => enviar("cargar"))}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {paso === "cargar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar carga
          </button>
          <span className="text-xs text-gray-500">Nada se escribe hasta confirmar. Volver a cargar un mes reemplaza sus rubros y no toca lo de GEMA.</span>
        </div>

        {previa && <Previa p={previa} />}
      </div>
    </section>
  );
}

function Previa({ p }: { p: Previsualizacion }) {
  if (p.errorArchivo) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Archivo rechazado entero: {p.archivo}</p>
          <p className="mt-1">{p.errorArchivo}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
        <span><strong>{p.archivo}</strong></span>
        <span>{entero(p.totalFilas)} filas leídas</span>
        <span className="text-emerald-700">{entero(p.validas)} válidas</span>
        <span className={p.rechazadasTotal ? "text-red-700" : ""}>{entero(p.rechazadasTotal)} rechazadas</span>
        <span className={p.celdasVacias ? "text-amber-700" : ""} title="Celdas vacías interpretadas como 0; no confunda «sin dato» con «cero».">
          {entero(p.celdasVacias)} celdas vacías tomadas como 0
        </span>
      </div>

      <TablaInteractiva id="previsualizacion-contable" columnas={[
        "Período", "Estado", "Válidas", "Nuevas", "Reemplazadas", "Rechazadas", "Con archivo", "Gastos contables", "Utilidad del mes",
      ]}>
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">Período</th>
              <th className="whitespace-nowrap px-3 py-2">Estado</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Válidas</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Nuevas</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Reemplazadas</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Rechazadas</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Con archivo</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Gastos contables</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Utilidad del mes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {p.porPeriodo.map((r) => {
              const est = ESTADO_PERIODO[r.estado];
              return (
                <tr key={r.periodo}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium capitalize text-gray-900">{nombrePeriodo(r.periodo)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${est.clase}`}>{est.etiqueta}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(r.validas)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(r.nuevas)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.reemplazadas ? "text-amber-700" : ""}`}>{entero(r.reemplazadas)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.rechazadas ? "text-red-700" : ""}`}>{entero(r.rechazadas)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={`${r.sinArchivo} vehículos del mes quedarían sin archivo`}>
                    {entero(r.antes.vehiculosConArchivo)} → {entero(r.despues.vehiculosConArchivo)} / {entero(r.vehiculosMes)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    <span className="text-gray-400">{cop(r.antes.gastosContables)}</span> → {cop(r.despues.gastosContables)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    <span className="text-gray-400">{cop(r.antes.utilidad)}</span> →{" "}
                    <span className={r.despues.utilidad < 0 ? "text-red-600" : ""}>{cop(r.despues.utilidad)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TablaInteractiva>

      {p.avisos.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50/50" open={p.avisos.length <= 15}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-amber-900">
            Posible doble conteo ({entero(p.avisosTotal)}{p.avisosTotal > p.avisos.length ? `, se muestran ${p.avisos.length}` : ""})
          </summary>
          <p className="px-3 pb-2 text-xs text-amber-800">
            No bloquea la carga. Revise si ese gasto ya viene de GEMA antes de confirmar.
          </p>
          <ul className="max-h-64 divide-y divide-amber-100 overflow-auto text-sm">
            {p.avisos.map((a) => (
              <li key={`aviso-${a.linea}-${a.vehiculo}-${a.mensaje.slice(0, 12)}`} className="flex flex-wrap gap-x-3 px-3 py-1.5">
                <span className="w-16 shrink-0 font-mono text-xs text-gray-500">línea {a.linea}</span>
                <span className="font-mono text-xs text-gray-700">{a.periodo} · {a.vehiculo}</span>
                <span className="text-amber-900">{a.mensaje}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {p.rechazadas.length > 0 && (
        <details className="rounded-lg border border-red-200 bg-red-50/40" open={p.rechazadas.length <= 15}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-red-800">
            Filas rechazadas ({entero(p.rechazadasTotal)}{p.rechazadasTotal > p.rechazadas.length ? `, se muestran ${p.rechazadas.length}` : ""})
          </summary>
          <ul className="max-h-64 divide-y divide-red-100 overflow-auto text-sm">
            {p.rechazadas.map((r) => (
              <li key={`${r.linea}-${r.vehiculo}`} className="flex flex-wrap gap-x-3 px-3 py-1.5">
                <span className="w-16 shrink-0 font-mono text-xs text-gray-500">línea {r.linea}</span>
                <span className="font-mono text-xs text-gray-700">{r.periodo ?? "—"} · {r.vehiculo ?? "—"}</span>
                <span className="text-red-800">{r.motivo}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
