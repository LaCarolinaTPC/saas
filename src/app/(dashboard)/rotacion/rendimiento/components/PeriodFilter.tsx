"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar, Loader2 } from "lucide-react";

interface Props {
  quincenaKeys: string[];
  fechaDesde?: string;
  fechaHasta?: string;
}

function qKeyToRange(qKey: string): { desde: string; hasta: string } {
  // "2026-03-Q1" -> { desde: "2026-03-01", hasta: "2026-03-15" }
  // "2026-03-Q2" -> { desde: "2026-03-16", hasta: "2026-03-31" }
  const [periodo, q] = qKey.split("-Q");
  const [year, month] = periodo.split("-").map(Number);
  if (q === "1") {
    return {
      desde: `${periodo}-01`,
      hasta: `${periodo}-15`,
    };
  }
  const lastDay = new Date(year, month, 0).getDate();
  return {
    desde: `${periodo}-16`,
    hasta: `${periodo}-${lastDay}`,
  };
}

function qKeyLabel(qKey: string): string {
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [periodo, q] = qKey.split("-Q");
  const month = parseInt(periodo.split("-")[1], 10);
  return `${meses[month - 1]} Q${q}`;
}

export default function PeriodFilter({ quincenaKeys, fechaDesde, fechaHasta }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(false);
  const [desde, setDesde] = useState(fechaDesde || "");
  const [hasta, setHasta] = useState(fechaHasta || "");

  function navigate(params: { desde?: string; hasta?: string }) {
    const sp = new URLSearchParams();
    if (params.desde) sp.set("desde", params.desde);
    if (params.hasta) sp.set("hasta", params.hasta);
    const url = sp.toString() ? `${pathname}?${sp}` : pathname;
    startTransition(() => router.push(url));
  }

  function isActive(d?: string, h?: string) {
    return (fechaDesde || "") === (d || "") && (fechaHasta || "") === (h || "");
  }

  // Build month presets from available quincena keys
  const months = [...new Set(quincenaKeys.map((k) => k.split("-Q")[0]))].sort();

  return (
    <div className="bg-surface-raised rounded-2xl border border-border p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-text-muted" />
        <span className="text-xs font-medium text-text-secondary">Periodo</span>
        {isPending && <Loader2 className="w-3 h-3 animate-spin text-text-muted" />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {/* All data */}
        <button
          onClick={() => navigate({})}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            isActive()
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-text-secondary hover:bg-slate-200"
          }`}
        >
          Todo
        </button>

        {/* Month presets */}
        {months.map((m) => {
          const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
          const [year, month] = m.split("-").map(Number);
          const lastDay = new Date(year, month, 0).getDate();
          const d = `${m}-01`;
          const h = `${m}-${lastDay}`;
          const label = `${meses[month - 1]} ${year}`;
          return (
            <button
              key={m}
              onClick={() => navigate({ desde: d, hasta: h })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isActive(d, h)
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-text-secondary hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          );
        })}

        {/* Quincena presets */}
        {quincenaKeys.map((qk) => {
          const range = qKeyToRange(qk);
          return (
            <button
              key={qk}
              onClick={() => navigate(range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isActive(range.desde, range.hasta)
                  ? "bg-amber-500 text-white"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              {qKeyLabel(qk)}
            </button>
          );
        })}

        {/* Custom range toggle */}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            showCustom
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-text-secondary hover:bg-slate-200"
          }`}
        >
          Personalizado
        </button>
      </div>

      {/* Custom date range */}
      {showCustom && (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white"
          />
          <span className="text-xs text-text-muted">a</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white"
          />
          <button
            onClick={() => navigate({ desde: desde || undefined, hasta: hasta || undefined })}
            disabled={!desde && !hasta}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
