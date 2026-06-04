import ReportWizard from "@/components/accidentabilidad/ReportWizard";

export default function ReportarAccidentePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Reportar accidente</h1>
        <p className="text-sm text-gray-500">Registro de accidente de tránsito de un conductor.</p>
      </div>
      <div className="px-6 py-8">
        <ReportWizard />
      </div>
    </div>
  );
}
