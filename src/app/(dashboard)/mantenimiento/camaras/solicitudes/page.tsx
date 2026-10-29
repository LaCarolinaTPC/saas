import { Cctv } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { getBandejaSolicitudes, type FiltroSolicitudes, type SolicitudBandeja } from "@/lib/mantenimiento/camaras-data";
import { refrescarRecobrosDelDia } from "@/lib/gema/recobros-al-dia";
import { getArranqueAbonos } from "@/lib/tesoreria/recobros-solicitudes";
import { getTarifas } from "@/lib/tesoreria/recobros-data";
import { PestanasCamaras } from "../pestanas";
import { SolicitudesClient } from "./solicitudes-client";

export const dynamic = "force-dynamic";
// El refresco de GEMA al abrir puede tardar unos segundos.
export const maxDuration = 60;

const FILTROS: FiltroSolicitudes[] = ["pendiente", "resuelto", "anulada", "todas"];

/**
 * Mantenimiento · Cámaras → Solicitudes. Las revisiones de cámara que pide
 * Tesorería: una por cada abono «REVISIÓN CÁMARA» de GEMA y las que envía la
 * Revisión cartulina. El técnico la toma y la resuelve con el conteo del
 * video (Recobro o Sin recobro) o sin conteo (decide subgerencia). Al abrir,
 * si los datos de GEMA tienen más de 15 minutos, se traen de nuevo.
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
  const estado = FILTROS.includes(sp.estado as FiltroSolicitudes) ? (sp.estado as FiltroSolicitudes) : "pendiente";

  // Nunca lanza: si GEMA falla se muestra lo guardado con el aviso.
  const refresco = await refrescarRecobrosDelDia();
  let solicitudes: SolicitudBandeja[] = [];
  let error: string | null = null;
  const [arranque, tarifas] = await Promise.all([getArranqueAbonos(), getTarifas()]);
  try {
    solicitudes = await getBandejaSolicitudes(estado);
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
        hoy={hoyBogota()}
        tarifas={tarifas}
        puedeEditar={puedeEditarEn(perms, "camaras", "mantenimiento")}
        esAdmin={perms.isAdmin}
        arranqueAbonos={arranque}
        actualizadoAt={refresco.actualizadoAt}
        errorGema={refresco.error ?? null}
        error={error}
      />
    </div>
  );
}
