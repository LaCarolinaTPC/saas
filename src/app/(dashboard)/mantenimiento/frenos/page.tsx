import { Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { cargarUltimosRegistros, cargarVehiculosActivos, hoyBogota } from "@/lib/mantenimiento/frenos";
import { PageHeader } from "@/components/layout/page-header";
import { FrenosClient } from "./frenos-client";

export const dynamic = "force-dynamic";

export default async function FrenosPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const [vehiculosResult, ultimosResult] = await Promise.all([
    cargarVehiculosActivos(),
    cargarUltimosRegistros(),
  ]);
  const errores = [vehiculosResult, ultimosResult]
    .flatMap((r) => (r.error ? [r.error.message] : []));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Graduación de frenos" icono={Wrench} />
      <FrenosClient
        vehiculos={vehiculosResult.data ?? []}
        ultimos={ultimosResult.data ?? []}
        hoy={hoyBogota()}
        erroresCarga={errores}
        puedeEditar={perms.puedeEditar}
      />
    </div>
  );
}
