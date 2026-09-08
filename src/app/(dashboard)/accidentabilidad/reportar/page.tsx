import ReportWizard from "@/components/accidentabilidad/ReportWizard";
import { PageHeader } from "@/components/layout/page-header";

export default function ReportarAccidentePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Reportar accidente"
        descripcion="Registro de accidente de tránsito de un conductor."
      />
      <div className="px-6 py-8">
        <ReportWizard />
      </div>
    </div>
  );
}
