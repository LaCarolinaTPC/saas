"use client";

/**
 * Pagos del Plan Padrino antes de Gestivo (F6, solo administradores): cargar
 * el listado de Nómina/GH, previsualizarlo, reversar una carga y ver qué
 * referidos registrados ya tenían un pago (la política paga una sola vez por
 * cédula: R11).
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateBogota } from "@/lib/utils";
import { cargarHistorico, previsualizarHistorico, reversarHistorico, type PreviaHistorico } from "@/lib/padrino/actions";
import type { getResumenHistorico } from "@/lib/padrino/datos";
import { inputCls } from "./buscadores";
import { EstadoBadge } from "./plan-padrino-client";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function HistoricoPagos({ resumen }: { resumen: Awaited<ReturnType<typeof getResumenHistorico>> }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fuente, setFuente] = useState("");
  const [previa, setPrevia] = useState<PreviaHistorico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const form = () => {
    const fd = new FormData();
    if (archivo) fd.set("archivo", archivo);
    fd.set("fuente", fuente);
    return fd;
  };

  function previsualizar() {
    setError(null);
    setPrevia(null);
    start(async () => {
      const r = await previsualizarHistorico(form());
      if (r.ok) setPrevia(r.previa);
      else setError(r.error);
    });
  }

  function cargar() {
    setError(null);
    start(async () => {
      const r = await cargarHistorico(form());
      if (r.ok) {
        toast.success(`${r.filas} pago(s) históricos cargados.`);
        setPrevia(null);
        setArchivo(null);
        setFuente("");
        router.refresh();
      } else setError(r.error);
    });
  }

  function reversar(f: string) {
    if (!window.confirm(`¿Reversar la carga «${f}»? Se borran todas sus filas.`)) return;
    start(async () => {
      const r = await reversarHistorico(f);
      if (r.ok) {
        toast.success(`Carga reversada: ${r.filas} fila(s) borradas.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <details className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gray-900">
        Pagos del plan antes de Gestivo
        <span className="ml-2 font-normal text-gray-500">
          ({resumen.cargas.reduce((s, c) => s + c.cedulas, 0)} cédula(s) cargadas · {resumen.coincidencias.length} referido(s) con pago previo)
        </span>
      </summary>
      <p className="mt-2 text-xs text-gray-500">
        La política paga <strong>una sola bonificación por cédula</strong> en la historia, sin importar el padrino. Cargue aquí el listado de Nómina o Gestión Humana con las cédulas ya pagadas (todos los años): el requisito R11 las marca como «ya pagado». El archivo necesita una columna de cédula; año (o fecha) y valor son opcionales.
      </p>
      {!resumen.disponible && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Falta aplicar la migración de la v3: no existe la tabla del histórico.</p>}

      {resumen.cargas.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-3">Fuente</th>
                <th className="py-1.5 pr-3 text-right">Filas</th>
                <th className="py-1.5 pr-3 text-right">Cédulas</th>
                <th className="py-1.5 pr-3">Años</th>
                <th className="py-1.5 pr-3 text-right">Valor</th>
                <th className="py-1.5 pr-3">Cargó</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F8FAFC]">
              {resumen.cargas.map((c) => (
                <tr key={c.fuente}>
                  <td className="py-1.5 pr-3 text-gray-800">{c.fuente}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.filas}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.cedulas}</td>
                  <td className="py-1.5 pr-3">{c.desde ? (c.desde === c.hasta ? c.desde : `${c.desde}–${c.hasta}`) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.valor ? COP.format(c.valor) : "—"}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{c.cargadoPor ?? "—"} · {formatDateBogota(c.cargadoAt)}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => reversar(c.fuente)} disabled={pendiente} className="inline-flex items-center gap-1 text-red-600 hover:underline disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" /> Reversar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resumen.coincidencias.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-800">Referidos registrados en Gestivo cuya cédula ya tenía un pago del plan</p>
          <ul className="mt-1 space-y-1 text-xs text-red-800">
            {resumen.coincidencias.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/candidatos/plan-padrino/${c.id}`} className="font-medium underline">{c.nombre ?? c.cedula}</Link>
                <span>CC {c.cedula} · esquema {c.esquema}</span>
                <EstadoBadge estado={c.estado} />
                {c.anulado && <span className="text-red-600">anulado</span>}
                <span className="text-red-700">pagado antes: {c.pagos}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-red-700">Revalide los que siguen en validación: R11 queda en «no cumple». Los que ya tienen hitos los decide la coordinación (anular o mantener como excepción).</p>
        </div>
      )}

      {resumen.disponible && (
        <div className="mt-4 rounded-lg border border-[#E2E8F0] p-3">
          <p className="text-xs font-semibold text-gray-700">Cargar un listado</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-600">
              Archivo (Excel .xlsx o CSV, máximo 5 MB)
              <input
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] ?? null);
                  setPrevia(null);
                }}
                className="mt-1 block w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#EEF2FF] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#4F46E5]"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Fuente (quién lo entregó y cuándo)
              <input value={fuente} onChange={(e) => setFuente(e.target.value)} maxLength={200} placeholder="Nómina · listado 2019-2026 entregado el …" className={`${inputCls} mt-1 w-full`} />
            </label>
          </div>
          {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          {previa && (
            <div className="mt-3 rounded-lg bg-[#F8FAFC] p-3 text-xs text-gray-700">
              <p>
                <strong>{previa.resumen.filas}</strong> fila(s) válidas de <strong>{previa.resumen.cedulas}</strong> cédula(s)
                {previa.resumen.desde ? `, años ${previa.resumen.desde === previa.resumen.hasta ? previa.resumen.desde : `${previa.resumen.desde}–${previa.resumen.hasta}`}` : ""}
                {previa.resumen.valor ? `, ${COP.format(previa.resumen.valor)}` : ""}.
                {previa.resumen.repetidas > 0 && ` Se descartan ${previa.resumen.repetidas} fila(s) repetidas.`}
                {previa.yaCargadas > 0 && ` ${previa.yaCargadas} cédula(s) ya estaban cargadas desde otra fuente.`}
              </p>
              <p className="mt-1 text-gray-500">
                Columnas leídas: cédula «{previa.columnas.cedula}»{previa.columnas.anio ? `, año «${previa.columnas.anio}»` : ", sin año"}{previa.columnas.valor ? `, valor «${previa.columnas.valor}»` : ", sin valor"}.
              </p>
              {previa.errores.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-amber-700">{previa.resumen.errores} fila(s) con error (no se cargan)</summary>
                  <ul className="mt-1 list-disc pl-5 text-amber-800">
                    {previa.errores.map((e) => <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>)}
                  </ul>
                </details>
              )}
              {previa.referidos.length > 0 && (
                <p className="mt-1 text-red-700">
                  {previa.referidos.length} referido(s) registrados en Gestivo aparecen en el listado: {previa.referidos.map((r) => r.nombre ?? r.cedula).join(", ")}.
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={previsualizar} disabled={pendiente || !archivo}>
              {pendiente && !previa ? "Leyendo…" : "Previsualizar"}
            </Button>
            <Button onClick={cargar} disabled={pendiente || !previa || fuente.trim().length < 5} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
              <Upload className="h-4 w-4" /> {pendiente && previa ? "Cargando…" : "Cargar listado"}
            </Button>
          </div>
        </div>
      )}
    </details>
  );
}
