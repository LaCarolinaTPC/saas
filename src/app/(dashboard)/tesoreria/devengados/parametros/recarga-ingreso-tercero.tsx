"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2 } from "lucide-react";
import { recargarIngresoTerceroMes, type RecargaMes } from "@/lib/gema/actions";

const DESDE = "2026-01";

/** Meses AAAA-MM de `desde` a `hasta`, ambos incluidos. */
function meses(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [a, m] = desde.split("-").map(Number);
  const [ah, mh] = hasta.split("-").map(Number);
  while (a < ah || (a === ah && m <= mh)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return out;
}

function mesActual(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }).slice(0, 7);
}

/**
 * Recarga de ingreso tercero mes a mes (solo administrador). Sirve para llenar
 * el pago de obligaciones del histórico, que la corrida diaria no alcanza.
 * Cada mes es una llamada aparte, así que ninguna pasa el tiempo máximo.
 */
export function RecargaIngresoTercero() {
  const router = useRouter();
  const [desde, setDesde] = useState(DESDE);
  const [hasta, setHasta] = useState(mesActual());
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [resultados, setResultados] = useState<RecargaMes[]>([]);

  async function recargar() {
    const lista = meses(desde, hasta);
    setResultados([]);
    for (const mes of lista) {
      setCorriendo(mes);
      let r: RecargaMes;
      try {
        r = await recargarIngresoTerceroMes(mes);
      } catch (e) {
        r = { ok: false, mes, error: e instanceof Error ? e.message : String(e) };
      }
      setResultados((prev) => [...prev, r]);
      if (!r.ok) break;
    }
    setCorriendo(null);
    router.refresh();
  }

  const invalido = !desde || !hasta || desde < DESDE || desde > hasta;

  return (
    <div className="mt-5 border-t border-[#F1F5F9] pt-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Recargar ingreso tercero por meses</h3>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Vuelve a traer de GEMA la liquidación de terceros de cada mes, con el pago de
        obligaciones. La sincronización diaria solo repasa los últimos 45 días; usa esto para
        el histórico. Se puede repetir sin duplicar. Tarda cerca de un minuto por mes.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Desde</label>
          <input
            type="month"
            min={DESDE}
            max={hasta}
            value={desde}
            disabled={!!corriendo}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Hasta</label>
          <input
            type="month"
            min={desde}
            max={mesActual()}
            value={hasta}
            disabled={!!corriendo}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
          />
        </div>
        <button
          onClick={recargar}
          disabled={!!corriendo || invalido}
          className="inline-flex items-center gap-2 rounded-lg border border-[#4F46E5] px-4 py-2 text-sm font-medium text-[#4F46E5] disabled:opacity-40"
        >
          {corriendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
          {corriendo ? `Recargando ${corriendo}...` : "Recargar"}
        </button>
      </div>

      {resultados.length > 0 && (
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="border-b border-[#F1F5F9] text-left uppercase tracking-wide text-gray-500">
              <th className="py-1.5 pr-3">Mes</th>
              <th className="py-1.5 pr-3 text-right">Filas de GEMA</th>
              <th className="py-1.5 pr-3 text-right">Filas en la base</th>
              <th className="py-1.5 pr-3 text-right">Con pago de obligaciones</th>
              <th className="py-1.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((r) => {
              const completo = r.ok && r.enBase === r.conObligaciones;
              return (
                <tr key={r.mes} className="border-b border-[#F1F5F9]">
                  <td className="py-1.5 pr-3 font-medium text-gray-700">{r.mes}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-600">{r.filas?.toLocaleString("es-CO") ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-600">{r.enBase?.toLocaleString("es-CO") ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-600">{r.conObligaciones?.toLocaleString("es-CO") ?? "—"}</td>
                  <td className={`py-1.5 ${!r.ok ? "text-red-600" : completo ? "text-emerald-600" : "text-amber-700"}`}>
                    {!r.ok ? r.error : completo ? "completo" : "faltan filas con el dato"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
