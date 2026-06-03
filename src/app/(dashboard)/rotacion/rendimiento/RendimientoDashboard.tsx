"use client";

import { useState } from "react";
import TabNav from "./components/TabNav";
import PeriodFilter from "./components/PeriodFilter";
import ResumenTab from "./tabs/ResumenTab";
import GrupoDetalleTab from "./tabs/GrupoDetalleTab";
import AccidentalidadTab from "./tabs/AccidentalidadTab";
import TablaCompletaTab from "./tabs/TablaCompletaTab";
import QuincenasTab from "./tabs/QuincenasTab";
import EvolucionTab from "./tabs/EvolucionTab";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "0-3m", label: "0-3m" },
  { id: "3-6m", label: "3-6m" },
  { id: "6-12m", label: "6-12m" },
  { id: "1+a", label: "+1 ano" },
  { id: "accidentalidad", label: "Accidentalidad" },
  { id: "tabla", label: "Tabla Completa" },
  { id: "quincenas", label: "Quincenas" },
  { id: "evolucion", label: "Evolucion" },
];

interface RendimientoData {
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
  quincenaStats: Array<{ key: string; timbradas: number; vp: number; dias: number; conductores: number }>;
  quincenaKeys: string[];
  quincenaTabla: Array<{
    cedula: string;
    nombre: string;
    grupo: string;
    quincenas: Record<string, { timbradas: number; vp: number; dias: number }>;
  }>;
  evolucion: {
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
  } | null;
  accidentalidad: {
    conAccidente: number;
    vpAccidenteTotal: number;
    porGrupo: Array<{ grupo: string; count: number }>;
    topConductores: Array<{ nombre: string; grupo: string; accidentes: number; timbradas: number }>;
  };
  periodoLabel: string;
  tablaCompleta: Array<{
    cedula: string;
    nombre: string;
    grupo: string;
    meses: number;
    tipo: string | null;
    timbradas: number;
    diasTrabajados: number;
    promTimDia: number;
    vpTotal: number;
    vpAusencia: number;
    vpAccidente: number;
    accHistorico: boolean;
  }>;
}

interface Props {
  data: RendimientoData;
  fechaDesde?: string;
  fechaHasta?: string;
}

export default function RendimientoDashboard({ data, fechaDesde, fechaHasta }: Props) {
  const [activeTab, setActiveTab] = useState("resumen");

  const grupoIds = ["0-3m", "3-6m", "6-12m", "1+a"];
  const isGrupo = grupoIds.includes(activeTab);

  function handleGrupoClick(grupo: string) {
    setActiveTab(grupo);
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Dashboard de Rendimiento
        </h1>
        {data.periodoLabel && (
          <p className="text-sm text-text-tertiary mt-1">
            {data.periodoLabel}
          </p>
        )}
      </div>

      <PeriodFilter
        quincenaKeys={data.quincenaKeys}
        fechaDesde={fechaDesde}
        fechaHasta={fechaHasta}
      />

      <div className="mb-6">
        <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "resumen" && (
        <ResumenTab
          resumen={data.resumen}
          grupos={data.grupos}
          distribucionTim={data.distribucionTim}
          onGrupoClick={handleGrupoClick}
        />
      )}

      {isGrupo && (
        <GrupoDetalleTab
          grupo={activeTab}
          grupoInfo={data.grupos.find((g) => g.grupo === activeTab) || data.grupos[0]}
          conductores={data.tablaCompleta}
        />
      )}

      {activeTab === "accidentalidad" && (
        <AccidentalidadTab accidentalidad={data.accidentalidad} />
      )}

      {activeTab === "tabla" && <TablaCompletaTab data={data.tablaCompleta} />}

      {activeTab === "quincenas" && (
        <QuincenasTab
          stats={data.quincenaStats}
          keys={data.quincenaKeys}
          tabla={data.quincenaTabla}
        />
      )}

      {activeTab === "evolucion" && <EvolucionTab data={data.evolucion} />}
    </div>
  );
}
