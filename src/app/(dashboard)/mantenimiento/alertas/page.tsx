import { AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { cargarAlertas } from "@/lib/mantenimiento/danos";
import { hoyBogota } from "@/lib/mantenimiento/frenos";
import { AlertasClient } from "./alertas-client";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const alertasResult = await cargarAlertas();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h1 className="text-xl font-semibold text-gray-900">Alertas de recurrencia</h1>
        </div>
      </div>
      <AlertasClient
        alertas={alertasResult.data ?? []}
        hoy={hoyBogota()}
        erroresCarga={alertasResult.error ? [alertasResult.error.message] : []}
        puedeEditar={perms.puedeEditar}
      />
    </div>
  );
}
