import { notFound } from "next/navigation";
import { getConductorProfile } from "@/lib/rotacion/data/conductor";
import ProfileHeader from "./ProfileHeader";
import KpiCards from "./KpiCards";
import AnalisisQuincenas from "./AnalisisQuincenas";
import RendimientoTable from "./RendimientoTable";
import ViajesPerdidosSection from "./ViajesPerdidosSection";
import AccidentesSection from "./AccidentesSection";
import PersonalInfo from "./PersonalInfo";
import AusentismoSection from "./AusentismoSection";
import FamiliaSection from "./FamiliaSection";
import IncentivosSection from "./IncentivosSection";

export default async function ConductorPage({
  params,
}: {
  params: Promise<{ cedula: string }>;
}) {
  const { cedula } = await params;
  const profile = await getConductorProfile(cedula);

  if (!profile) {
    notFound();
  }

  const { conductor, cierres, viajes_perdidos, ausentismo, familia, incentivos, kpis } = profile;

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <ProfileHeader conductor={conductor} />
      <KpiCards kpis={kpis} />

      <div className="mt-6 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">
        <div className="space-y-4">
          <AnalisisQuincenas cierres={cierres} viajes={viajes_perdidos} />
          <RendimientoTable cierres={cierres} />
          <ViajesPerdidosSection viajes={viajes_perdidos} />
          <AccidentesSection viajes={viajes_perdidos} />
        </div>

        <div className="space-y-4 mt-4 lg:mt-0 lg:sticky lg:top-6">
          <PersonalInfo conductor={conductor} />
          <AusentismoSection ausentismo={ausentismo} />
          <FamiliaSection familia={familia} />
          <IncentivosSection incentivos={incentivos} />
        </div>
      </div>
    </div>
  );
}
