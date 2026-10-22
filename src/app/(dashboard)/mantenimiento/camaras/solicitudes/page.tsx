import { Cctv } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { getSolicitudesTesoreria, type SolicitudTesoreria } from "@/lib/mantenimiento/camaras-data";
import { PestanasCamaras } from "../pestanas";
import { SolicitudesClient } from "./solicitudes-client";

export const dynamic = "force-dynamic";

/**
 * Mantenimiento · Cámaras → Solicitudes. Lista las solicitudes que la Revisión
 * cartulina de Tesorería envía a cámaras (concepto "Enviar a revisión de
 * cámaras"). El técnico las resuelve con "Recobro" o "Normalidad de timbradas";
 * la resolución queda como revisión de sensor y se ve de vuelta en cartulina.
 */
export default async function SolicitudesCamarasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "camaras") && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const estado = sp.estado === "resuelto" || sp.estado === "todas" ? sp.estado : "pendiente";

  let solicitudes: SolicitudTesoreria[] = [];
  let error: string | null = null;
  try {
    solicitudes = await getSolicitudesTesoreria(estado);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Cámaras y sensores" icono={Cctv}>
        <PestanasCamaras activa="solicitudes" />
      </PageHeader>
      <SolicitudesClient
        solicitudes={solicitudes}
        estado={estado}
        puedeEditar={perms.isAdmin || perms.puedeEditar}
        error={error}
      />
    </div>
  );
}
