import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getTipos, resumenVencimientos } from "@/lib/operativo/data";
import { hoyBogota } from "@/lib/operativo/constants";
import { EncabezadoOperativo, PestanasOperativo } from "./ui";
import { TableroClient } from "./tablero-client";

export const dynamic = "force-dynamic";

/**
 * Operativo: tablero de vencimientos de los documentos del vehículo (SOAT,
 * técnico-mecánica, pólizas RCC y RCE, tarjeta de operación). Las fechas
 * salen del maestro GEMA y de los documentos cargados en la ficha de cada
 * vehículo; la alerta usa la más reciente de las dos.
 */
export default async function OperativoPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const hoy = hoyBogota();
  const [tipos, resumen] = await Promise.all([getTipos(false), resumenVencimientos(hoy)]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · Documentos del vehículo">
        <PestanasOperativo activa="vencimientos" />
      </EncabezadoOperativo>
      <TableroClient
        hoy={hoy}
        tipos={tipos}
        filas={resumen.filas}
        puedeEditar={perms.isAdmin || perms.puedeEditar}
      />
    </div>
  );
}
