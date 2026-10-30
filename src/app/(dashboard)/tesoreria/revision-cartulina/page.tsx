import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { canAccessSub, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";
import { getMarcasRevision, getNovedadesRevision, getRevisionTimbradas, getSolicitudesCamarasDia, getVehiculosActivos, type RevisionDia } from "@/lib/tesoreria/revision-timbradas-data";
import { getCierresDia, guardarFotoDia } from "@/lib/tesoreria/revision-timbradas-consolidado-data";
import { INICIO_REVISION_GESTIVO } from "@/lib/tesoreria/revision-timbradas-consolidado";
import { getAvisosRecobros } from "@/lib/tesoreria/recobros-data";
import { rolRecobros } from "@/lib/tesoreria/recobros-acceso";
import { totalAvisos } from "@/lib/tesoreria/recobros-vista";
import { PestanasCartulina } from "./pestanas";
import { AvisoRecobros } from "./aviso-recobros";
import { ultimaActualizacionRecobros } from "@/lib/gema/recobros-al-dia";
import { ActualizarGemaRecobros } from "@/components/tesoreria/actualizar-gema-recobros";
import { actualizarRecobrosDesdeGema } from "./actions";
import { RevisionTimbradasClient } from "./revision-timbradas-client";
import { AvisoProvisional } from "./aviso-provisional";
import { refrescarCartulinaHoy, type RefrescoCartulinaHoy } from "@/lib/tesoreria/cartulina-hoy";

export const dynamic = "force-dynamic";
// Hoy se trae de GEMA al abrir (si el dato tiene más de 5 min): el día
// completo de puntos virtuales tarda unos segundos.
export const maxDuration = 60;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tesorería · Revisión cartulina: revisión diaria de timbradas. Cruza por
 * viaje el despacho, los eventos de geocerca del terminal, el recaudo y las
 * timbradas descontadas de GEMA, y clasifica cada viaje según la política de
 * descuentos autorizados vigente ese día. Lo revisado queda en la base.
 */
export default async function RevisionCartulinaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; pendientes?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  // Por defecto ayer: el día de hoy nunca está completo.
  let fecha = sp.fecha && FECHA_RE.test(sp.fecha) ? sp.fecha : sumarDias(hoy, -1);
  if (fecha > hoy) fecha = hoy;

  // Hoy (y ayer, cuyas llegadas nocturnas caen en hoy) se refresca de GEMA
  // casi en tiempo real; nunca lanza. Los días cerrados se leen tal cual.
  let refresco: RefrescoCartulinaHoy | null = null;
  if (fecha >= sumarDias(hoy, -1)) refresco = await refrescarCartulinaHoy(hoy);

  let revision: RevisionDia | null = null;
  let error: string | null = null;
  try {
    revision = await getRevisionTimbradas(fecha);
    // Foto del cálculo para el consolidado; si la migración no está, sigue sin
    // ella. Hoy no: son datos provisionales y el consolidado llega hasta ayer.
    if (fecha >= INICIO_REVISION_GESTIVO && fecha < hoy) {
      const errFoto = await guardarFotoDia(revision);
      if (errFoto) console.warn(`[revision-timbradas] foto del ${fecha} no guardada: ${errFoto}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const [marcas, cierres, vehiculosActivos, novedadesCat, solicitudesCat, avisos, gemaAt] = await Promise.all([
    getMarcasRevision(fecha),
    getCierresDia(fecha),
    getVehiculosActivos().catch(() => []),
    getNovedadesRevision(true),
    getSolicitudesCamarasDia(fecha),
    getAvisosRecobros(rolRecobros(perms).acciones),
    ultimaActualizacionRecobros().catch(() => null),
  ]);
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Revisión cartulina"
        icono={ClipboardCheck}
        descripcion="Timbradas por viaje: despacho, puntos virtuales del terminal, recaudo y descuentos de GEMA."
      >
        <PestanasCartulina activa="revision" alarma={totalAvisos(avisos)} />
      </PageHeader>
      <div className="mx-auto max-w-[1600px] space-y-2 px-4 pt-4 sm:px-6">
        <AvisoRecobros avisos={avisos} />
        {/* Trae ya los abonos «REVISIÓN CÁMARA» de hoy: abren su solicitud a Cámaras. */}
        <ActualizarGemaRecobros accion={actualizarRecobrosDesdeGema} actualizadoAt={gemaAt} soloAbonos />
      </div>
      {(fecha === hoy || (revision?.cobertura.provisionales.length ?? 0) > 0) && refresco?.motivo !== "sin tabla" && (
        <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6">
          <AvisoProvisional
            esHoy={fecha === hoy}
            actualizadoAt={refresco?.actualizadoAt ?? null}
            error={refresco?.motivo === "falló GEMA" ? refresco.error : null}
          />
        </div>
      )}
      <RevisionTimbradasClient
        key={fecha}
        fecha={fecha}
        hoy={hoy}
        revision={revision}
        error={error}
        marcasIniciales={marcas.marcas}
        evidenciaDisponible={marcas.disponible}
        puedeRevisar={puedeEditarEn(perms, "tesoreria.cartulina")}
        revisor={perms.userEmail}
        cierres={cierres}
        vehiculosActivos={vehiculosActivos}
        soloPendientes={sp.pendientes === "1"}
        novedades={novedadesCat.novedades}
        solicitudes={solicitudesCat.solicitudes}
      />
    </div>
  );
}
