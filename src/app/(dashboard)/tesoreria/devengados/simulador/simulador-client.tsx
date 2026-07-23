"use client";

import { useMemo, useState } from "react";
import { Calculator, Printer, TriangleAlert } from "lucide-react";
import { calcularQuincena } from "@/lib/devengados/engine";
import type { RendimientoGrupo } from "@/lib/devengados/rendimiento";
import { RendimientoTab } from "./rendimiento-client";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const ESTADO_LABEL: Record<string, string> = {
  cumple: "Cumple",
  deficit: "Déficit",
  retenido: "Retenido",
  sin_produccion: "Sin producción",
};

/**
 * Simulador para socialización: "si produces X, ¿cuánto te toca?".
 * Corre calcularQuincena (el mismo motor de la caja) en el navegador con
 * cifras hipotéticas — el número simulado coincide con el que pagaría la
 * caja porque es la misma función. No toca datos reales.
 */
export function SimuladorClient({
  baseVigente,
  rendimiento,
  fecha,
  hoy,
}: {
  baseVigente: number;
  rendimiento: RendimientoGrupo[];
  fecha: string;
  hoy: string;
}) {
  const [tab, setTab] = useState<"rendimiento" | "hipotetico">("rendimiento");
  const [modo, setModo] = useState<"promedio" | "dias">("promedio");
  const [base, setBase] = useState(baseVigente);
  const [numDias, setNumDias] = useState(15);
  const [promedio, setPromedio] = useState(120000);
  const [diasTrabajados, setDiasTrabajados] = useState(13);
  const [producciones, setProducciones] = useState<number[]>(
    Array.from({ length: 16 }, () => 0)
  );
  const [nombre, setNombre] = useState("");
  const [impresoEn, setImpresoEn] = useState("");

  // Fechas sintéticas "01".."16": el motor solo las usa para ordenar.
  const resumen = useMemo(() => {
    const dias =
      modo === "promedio"
        ? Array.from({ length: Math.min(diasTrabajados, numDias) }, (_, i) => ({
            fecha: String(i + 1).padStart(2, "0"),
            produccion: promedio,
          }))
        : producciones.slice(0, numDias).map((p, i) => ({
            fecha: String(i + 1).padStart(2, "0"),
            produccion: p,
          }));
    return calcularQuincena(dias, base, 0);
  }, [modo, promedio, diasTrabajados, numDias, producciones, base]);

  function setProduccion(i: number, v: string) {
    const n = Number(v.replace(/\D/g, ""));
    setProducciones((prev) => prev.map((p, idx) => (idx === i ? n : p)));
  }

  function imprimir() {
    setImpresoEn(
      new Date().toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        dateStyle: "short",
        timeStyle: "short",
      })
    );
    setTimeout(() => window.print(), 50);
  }

  const inputMoneda =
    "w-36 rounded-lg border border-[#E2E8F0] px-3 py-2 text-right text-sm outline-none focus:border-[#4F46E5]";

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <style>{`
        @page { margin: 10mm; }
        @media print {
          body * { visibility: hidden; }
          #sim-print, #sim-print * { visibility: visible; }
          #sim-print { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
        }
      `}</style>

      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calculator className="h-5 w-5 text-[#4F46E5]" />
            <h1 className="text-xl font-semibold text-gray-900">Devengados · Simulador</h1>
            <span className="inline-flex items-center rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-semibold text-[#B45309]">
              SIMULACIÓN
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
              {(
                [
                  { v: "rendimiento", l: "Rendimiento del día" },
                  { v: "hipotetico", l: "Quincena hipotética" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setTab(o.v)}
                  className={`px-3 py-2 text-sm font-medium ${
                    tab === o.v ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {tab === "hipotetico" && (
              <button
                onClick={imprimir}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]"
              >
                <Printer className="h-4 w-4" /> Imprimir simulación
              </button>
            )}
          </div>
        </div>
      </div>

      {tab === "rendimiento" && (
        <div className="mx-auto max-w-6xl p-4 sm:p-6 print:hidden">
          <RendimientoTab grupos={rendimiento} fecha={fecha} hoy={hoy} baseVigente={baseVigente} />
        </div>
      )}

      <div className={`mx-auto max-w-5xl space-y-4 p-6 print:hidden ${tab === "hipotetico" ? "" : "hidden"}`}>
        {/* Parámetros */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
          <div className="flex flex-wrap items-end gap-6">
            <label className="flex flex-col gap-1 text-sm text-gray-600">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Modo</span>
              <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
                {(
                  [
                    { v: "promedio", l: "Promedio diario" },
                    { v: "dias", l: "Día a día" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setModo(o.v)}
                    className={`px-3 py-2 text-sm font-medium ${
                      modo === o.v ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-600">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Base diaria
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={base.toLocaleString("es-CO")}
                onChange={(e) => setBase(Number(e.target.value.replace(/\D/g, "")))}
                className={inputMoneda}
              />
              {base !== baseVigente && (
                <span className="text-[11px] text-[#B45309]">
                  La vigente es {cop.format(baseVigente)} (escenario hipotético)
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-600">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Días de la quincena
              </span>
              <select
                value={numDias}
                onChange={(e) => setNumDias(Number(e.target.value))}
                className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
              >
                {[13, 14, 15, 16].map((n) => (
                  <option key={n} value={n}>{n} días</option>
                ))}
              </select>
            </label>
            {modo === "promedio" && (
              <>
                <label className="flex flex-col gap-1 text-sm text-gray-600">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Producción promedio por día
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={promedio.toLocaleString("es-CO")}
                    onChange={(e) => setPromedio(Number(e.target.value.replace(/\D/g, "")))}
                    className={inputMoneda}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-600">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Días trabajados
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={numDias}
                    value={diasTrabajados}
                    onChange={(e) =>
                      setDiasTrabajados(Math.max(0, Math.min(numDias, Number(e.target.value))))
                    }
                    className="w-20 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                  />
                </label>
              </>
            )}
            <label className="flex flex-col gap-1 text-sm text-gray-600">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Conductor (opcional, para el impreso)
              </span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre del conductor"
                className="w-56 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            La base solo se exige los días con producción: un día sin trabajar no suma base ni
            genera déficit. Un día con producción por debajo de la base descuenta del excedente
            acumulado (regla de oro de la quincena).
          </p>
        </div>

        {/* Grilla día a día */}
        {modo === "dias" && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              Producción por día (deja en 0 los días sin trabajar)
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {Array.from({ length: numDias }, (_, i) => (
                <label key={i} className="flex flex-col gap-1 text-xs text-gray-500">
                  Día {i + 1}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={producciones[i] ? producciones[i].toLocaleString("es-CO") : ""}
                    placeholder="0"
                    onChange={(e) => setProduccion(i, e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-right text-sm outline-none focus:border-[#4F46E5]"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Resultado */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Producción de la quincena", value: cop.format(resumen.produccionAcum) },
            {
              label: `Base exigida (${resumen.diasConProduccion} días × ${cop.format(base)})`,
              value: cop.format(resumen.baseAcum),
            },
            {
              label: "Saldo acumulado",
              value: cop.format(resumen.saldoAcumulado),
              rojo: resumen.saldoAcumulado < 0,
            },
            {
              label: "Excedente a favor",
              value: cop.format(resumen.excedenteAcum),
              destacado: true,
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border p-4 ${
                s.destacado
                  ? "border-[#4F46E5] bg-[#EEF2FF]"
                  : "border-[#E2E8F0] bg-white"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  s.rojo ? "text-red-600" : s.destacado ? "text-[#4F46E5]" : "text-gray-900"
                }`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
        {resumen.saldoAcumulado < 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            Con esta producción la quincena queda en déficit: no se libera excedente hasta que la
            producción acumulada supere la base acumulada.
          </p>
        )}

        {/* Detalle */}
        {resumen.dias.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2">Día</th>
                    <th className="px-4 py-2 text-right">Producción</th>
                    <th className="px-4 py-2 text-right">Base</th>
                    <th className="px-4 py-2 text-right">Excedente día</th>
                    <th className="px-4 py-2 text-right">Liberado acumulado</th>
                    <th className="px-4 py-2 text-right">Entregar ese día</th>
                    <th className="px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.dias.map((d, i) => (
                    <tr key={d.fecha} className="border-b border-[#F1F5F9]">
                      <td className="px-4 py-2">Día {i + 1}</td>
                      <td className="px-4 py-2 text-right">{cop.format(d.produccion)}</td>
                      <td className="px-4 py-2 text-right">{cop.format(d.baseExigida)}</td>
                      <td className="px-4 py-2 text-right">{cop.format(d.excedenteDia)}</td>
                      <td className="px-4 py-2 text-right font-medium">{cop.format(d.liberadoAcum)}</td>
                      <td className="px-4 py-2 text-right">{cop.format(d.entregarHoy)}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{ESTADO_LABEL[d.estado]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Impreso: simulación para dejarle al conductor */}
      <div id="sim-print" className="hidden bg-white p-8 text-[11px] leading-snug text-gray-900">
        <div className="mb-2 flex items-end justify-between border-b-2 border-gray-800 pb-1">
          <span className="text-sm font-bold">GESTIVO · Tesorería — Simulación de otros devengados</span>
          <span className="text-[9px] text-gray-500">Impreso: {impresoEn}</span>
        </div>
        <p className="mb-1 text-[13px] font-bold tracking-wide text-[#B45309]">
          SIMULACIÓN — NO ES UN VALOR EXIGIBLE
        </p>
        <p className="mb-3 text-[10px] text-gray-600">
          {nombre ? `Conductor: ${nombre} · ` : ""}
          Cifras hipotéticas con base diaria de {cop.format(base)}. El valor real depende de la
          producción efectiva registrada en cada quincena.
        </p>
        <table className="mb-3 w-full border-collapse">
          <tbody>
            {[
              ["Producción simulada de la quincena", cop.format(resumen.produccionAcum)],
              [`Base exigida (${resumen.diasConProduccion} días con producción)`, cop.format(resumen.baseAcum)],
              ["Excedente a favor (simulado)", cop.format(resumen.excedenteAcum)],
            ].map(([l, v]) => (
              <tr key={l}>
                <td className="border border-gray-300 px-2 py-1">{l}</td>
                <td className="border border-gray-300 px-2 py-1 text-right font-semibold">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {resumen.dias.length > 0 && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Día", "Producción", "Base", "Excedente día", "Liberado acum.", "Entregar ese día"].map((h) => (
                  <th key={h} className="border border-gray-300 px-1.5 py-0.5 text-left text-[9px] uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumen.dias.map((d, i) => (
                <tr key={d.fecha}>
                  <td className="border border-gray-300 px-1.5 py-0.5">Día {i + 1}</td>
                  <td className="border border-gray-300 px-1.5 py-0.5 text-right">{cop.format(d.produccion)}</td>
                  <td className="border border-gray-300 px-1.5 py-0.5 text-right">{cop.format(d.baseExigida)}</td>
                  <td className="border border-gray-300 px-1.5 py-0.5 text-right">{cop.format(d.excedenteDia)}</td>
                  <td className="border border-gray-300 px-1.5 py-0.5 text-right">{cop.format(d.liberadoAcum)}</td>
                  <td className="border border-gray-300 px-1.5 py-0.5 text-right">{cop.format(d.entregarHoy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
