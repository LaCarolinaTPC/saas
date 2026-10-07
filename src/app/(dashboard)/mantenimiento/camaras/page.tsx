import { Cctv } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import {
  getConductoresCamaras, getRecaudoPorNumero, getTiposNovedad, getUltimasRevisiones, getVehiculosCamaras,
  type ConductorCamaras, type RevisionCamaras, type VehiculoCamaras,
} from "@/lib/mantenimiento/camaras-data";
import type { TipoNovedad } from "@/lib/mantenimiento/camaras-reglas";
import { PestanasCamaras } from "./pestanas";
import { CamarasClient } from "./camaras-client";

export const dynamic = "force-dynamic";

/**
 * Mantenimiento · Cámaras y sensores. El técnico revisa el video de un viaje:
 * cuenta los pasajeros (aforo), lo compara con el conteo del sensor (DFS
 * Optocontrol) y con las timbradas de caja, y anota la falla si la hay. El
 * viaje y el conductor salen del despacho de GEMA; reemplaza el Forms anónimo.
 */
export default async function CamarasPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "camaras") && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  let tipos: TipoNovedad[] = [];
  let vehiculos: VehiculoCamaras[] = [];
  let conductores: ConductorCamaras[] = [];
  let ultimas: RevisionCamaras[] = [];
  let recaudo: Record<number, number | null> = {};
  let error: string | null = null;
  try {
    [tipos, vehiculos, conductores, ultimas] = await Promise.all([
      getTiposNovedad(), getVehiculosCamaras(), getConductoresCamaras(), getUltimasRevisiones(),
    ]);
    const mapa = await getRecaudoPorNumero(ultimas.flatMap((u) => (u.despacho_numero ? [u.despacho_numero] : [])));
    recaudo = Object.fromEntries(mapa);
  } catch (e) {
    // Sin la migración aplicada las tablas no existen: la pantalla lo dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Cámaras y sensores" icono={Cctv}>
        <PestanasCamaras activa="registrar" />
      </PageHeader>
      <CamarasClient
        hoy={hoyBogota()}
        tipos={tipos}
        vehiculos={vehiculos}
        conductores={conductores}
        ultimas={ultimas}
        recaudo={recaudo}
        puedeEditar={perms.isAdmin || perms.puedeEditar}
        error={error}
      />
    </div>
  );
}
