"use client";

import { useState, useMemo } from "react";
import KpiCard from "@/components/rotacion/ui/KpiCard";
import BarChart from "../components/BarChart";
import { Search, ArrowUp, ArrowDown } from "lucide-react";

interface QuincenaStat {
  key: string;
  timbradas: number;
  vp: number;
  dias: number;
  conductores: number;
}

interface QuincenaRow {
  cedula: string;
  nombre: string;
  grupo: string;
  quincenas: Record<string, { timbradas: number; vp: number; dias: number }>;
}

export default function QuincenasTab({
  stats,
  keys,
  tabla,
}: {
  stats: QuincenaStat[];
  keys: string[];
  tabla: QuincenaRow[];
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("vp0");
  const [sortAsc, setSortAsc] = useState(false);

  const q1 = stats[0];
  const q2 = stats[1];
  const mejora = q1 && q2 ? q2.vp - q1.vp : 0;

  const filtered = useMemo(() => {
    let list = [...tabla];
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((r) => r.nombre.toUpperCase().includes(q));
    }
    list.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey.startsWith("vp")) {
        const idx = parseInt(sortKey.slice(2));
        av = a.quincenas[keys[idx]]?.vp || 0;
        bv = b.quincenas[keys[idx]]?.vp || 0;
      } else if (sortKey.startsWith("tim")) {
        const idx = parseInt(sortKey.slice(3));
        av = a.quincenas[keys[idx]]?.timbradas || 0;
        bv = b.quincenas[keys[idx]]?.timbradas || 0;
      } else if (sortKey === "nombre") {
        return sortAsc ? a.nombre.localeCompare(b.nombre) : b.nombre.localeCompare(a.nombre);
      }
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [tabla, search, sortKey, sortAsc, keys]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const months: Record<string, string> = { "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May", "06": "Jun" };
  function qLabel(key: string) {
    const [periodo, q] = key.split("-Q");
    const mm = periodo.split("-")[1];
    return `${months[mm] || mm} Q${q}`;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPIs */}
      {q1 && q2 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard value={q1.timbradas.toLocaleString("es-CO")} label={`Tim ${qLabel(q1.key)}`} color="accent" />
          <KpiCard value={q2.timbradas.toLocaleString("es-CO")} label={`Tim ${qLabel(q2.key)}`} color="info" />
          <KpiCard value={q1.vp} label={`VP ${qLabel(q1.key)}`} color="negative" />
          <KpiCard value={q2.vp} label={`VP ${qLabel(q2.key)}`} color={mejora <= 0 ? "positive" : "negative"} />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">Timbradas por Quincena</h4>
          <BarChart
            bars={stats.map((s) => ({
              label: qLabel(s.key),
              value: s.timbradas,
              color: "#d4a843",
            }))}
          />
        </div>
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">VP Imputables por Quincena</h4>
          <BarChart
            bars={stats.map((s) => ({
              label: qLabel(s.key),
              value: s.vp,
              color: "#dc2626",
            }))}
          />
        </div>
      </div>

      {/* Table */}
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
                <th onClick={() => toggleSort("nombre")} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border cursor-pointer hover:text-text-primary">
                  Conductor {sortKey === "nombre" ? (sortAsc ? "↑" : "↓") : ""}
                </th>
                {keys.map((k, i) => (
                  <th key={k} colSpan={1} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border">
                    {qLabel(k)}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="px-3 py-1 border-b border-border" />
                {keys.map((k, i) => (
                  <th key={k} className="border-b border-border">
                    <div className="flex">
                      <button onClick={() => toggleSort(`vp${i}`)} className="flex-1 text-[10px] text-text-muted hover:text-negative px-1 py-1 cursor-pointer">
                        VP {sortKey === `vp${i}` ? (sortAsc ? "↑" : "↓") : ""}
                      </button>
                      <button onClick={() => toggleSort(`tim${i}`)} className="flex-1 text-[10px] text-text-muted hover:text-info px-1 py-1 cursor-pointer">
                        Tim {sortKey === `tim${i}` ? (sortAsc ? "↑" : "↓") : ""}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.cedula} className="border-b border-border-subtle hover:bg-amber-50/30 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-text-primary whitespace-nowrap">{r.nombre}</td>
                  {keys.map((k) => {
                    const q = r.quincenas[k];
                    return (
                      <td key={k} className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`text-xs tabular-nums font-semibold ${(q?.vp || 0) > 0 ? "text-negative" : "text-text-muted"}`}>
                            {q?.vp || 0}
                          </span>
                          <span className="text-xs tabular-nums text-text-secondary">
                            {(q?.timbradas || 0).toLocaleString("es-CO")}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
