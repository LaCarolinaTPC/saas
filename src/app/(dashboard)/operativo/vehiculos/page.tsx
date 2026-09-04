import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getTipos, resumenVencimientos } from "@/lib/operativo/data";
import { hoyBogota } from "@/lib/operativo/constants";
import { EncabezadoOperativo, PestanasOperativo } from "../ui";
import { VehiculosClient } from "./vehiculos-client";

export const dynamic = "force-dynamic";

/** Consulta de vehículos: buscador y lista de activos con el estado de cada documento. */
export default async function OperativoVehiculosPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const hoy = hoyBogota();
  const [tipos, resumen] = await Promise.all([getTipos(), resumenVencimientos(hoy)]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · Vehículos">
        <PestanasOperativo activa="vehiculos" />
      </EncabezadoOperativo>
      <VehiculosClient tipos={tipos} vehiculos={resumen.vehiculos} />
    </div>
  );
}
