import { ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { cargarConceptosActivos, cargarReportes, cargarVehiculosActivos } from "@/lib/mantenimiento/danos";
import { hoyBogota } from "@/lib/mantenimiento/frenos";
import { ReportesDanosClient } from "./reportes-client";

export const dynamic = "force-dynamic";

export default async function ReportesDanosPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const [reportesResult, vehiculosResult, conceptosResult] = await Promise.all([
    cargarReportes(),
    cargarVehiculosActivos(),
    cargarConceptosActivos(),
  ]);
  const errores = [reportesResult, vehiculosResult, conceptosResult]
    .flatMap((r) => (r.error ? [r.error.message] : []));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Reportes de daños</h1>
        </div>
      </div>
      <ReportesDanosClient
        reportes={reportesResult.data ?? []}
        vehiculos={vehiculosResult.data ?? []}
        conceptos={conceptosResult.data ?? []}
        hoy={hoyBogota()}
        erroresCarga={errores}
      />
    </div>
  );
}
