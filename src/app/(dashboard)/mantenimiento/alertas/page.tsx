import { AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { cargarAlertas } from "@/lib/mantenimiento/danos";
import { hoyBogota } from "@/lib/mantenimiento/frenos";
import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader titulo="Alertas de recurrencia" icono={AlertTriangle} claseIcono="text-amber-600" />
      <AlertasClient
        alertas={alertasResult.data ?? []}
        hoy={hoyBogota()}
        erroresCarga={alertasResult.error ? [alertasResult.error.message] : []}
        puedeEditar={perms.puedeEditar}
      />
    </div>
  );
}
