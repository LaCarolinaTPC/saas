"use client";

import { Fragment, useMemo, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
import type { FilaAnalisis } from "@/lib/devengados/data";
import type { quincenaDe } from "@/lib/devengados/engine";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

type Quincena = ReturnType<typeof quincenaDe>;

function estadoFila(f: FilaAnalisis): { label: string; bg: string; color: string } {
  if (f.resumen.saldoAcumulado < 0)
    return { label: "En déficit", bg: "#FEE2E2", color: "#EF4444" };
  if (f.resumen.enAlerta)
    return { label: "Retenidos", bg: "#FEF3C7", color: "#D97706" };
  if (f.resumen.disponible > 0)
    return { label: "Disponible", bg: "#D1FAE5", color: "#059669" };
  return { label: "Al día", bg: "#F1F5F9", color: "#64748B" };
}

export function AnalisisClient({
  filas,
  baseDiaria,
  quincena,
  fechaCorte,
}: {
  filas: FilaAnalisis[];
  baseDiaria: number;
  quincena: Quincena;
  fechaCorte: string;
}) {
  const [query, setQuery] = useState("");
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filtradas = useMemo(() => {
    const q = query.toLowerCase().trim();
    return filas.filter((f) => {
      const matches =
        !q ||
        f.nombre?.toLowerCase().includes(q) ||
        f.cedula.includes(q) ||
        f.codigo?.toLowerCase().includes(q);
      return matches && (!soloAlertas || f.resumen.enAlerta || f.resumen.saldoAcumulado < 0);
    });
  }, [filas, query, soloAlertas]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginadas = filtradas.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totales = useMemo(
    () =>
      filas.reduce(
        (t, f) => ({
          produccion: t.produccion + f.resumen.produccionAcum,
          base: t.base + f.resumen.baseAcum,
          entregado: t.entregado + f.resumen.entregado,
          disponible: t.disponible + f.resumen.disponible,
          alertas: t.alertas + (f.resumen.enAlerta || f.resumen.saldoAcumulado < 0 ? 1 : 0),
        }),
        { produccion: 0, base: 0, entregado: 0, disponible: 0, alertas: 0 }
      ),
    [filas]
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Devengados · Análisis quincenal</h1>
            <span className="inline-flex items-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
              {quincena.periodo} · Q{quincena.quincena} · corte {fechaCorte}
            </span>
            <span className="text-xs text-gray-500">Base diaria: {cop.format(baseDiaria)}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={soloAlertas}
                onChange={(e) => {
                  setSoloAlertas(e.target.checked);
                  setPage(1);
                }}
              />
              Solo alertas ({totales.alertas})
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar conductor..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="w-64 rounded-lg border border-[#E2E8F0] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4F46E5]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Producción acumulada", value: cop.format(totales.produccion) },
            { label: "Base exigida acumulada", value: cop.format(totales.base) },
            { label: "Entregado en la quincena", value: cop.format(totales.entregado) },
            { label: "Excedente disponible", value: cop.format(totales.disponible) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Conductor</th>
                  <th className="px-4 py-2 text-right">Días</th>
                  <th className="px-4 py-2 text-right">Producción</th>
                  <th className="px-4 py-2 text-right">Base exigida</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                  <th className="px-4 py-2 text-right">Entregado</th>
                  <th className="px-4 py-2 text-right">Disponible</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginadas.map((f) => {
                  const est = estadoFila(f);
                  const abiertaEsta = abierta === f.cedula;
                  return (
                    <Fragment key={f.cedula}>
                      <tr
                        onClick={() => setAbierta(abiertaEsta ? null : f.cedula)}
                        className="cursor-pointer border-b border-[#F1F5F9] hover:bg-[#F8FAFC]"
                      >
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900">{f.nombre ?? "—"}</p>
                          <p className="text-xs text-gray-500">
                            CC {f.cedula} {f.codigo ? `· Cód. ${f.codigo}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-right">{f.resumen.diasConProduccion}</td>
                        <td className="px-4 py-2 text-right">{cop.format(f.resumen.produccionAcum)}</td>
                        <td className="px-4 py-2 text-right">{cop.format(f.resumen.baseAcum)}</td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${
                            f.resumen.saldoAcumulado < 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {cop.format(f.resumen.saldoAcumulado)}
                        </td>
                        <td className="px-4 py-2 text-right">{cop.format(f.resumen.entregado)}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {cop.format(f.resumen.disponible)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: est.bg, color: est.color }}
                          >
                            {(f.resumen.enAlerta || f.resumen.saldoAcumulado < 0) && (
                              <TriangleAlert className="h-3 w-3" />
                            )}
                            {est.label}
                          </span>
                        </td>
                      </tr>
                      {abiertaEsta && (
                        <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                          <td colSpan={8} className="px-6 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left uppercase tracking-wide text-gray-400">
                                  <th className="py-1">Fecha</th>
                                  <th className="py-1 text-right">Producción</th>
                                  <th className="py-1 text-right">Base</th>
                                  <th className="py-1 text-right">Excedente día</th>
                                  <th className="py-1 text-right">Saldo acumulado</th>
                                  <th className="py-1">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {f.resumen.dias.map((d) => (
                                  <tr key={d.fecha} className="border-t border-[#E2E8F0]">
                                    <td className="py-1">{d.fecha}</td>
                                    <td className="py-1 text-right">{cop.format(d.produccion)}</td>
                                    <td className="py-1 text-right">{cop.format(d.baseExigida)}</td>
                                    <td className="py-1 text-right">{cop.format(d.excedenteDia)}</td>
                                    <td
                                      className={`py-1 text-right ${
                                        d.saldoAcumulado < 0 ? "text-red-600" : "text-emerald-600"
                                      }`}
                                    >
                                      {cop.format(d.saldoAcumulado)}
                                    </td>
                                    <td className="py-1 capitalize">{d.estado.replace("_", " ")}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                      Sin conductores con viajes en la quincena (GEMA puede reportar con atraso).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F1F5F9] px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <span>
                Mostrando {filtradas.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                –{Math.min(currentPage * pageSize, filtradas.length)} de {filtradas.length}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm outline-none focus:border-[#4F46E5]"
              >
                {[20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 font-medium text-gray-700 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-gray-500">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 font-medium text-gray-700 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
