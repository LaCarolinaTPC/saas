import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import {
  cargarHistorial,
  cargarIndicadores,
  cargarResumen,
  cargarVehiculosActivos,
  hoyBogota,
} from "@/lib/mantenimiento/frenos";
import { FrenosReportesClient } from "./reportes-client";

export const dynamic = "force-dynamic";

export default async function FrenosReportesPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const [vehiculosResult, resumenResult, historialResult, indicadores] = await Promise.all([
    cargarVehiculosActivos(),
    cargarResumen(),
    cargarHistorial(),
    cargarIndicadores(),
  ]);
  const errores = [vehiculosResult, resumenResult, historialResult]
    .flatMap((r) => (r.error ? [r.error.message] : []));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Reportes de frenos</h1>
        </div>
      </div>
      <FrenosReportesClient
        vehiculos={vehiculosResult.data ?? []}
        resumen={resumenResult.data ?? []}
        historial={historialResult.data ?? []}
        indicadores={indicadores}
        hoy={hoyBogota()}
        usuario={perms.userEmail ?? null}
        erroresCarga={errores}
      />
    </div>
  );
}
