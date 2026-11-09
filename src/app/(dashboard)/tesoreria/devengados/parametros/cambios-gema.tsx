"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, GitCompareArrows, Loader2 } from "lucide-react";
import { marcarCambiosCierresRevisados } from "@/lib/gema/actions";
import type { CambioGuardado, CambiosCierres } from "@/lib/gema/cambios-cierres-datos";
import { CAMPO_ETIQUETA, TIPO_CAMBIO, formatoValor, pesos } from "@/lib/gema/cambios-cierres-formato";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });

function Cambios({ c }: { c: CambioGuardado }) {
  const campos = Object.entries(c.cambios) as [keyof typeof CAMPO_ETIQUETA, [number | null, number | null]][];
  if (campos.length === 0) return <span className="text-gray-400">sin valores</span>;
  return (
    <ul className="space-y-0.5">
      {campos.map(([campo, [antes, despues]]) => (
        <li key={campo} className="whitespace-nowrap">
          <span className="text-gray-500">{CAMPO_ETIQUETA[campo] ?? campo}:</span>{" "}
          <span className="tabular-nums text-gray-500 line-through decoration-gray-300">{formatoValor(campo, antes)}</span>
          {" → "}
          <span className="tabular-nums font-medium text-gray-800">{formatoValor(campo, despues)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cierres de días anteriores que GEMA cambió después de sincronizados
 * (gema_cambios_cierres). Pendientes primero; el administrador los marca
 * revisados.
 */
export function CambiosGemaPanel({ datos, esAdmin }: { datos: CambiosCierres; esAdmin: boolean }) {
  const router = useRouter();
  const [verRevisados, setVerRevisados] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!datos.disponible) {
    return (
      <p className="mt-4 text-xs text-gray-400">
        Registro de cambios de GEMA no disponible: falta aplicar la migración
        <code className="mx-1">20261109151810_gema_cambios_en_cierres_de_dias_anteriores.sql</code>.
      </p>
    );
  }

  const filas = datos.filas.filter((f) => (verRevisados ? f.revisado_at : !f.revisado_at));
  const marcar = (ids?: number[]) => {
    setError(null);
    startTransition(async () => {
      const r = await marcarCambiosCierresRevisados(ids);
      if (!r.ok) setError(r.error ?? "No se pudo marcar.");
      else router.refresh();
    });
  };

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <GitCompareArrows className="h-3.5 w-3.5" /> Cambios de GEMA en días anteriores
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setVerRevisados((v) => !v)}
            className="rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-gray-600 hover:bg-gray-50"
          >
            {verRevisados ? "Ver pendientes" : "Ver revisados"}
          </button>
          {esAdmin && !verRevisados && datos.pendientes > 0 && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => marcar()}
              className="inline-flex items-center gap-1 rounded-md bg-[#4338CA] px-2 py-1 font-medium text-white hover:bg-[#3730A3] disabled:opacity-60"
            >
              {pendiente ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Marcar todos revisados
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs text-gray-500">
        Cierres de hace más de 2 días cuya producción o salario cambió en GEMA después de sincronizados. Gestivo ya
        tiene el valor nuevo; aquí queda el anterior para revisar con el conductor.
      </p>

      {datos.pendientes > 0 && !verRevisados && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {datos.pendientes} {datos.pendientes === 1 ? "cierre cambiado" : "cierres cambiados"} sin revisar · diferencia
          en salario neto {pesos(datos.deltaPendiente, true)}
          {datos.pendientes > filas.length ? ` · se muestran los ${filas.length} más antiguos` : ""}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {filas.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400">
          {verRevisados ? "Todavía no hay cambios revisados." : "No hay cambios pendientes."}
        </p>
      ) : (
        <div className="mt-2 max-h-[480px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[#F1F5F9] text-left uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-3">Fecha</th>
                <th className="py-1.5 pr-3">Conductor</th>
                <th className="py-1.5 pr-3">Ruta</th>
                <th className="py-1.5 pr-3">Tipo</th>
                <th className="py-1.5 pr-3">Antes → después</th>
                <th className="py-1.5 pr-3 text-right">Δ neto</th>
                <th className="py-1.5 pr-3">Detectado</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => {
                const tipo = TIPO_CAMBIO[c.tipo];
                return (
                  <tr key={c.id} className="border-b border-[#F1F5F9] align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-gray-700">{c.fecha}</td>
                    <td className="py-1.5 pr-3 text-gray-700">
                      <span className="font-medium">{c.cod_conductor}</span>
                      {c.conductor_nombre ? <span className="block text-gray-500">{c.conductor_nombre}</span> : null}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-600">{c.ruta || "—"}</td>
                    <td className={`py-1.5 pr-3 whitespace-nowrap ${tipo.cls}`}>{tipo.texto}</td>
                    <td className="py-1.5 pr-3">
                      <Cambios c={c} />
                    </td>
                    <td
                      className={`py-1.5 pr-3 text-right tabular-nums whitespace-nowrap ${
                        c.delta_neto < 0 ? "text-red-600" : c.delta_neto > 0 ? "text-emerald-700" : "text-gray-500"
                      }`}
                    >
                      {pesos(c.delta_neto, true)}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-gray-500">
                      {fechaHora(c.detectado_at)}
                      {c.revisado_at ? (
                        <span className="block text-gray-400">
                          Revisado {fechaHora(c.revisado_at)}
                          {c.revisado_por ? ` · ${c.revisado_por}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right">
                      {esAdmin && !c.revisado_at && (
                        <button
                          type="button"
                          disabled={pendiente}
                          onClick={() => marcar([c.id])}
                          className="rounded-md border border-[#E2E8F0] bg-white px-2 py-0.5 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        >
                          Revisado
                        </button>
                      )}
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
