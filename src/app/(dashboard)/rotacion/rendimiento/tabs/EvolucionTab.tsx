"use client";

import { useState, useMemo } from "react";
import KpiCard from "@/components/rotacion/ui/KpiCard";
import HorizontalBar from "../components/HorizontalBar";
import { Search, ArrowUp, ArrowDown } from "lucide-react";

interface EvolucionData {
  q1Key: string;
  q2Key: string;
  mejoraron: number;
  retrocedieron: number;
  sinCambio: number;
  deltaPromedio: number;
  top20: Array<{ nombre: string; delta: number }>;
  tabla: Array<{
    cedula: string;
    nombre: string;
    grupo: string;
    promQ1: number;
    promQ2: number;
    vpQ1: number;
    vpQ2: number;
    delta: number;
  }>;
}

export default function EvolucionTab({ data }: { data: EvolucionData | null }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("delta");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = [...data.tabla];
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((r) => r.nombre.toUpperCase().includes(q));
    }
    list.sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as number;
      const bv = b[sortKey as keyof typeof b] as number;
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [data, search, sortKey, sortAsc]);

  if (!data) return <div className="text-center py-12 text-text-muted text-sm">No hay datos suficientes para comparar</div>;

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard value={data.mejoraron} label="Mejoraron" color="positive" />
        <KpiCard value={data.retrocedieron} label="Retrocedieron" color="negative" />
        <KpiCard value={data.sinCambio} label="Sin Cambio" color="default" />
        <KpiCard value={`${data.deltaPromedio > 0 ? "+" : ""}${data.deltaPromedio}%`} label="Delta Promedio" color={data.deltaPromedio >= 0 ? "positive" : "negative"} />
      </div>

      <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">Top 20 — Mayor mejora en Tim/Dia</h4>
        <HorizontalBar
          items={data.top20.map((t) => ({
            label: t.nombre,
            value: t.delta,
            color: t.delta >= 0 ? "#16a34a" : "#dc2626",
          }))}
          maxItems={20}
          valueLabel="Delta %"
        />
      </div>

      <div className="bg-surface-raised rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-border">
          <Search className="w-4 h-4 text-text-muted" />
          <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="text-sm bg-transparent outline-none flex-1 placeholder:text-text-muted" />
          <span className="text-xs text-text-muted">{filtered.length} conductores</span>
        </div>
        <div className="max-h-[500px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg sticky top-0 z-10">
              <tr>
                {[
                  { k: "nombre", label: "Conductor", left: true },
                  { k: "promQ1", label: "Prom Q1" },
                  { k: "promQ2", label: "Prom Q2" },
                  { k: "delta", label: "Delta %" },
                  { k: "vpQ1", label: "VP Q1" },
                  { k: "vpQ2", label: "VP Q2" },
                ].map((col) => (
                  <th
                    key={col.k}
                    onClick={() => toggleSort(col.k)}
                    className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border cursor-pointer hover:text-text-primary ${col.left ? "text-left" : "text-right"}`}
                  >
                    {col.label} {sortKey === col.k ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.cedula} className="border-b border-border-subtle hover:bg-amber-50/30 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-text-primary whitespace-nowrap">{r.nombre}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.promQ1.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.promQ2.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={`inline-flex items-center gap-0.5 font-semibold ${r.delta >= 0 ? "text-positive" : "text-negative"}`}>
                      {r.delta >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(r.delta)}%
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${r.vpQ1 > 0 ? "text-negative font-medium" : "text-text-muted"}`}>{r.vpQ1 || "–"}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${r.vpQ2 > 0 ? "text-negative font-medium" : "text-text-muted"}`}>{r.vpQ2 || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
