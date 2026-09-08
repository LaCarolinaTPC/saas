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
import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader titulo="Reportes de frenos" icono={FileText} />
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
