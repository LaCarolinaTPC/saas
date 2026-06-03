import KpiCard from "@/components/rotacion/ui/KpiCard";
import { formatNumber } from "@/lib/rotacion/utils/format";

interface KpisData {
  dias_trabajados: number;
  total_timbradas: number;
  total_vp: number;
  accidentes: number;
  incapacidades: number;
}

export default function KpiCards({ kpis }: { kpis: KpisData }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4 animate-stagger">
      <KpiCard
        value={kpis.dias_trabajados}
        label="Dias Trabajados"
        color="info"
      />
      <KpiCard
        value={formatNumber(kpis.total_timbradas)}
        label="Timbradas"
        color="positive"
      />
      <KpiCard
        value={kpis.total_vp}
        label="Vueltas Perdidas"
        color={kpis.total_vp > 0 ? "negative" : "positive"}
      />
      <KpiCard
        value={kpis.accidentes}
        label="Accidentes"
        color={kpis.accidentes > 0 ? "negative" : "positive"}
      />
      <KpiCard
        value={kpis.incapacidades}
        label="Incapacidades"
        color={kpis.incapacidades > 0 ? "negative" : "positive"}
      />
    </div>
  );
}
