import { Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { cargarUltimosRegistros, cargarVehiculosActivos, hoyBogota } from "@/lib/mantenimiento/frenos";
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
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Wrench className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Graduación de frenos</h1>
        </div>
      </div>
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
