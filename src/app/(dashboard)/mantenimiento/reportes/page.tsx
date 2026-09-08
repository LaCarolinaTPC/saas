import { ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { cargarConceptosActivos, cargarReportes, cargarVehiculosActivos } from "@/lib/mantenimiento/danos";
import { hoyBogota } from "@/lib/mantenimiento/frenos";
import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader titulo="Reportes de daños" icono={ClipboardList} />
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
