import { Fuel } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { getUltimasCargas, getUltimoDiaCargado, type CargaCombustible } from "@/lib/mantenimiento/combustible-data";
import { PestanasCombustible } from "./pestanas";
import { CargaCombustibleClient } from "./carga-client";

export const dynamic = "force-dynamic";

/**
 * Mantenimiento · Combustible. El proveedor (Petromil) manda un Excel por día
 * con los tanqueos de la flota; aquí se sube, se revisa la vista previa y se
 * confirma. Volver a subir un archivo no duplica tanqueos.
 */
export default async function CombustiblePage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "combustible")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  let cargas: CargaCombustible[] = [];
  let ultimoDia: string | null = null;
  let error: string | null = null;
  try {
    [cargas, ultimoDia] = await Promise.all([getUltimasCargas(), getUltimoDiaCargado()]);
  } catch (e) {
    // Sin la migración aplicada las tablas no existen: la pantalla lo dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Combustible" icono={Fuel}>
        <PestanasCombustible activa="cargar" />
      </PageHeader>
      <CargaCombustibleClient
        cargas={cargas}
        ultimoDia={ultimoDia}
        puedeEditar={perms.isAdmin || perms.puedeEditar}
        error={error}
      />
    </div>
  );
}
