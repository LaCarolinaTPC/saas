"use client";

import KpiCard from "@/components/rotacion/ui/KpiCard";
import BarChart from "../components/BarChart";
import HorizontalBar from "../components/HorizontalBar";
import { GrupoBadge } from "@/components/rotacion/ui/Badge";

const GRUPO_COLORS: Record<string, string> = { "0-3m": "#8b5cf6", "3-6m": "#3b82f6", "6-12m": "#10b981", "1+a": "#d4a843" };
const GRUPO_LABELS: Record<string, string> = { "0-3m": "0-3m", "3-6m": "3-6m", "6-12m": "6-12m", "1+a": "+1a" };

interface Props {
  accidentalidad: {
    conAccidente: number;
    vpAccidenteTotal: number;
    porGrupo: Array<{ grupo: string; count: number }>;
    topConductores: Array<{ nombre: string; grupo: string; accidentes: number; timbradas: number }>;
  };
}

export default function AccidentalidadTab({ accidentalidad: acc }: Props) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard value={acc.conAccidente} label="Con Accidente" color="negative" />
        <KpiCard value={acc.vpAccidenteTotal} label="VP por Accidente" color="negative" />
        <KpiCard value={acc.porGrupo.find((g) => g.grupo === "1+a")?.count || 0} label="Accidentes en +1a" color="negative" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">Accidentalidad por Grupo</h4>
          <BarChart
            bars={acc.porGrupo.map((g) => ({
              label: GRUPO_LABELS[g.grupo] || g.grupo,
              value: g.count,
              color: GRUPO_COLORS[g.grupo] || "#94a3b8",
            }))}
          />
        </div>
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">Conductores con Mas Accidentes</h4>
          <HorizontalBar
            items={acc.topConductores.map((c) => ({ label: c.nombre, value: c.accidentes, color: "#dc2626" }))}
            maxItems={10}
            valueLabel="Accidentes"
          />
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-surface-raised rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h4 className="text-sm font-semibold text-text-primary">Detalle Conductores con Accidente</h4>
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border">Conductor</th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border">Grupo</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border">Accidentes</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border">Timbradas</th>
              </tr>
            </thead>
            <tbody>
              {acc.topConductores.map((c, i) => (
                <tr key={i} className="border-b border-border-subtle hover:bg-red-50/30 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-text-primary">{c.nombre}</td>
                  <td className="px-3 py-2.5"><GrupoBadge grupo={c.grupo} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-negative">{c.accidentes}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{c.timbradas.toLocaleString("es-CO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
