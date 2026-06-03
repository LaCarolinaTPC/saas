"use client";

import KpiCard from "@/components/rotacion/ui/KpiCard";
import DonutChart from "../components/DonutChart";
import BarChart from "../components/BarChart";

const GRUPO_LABELS: Record<string, string> = { "0-3m": "0-3m", "3-6m": "3-6m", "6-12m": "6-12m", "1+a": "+1a" };
const GRUPO_COLORS: Record<string, string> = { "0-3m": "#8b5cf6", "3-6m": "#3b82f6", "6-12m": "#10b981", "1+a": "#d4a843" };

interface Props {
  resumen: {
    conductoresActivos: number;
    vpTotales: number;
    vpAusencia: number;
    vpAccidente: number;
    sinVP: number;
    conAccidente: number;
    promTimbradas: number;
  };
  grupos: Array<{
    grupo: string;
    conductores: number;
    timPromedio: number;
    vpTotal: number;
    vpPromedio: number;
    conAccidente: number;
    sinVP: number;
  }>;
  distribucionTim: Array<{ label: string; count: number }>;
  onGrupoClick: (grupo: string) => void;
}

export default function ResumenTab({ resumen, grupos, distribucionTim, onGrupoClick }: Props) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-stagger">
        <KpiCard value={resumen.conductoresActivos} label="Conductores" color="info" />
        <KpiCard value={resumen.vpTotales} label="VP Totales" color="negative" />
        <KpiCard value={resumen.sinVP} label="Sin VP" color="positive" />
        <KpiCard value={resumen.conAccidente} label="Con Accidente" color="negative" />
        <KpiCard value={resumen.promTimbradas.toLocaleString("es-CO")} label="Prom Tim/Conductor" color="accent" />
        <KpiCard value={resumen.vpAusencia + resumen.vpAccidente} label="VP Imputables" color="negative" />
      </div>

      {/* Grupo cards */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Distribucion por Antiguedad</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {grupos.map((g) => (
            <button
              key={g.grupo}
              onClick={() => onGrupoClick(g.grupo)}
              className="bg-surface-raised rounded-2xl border border-border shadow-sm p-5 text-left hover:shadow-md hover:border-amber-200 transition-all cursor-pointer"
              style={{ borderTop: `3px solid ${GRUPO_COLORS[g.grupo]}` }}
            >
              <div className="text-sm font-bold text-text-primary mb-3">
                {GRUPO_LABELS[g.grupo]}
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-text-tertiary">Conductores</span><span className="font-semibold">{g.conductores}</span></div>
                <div className="flex justify-between"><span className="text-text-tertiary">Tim. Promedio</span><span className="font-semibold">{g.timPromedio.toLocaleString("es-CO")}</span></div>
                <div className="flex justify-between"><span className="text-text-tertiary">VP Total</span><span className="font-semibold text-negative">{g.vpTotal}</span></div>
                <div className="flex justify-between"><span className="text-text-tertiary">VP Promedio</span><span className="font-semibold">{g.vpPromedio}</span></div>
                <div className="flex justify-between"><span className="text-text-tertiary">Con Accidente</span><span className="font-semibold text-negative">{g.conAccidente}</span></div>
                <div className="flex justify-between"><span className="text-text-tertiary">Sin VP</span><span className="font-semibold text-positive">{g.sinVP}</span></div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">VP por Tipo</h4>
          <DonutChart
            segments={[
              { label: "Ausencia", value: resumen.vpAusencia, color: "#d4a843" },
              { label: "Accidente", value: resumen.vpAccidente, color: "#dc2626" },
            ]}
          />
        </div>
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">Timbradas por Grupo</h4>
          <BarChart
            bars={grupos.map((g) => ({
              label: GRUPO_LABELS[g.grupo],
              value: g.timPromedio,
              color: GRUPO_COLORS[g.grupo],
            }))}
          />
        </div>
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">Distribucion Timbradas</h4>
          <BarChart
            bars={distribucionTim.map((d) => ({
              label: d.label,
              value: d.count,
              color: "#3b82f6",
            }))}
          />
        </div>
        <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4">VP por Grupo</h4>
          <BarChart
            bars={grupos.map((g) => ({
              label: GRUPO_LABELS[g.grupo],
              value: g.vpTotal,
              color: GRUPO_COLORS[g.grupo],
            }))}
          />
        </div>
      </div>
    </div>
  );
}
