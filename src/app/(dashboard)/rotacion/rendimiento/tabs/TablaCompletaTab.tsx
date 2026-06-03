"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { GrupoBadge } from "@/components/rotacion/ui/Badge";

interface Row {
  cedula: string;
  nombre: string;
  grupo: string;
  meses: number;
  timbradas: number;
  diasTrabajados: number;
  promTimDia: number;
  vpTotal: number;
  vpAusencia: number;
  vpAccidente: number;
  accHistorico: boolean;
}

export default function TablaCompletaTab({ data }: { data: Row[] }) {
  const [search, setSearch] = useState("");
  const [filterGrupo, setFilterGrupo] = useState("");
  const [filterVP, setFilterVP] = useState("");
  const [sortKey, setSortKey] = useState("timbradas");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let list = [...data];
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((r) => r.nombre.toUpperCase().includes(q) || r.cedula.includes(q));
    }
    if (filterGrupo) list = list.filter((r) => r.grupo === filterGrupo);
    if (filterVP === "con") list = list.filter((r) => r.vpTotal > 0);
    if (filterVP === "sin") list = list.filter((r) => r.vpTotal === 0);
    list.sort((a, b) => {
      const av = a[sortKey as keyof Row];
      const bv = b[sortKey as keyof Row];
      if (typeof av === "string") return sortAsc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [data, search, filterGrupo, filterVP, sortKey, sortAsc]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const TH = ({ k, children, left }: { k: string; children: React.ReactNode; left?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border cursor-pointer hover:text-text-primary ${left ? "text-left" : "text-right"}`}
    >
      {children} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="bg-surface-raised rounded-2xl border border-border shadow-sm overflow-hidden animate-fade-in">
      {/* Filters */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-border">
        <Search className="w-4 h-4 text-text-muted shrink-0" />
        <input
          type="text"
          placeholder="Buscar conductor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm bg-transparent outline-none flex-1 min-w-[150px] placeholder:text-text-muted"
        />
        <select value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)} className="text-xs bg-slate-50 border border-border rounded-lg px-3 py-1.5 text-text-secondary">
          <option value="">Todos los grupos</option>
          <option value="0-3m">0-3 meses</option>
          <option value="3-6m">3-6 meses</option>
          <option value="6-12m">6-12 meses</option>
          <option value="1+a">+1 ano</option>
        </select>
        <select value={filterVP} onChange={(e) => setFilterVP(e.target.value)} className="text-xs bg-slate-50 border border-border rounded-lg px-3 py-1.5 text-text-secondary">
          <option value="">Todos (VP)</option>
          <option value="con">Con VP</option>
          <option value="sin">Sin VP</option>
        </select>
        <span className="text-xs text-text-muted ml-auto">{filtered.length} conductores</span>
      </div>

      <div className="max-h-[600px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg sticky top-0 z-10">
            <tr>
              <TH k="nombre" left>Conductor</TH>
              <TH k="grupo" left>Grupo</TH>
              <TH k="meses">Meses</TH>
              <TH k="timbradas">Timbradas</TH>
              <TH k="diasTrabajados">Dias</TH>
              <TH k="promTimDia">Prom/Dia</TH>
              <TH k="vpAusencia">VP Aus</TH>
              <TH k="vpAccidente">VP Acc</TH>
              <TH k="vpTotal">VP Total</TH>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.cedula} className="border-b border-border-subtle hover:bg-amber-50/30 transition-colors">
                <td className="px-3 py-2.5 font-medium text-text-primary whitespace-nowrap">{r.nombre}</td>
                <td className="px-3 py-2.5"><GrupoBadge grupo={r.grupo} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.meses}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.timbradas.toLocaleString("es-CO")}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.diasTrabajados}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.promTimDia.toLocaleString("es-CO")}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.vpAusencia || "–"}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${r.vpAccidente > 0 ? "text-negative" : "text-text-muted"}`}>{r.vpAccidente || "–"}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${r.vpTotal > 0 ? "text-negative" : "text-positive"}`}>{r.vpTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
