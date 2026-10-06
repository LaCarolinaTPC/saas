import ReportWizard from "@/components/accidentabilidad/ReportWizard";
import { PageHeader } from "@/components/layout/page-header";
import { getCatalogosAccidente } from "@/lib/accidentabilidad/datos";

export const dynamic = "force-dynamic";

export default async function ReportarAccidentePage() {
  const catalogos = await getCatalogosAccidente();
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Reportar accidente"
        descripcion="Registro de accidente de tránsito de un conductor."
      />
      <div className="px-6 py-8">
        <ReportWizard catalogos={catalogos} />
      </div>
    </div>
  );
}
