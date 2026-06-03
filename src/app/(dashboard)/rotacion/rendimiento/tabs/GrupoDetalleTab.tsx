"use client";

import { useState, useMemo } from "react";
import KpiCard from "@/components/rotacion/ui/KpiCard";
import HorizontalBar from "../components/HorizontalBar";
import { Search } from "lucide-react";

const GRUPO_COLORS: Record<string, string> = { "0-3m": "#8b5cf6", "3-6m": "#3b82f6", "6-12m": "#10b981", "1+a": "#d4a843" };

interface ConductorRow {
  cedula: string;
  nombre: string;
  grupo: string;
  meses: number;
  timbradas: number;
  promTimDia: number;
  vpTotal: number;
  vpAusencia: number;
  vpAccidente: number;
  accHistorico: boolean;
}

interface GrupoInfo {
  grupo: string;
  conductores: number;
  timPromedio: number;
  vpTotal: number;
  sinVP: number;
  conAccidente: number;
}

export default function GrupoDetalleTab({
  grupo,
  grupoInfo,
  conductores,
}: {
  grupo: string;
  grupoInfo: GrupoInfo;
  conductores: ConductorRow[];
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("timbradas");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let list = conductores.filter((c) => c.grupo === grupo);
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((c) => c.nombre.toUpperCase().includes(q));
    }
    list.sort((a, b) => {
      const av = a[sortKey as keyof ConductorRow] as number;
      const bv = b[sortKey as keyof ConductorRow] as number;
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [conductores, grupo, search, sortKey, sortAsc]);

  const grupoConducs = conductores.filter((c) => c.grupo === grupo);
  const top10Prod = [...grupoConducs].sort((a, b) => b.timbradas - a.timbradas).slice(0, 10);
  const topVP = grupoConducs.filter((c) => c.vpTotal > 0).sort((a, b) => b.vpTotal - a.vpTotal).slice(0, 10);
  const color = GRUPO_COLORS[grupo] || "#d4a843";

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const TH = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th
      onClick={() => toggleSort(k)}
      className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border cursor-pointer hover:text-text-primary text-right first:text-left"
    >
      {children} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard value={grupoInfo.conductores} label="Conductores" color="info" />
        <KpiCard value={grupoInfo.timPromedio.toLocaleString("es-CO")} label="Tim. Promedio" color="accent" />
        <KpiCard value={grupoInfo.vpTotal} label="VP Total" color="negative" />
        <KpiCard value={grupoInfo.sinVP} label="Sin VP" color="positive" />
        <KpiCard value={grupoInfo.conAccidente} label="Con Accidente" color="negative" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">Top 10 Productividad</h4>
          <HorizontalBar items={top10Prod.map((c) => ({ label: c.nombre, value: c.timbradas, color }))} valueLabel="Timbradas" />
        </div>
        {topVP.length > 0 && (
          <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">Mayor VP</h4>
            <HorizontalBar items={topVP.map((c) => ({ label: c.nombre, value: c.vpTotal, color: "#dc2626" }))} valueLabel="VP" />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface-raised rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-border">
          <Search className="w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar conductor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm bg-transparent outline-none flex-1 placeholder:text-text-muted"
          />
          <span className="text-xs text-text-muted">{filtered.length} conductores</span>
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg sticky top-0 z-10">
              <tr>
                <TH k="nombre">Conductor</TH>
                <TH k="meses">Meses</TH>
                <TH k="timbradas">Timbradas</TH>
                <TH k="promTimDia">Prom/Dia</TH>
                <TH k="vpAusencia">VP Aus</TH>
                <TH k="vpAccidente">VP Acc</TH>
                <TH k="vpTotal">VP Total</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.cedula} className="border-b border-border-subtle hover:bg-amber-50/30 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-text-primary">{c.nombre}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{c.meses}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{c.timbradas.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{c.promTimDia.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{c.vpAusencia || "–"}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${c.vpAccidente > 0 ? "text-negative" : "text-text-muted"}`}>{c.vpAccidente || "–"}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${c.vpTotal > 0 ? "text-negative" : "text-positive"}`}>{c.vpTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
