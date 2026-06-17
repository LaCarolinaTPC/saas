"use client";

import { useMemo, useState } from "react";
import {
  MessageCircle,
  FileText,
  UserCheck,
  DollarSign,
  Megaphone,
  TrendingDown,
} from "lucide-react";
import {
  type DailyMetric,
  type Semaforo,
  computeTotals,
  computeSourceStats,
  computeKpis,
  semaforoDia,
  byDate,
} from "@/lib/recruitment/funnel";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("es-CO");

const SEMAFORO_STYLE: Record<Semaforo, { bg: string; color: string; label: string }> = {
  verde: { bg: "#DCFCE7", color: "#166534", label: "Verde" },
  amarillo: { bg: "#FEF3C7", color: "#92400E", label: "Amarillo" },
  rojo: { bg: "#FEE2E2", color: "#991B1B", label: "Rojo" },
};

function pctStr(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function CampanasClient({
  metrics,
  gastoMeta,
}: {
  metrics: DailyMetric[];
  gastoMeta: number;
}) {
  const meses = useMemo(
    () => Array.from(new Set(metrics.map((m) => m.fecha.slice(0, 7)))).sort(),
    [metrics]
  );
  const canales = useMemo(
    () => Array.from(new Set(metrics.map((m) => m.canal))).sort(),
    [metrics]
  );

  const [mes, setMes] = useState("Todos");
  const [canal, setCanal] = useState("Todos");

  // Mes filtra todo; canal solo el diario/tabla/gráfico (como el dashboard).
  const mesFiltered = useMemo(
    () => (mes === "Todos" ? metrics : metrics.filter((m) => m.fecha.slice(0, 7) === mes)),
    [metrics, mes]
  );
  const diary = useMemo(
    () => (canal === "Todos" ? mesFiltered : mesFiltered.filter((m) => m.canal === canal)),
    [mesFiltered, canal]
  );

  const totals = useMemo(() => computeTotals(mesFiltered, gastoMeta), [mesFiltered, gastoMeta]);
  const sources = useMemo(() => computeSourceStats(mesFiltered), [mesFiltered]);
  const kpis = useMemo(() => computeKpis(totals), [totals]);
  const chart = useMemo(() => byDate(diary), [diary]);
  const maxBar = Math.max(1, ...chart.map((d) => d.postulantes));

  // Diagnóstico: principal motivo de fuga.
  const topFuga = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of mesFiltered) {
      if (r.motivo_fuga) m.set(r.motivo_fuga, (m.get(r.motivo_fuga) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [mesFiltered]);

  const isEmpty = metrics.length === 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Megaphone className="h-5 w-5 text-[#4F46E5]" />
            <h1 className="text-xl font-semibold text-gray-900">
              Campañas · Embudo de reclutamiento
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-[#4F46E5]"
            >
              <option value="Todos">Todos los meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-[#4F46E5]"
            >
              <option value="Todos">Todos los canales</option>
              {canales.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        {isEmpty && (
          <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-8 text-center">
            <Megaphone className="mx-auto h-10 w-10 text-[#CBD5E1]" />
            <h3 className="mt-3 text-base font-semibold text-[#334155]">
              Sin datos de campañas todavía
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-[#64748B]">
              Conecta Meta Ads y la fuente de WhatsApp para alimentar el embudo,
              o carga métricas diarias. La estructura ya está lista.
            </p>
          </div>
        )}

        {/* Embudo: tarjetas resumen */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FunnelCard
            icon={<MessageCircle className="h-5 w-5" />}
            label="Conversaciones"
            value={NUM.format(totals.conversaciones)}
            hint="Contactos iniciales"
          />
          <FunnelCard
            icon={<FileText className="h-5 w-5" />}
            label="CVs registrados"
            value={NUM.format(totals.postulantes)}
            hint={`${pctStr(kpis.convAPostulante)} de conversaciones`}
          />
          <FunnelCard
            icon={<UserCheck className="h-5 w-5" />}
            label="Contrataciones"
            value={NUM.format(totals.contratados)}
            hint={`${NUM.format(totals.contratadosMeta)} vía Meta`}
          />
          <FunnelCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Costo por contratación"
            value={totals.costoPorContratacion != null ? COP.format(totals.costoPorContratacion) : "—"}
            hint="Solo Meta"
            accent
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Conversión por fuente */}
          <div className="lg:col-span-2 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <div className="border-b border-[#F1F5F9] px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Conversión por fuente</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-2.5">Fuente</th>
                  <th className="px-5 py-2.5 text-right">Post.</th>
                  <th className="px-5 py-2.5 text-right">Contr.</th>
                  <th className="px-5 py-2.5 text-right">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {sources.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-gray-400">Sin datos</td></tr>
                ) : sources.map((s) => (
                  <tr key={s.canal} className="hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{s.canal}</td>
                    <td className="px-5 py-3 text-right text-sm text-gray-600">{NUM.format(s.postulantes)}</td>
                    <td className="px-5 py-3 text-right text-sm text-gray-600">{NUM.format(s.contratados)}</td>
                    <td className="px-5 py-3 text-right text-sm font-semibold" style={{ color: s.conversion >= 8 ? "#166534" : s.conversion >= 4 ? "#92400E" : "#991B1B" }}>
                      {pctStr(s.conversion)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* KPIs de eficiencia */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Eficiencia</h2>
            <div className="space-y-4">
              <KpiRow label="Conversaciones → CV" value={pctStr(kpis.convAPostulante)} />
              <KpiRow label="CV → Contratado (Meta)" value={pctStr(kpis.cvAContratado)} />
              <KpiRow label="Conversaciones → Contratado" value={pctStr(kpis.convAContratado)} />
            </div>
          </div>
        </div>

        {/* Gráfico diario */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Diario del embudo</h2>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#7C3AED]" /> Postulantes</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#10B981]" /> Contratados</span>
            </div>
          </div>
          {chart.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Sin datos en el periodo seleccionado</p>
          ) : (
            <div className="flex items-end gap-1 overflow-x-auto pb-2" style={{ height: 180 }}>
              {chart.map((d) => (
                <div key={d.fecha} className="flex min-w-[14px] flex-1 flex-col items-center justify-end gap-0.5" title={`${d.fecha}: ${d.postulantes} post. · ${d.contratados} contr.`}>
                  <div className="flex w-full items-end justify-center gap-px" style={{ height: 150 }}>
                    <div className="w-2/3 rounded-t bg-[#7C3AED]" style={{ height: `${(d.postulantes / maxBar) * 100}%` }} />
                    {d.contratados > 0 && (
                      <div className="w-1/3 rounded-t bg-[#10B981]" style={{ height: `${(d.contratados / maxBar) * 100}%` }} />
                    )}
                  </div>
                  <span className="text-[9px] text-gray-400">{d.fecha.slice(8, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabla métricas diarias */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Métricas diarias</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Canal</th>
                  <th className="px-4 py-2.5 text-right">Post.</th>
                  <th className="px-4 py-2.5 text-right">Pasan</th>
                  <th className="px-4 py-2.5 text-right">Continúan</th>
                  <th className="px-4 py-2.5 text-right">Eval.</th>
                  <th className="px-4 py-2.5 text-right">Aptos</th>
                  <th className="px-4 py-2.5 text-right">Contr.</th>
                  <th className="px-4 py-2.5">Fuga</th>
                  <th className="px-4 py-2.5 text-center">Semáforo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {diary.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-gray-400">Sin registros</td></tr>
                ) : [...diary].reverse().map((r, i) => {
                  const sem = SEMAFORO_STYLE[semaforoDia(r)];
                  return (
                    <tr key={`${r.fecha}-${r.canal}-${i}`} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2.5 text-sm text-gray-700">{r.fecha}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">{r.canal}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{r.postulantes}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{r.pasan}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{r.continuan}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{r.evaluaciones}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{r.aptos}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">{r.contratados}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{r.motivo_fuga ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: sem.bg, color: sem.color }}>
                          {sem.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Diagnóstico de calidad */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-[#EF4444]" />
            <h2 className="text-sm font-semibold text-gray-900">Diagnóstico de calidad — principales fugas</h2>
          </div>
          {topFuga.length === 0 ? (
            <p className="text-sm text-gray-400">Sin motivos de fuga registrados</p>
          ) : (
            <ul className="space-y-2">
              {topFuga.map(([motivo, n]) => (
                <li key={motivo} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{motivo}</span>
                  <span className="font-medium text-gray-500">{n} día(s)</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelCard({
  icon, label, value, hint, accent,
}: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-[#4F46E5]/30 bg-[#4F46E5]/5" : "border-[#E2E8F0] bg-white"}`}>
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function KpiRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-lg font-bold text-[#4F46E5]">{value}</span>
    </div>
  );
}
