import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { contarAlarma, esDeCaja, ETAPAS_CAJA, type Etapa } from "@/lib/tesoreria/recobros-camaras";
import { getSolicitudesRecobro } from "@/lib/tesoreria/recobros-camaras-data";
import { PestanasCartulina } from "../pestanas";
import { totalAlarma } from "../aviso-recobros";
import { SolicitudesCamarasClient } from "./solicitudes-camaras-client";

export const dynamic = "force-dynamic";

const ETAPAS: readonly Etapa[] = ["en_camaras", "sin_revisar", "cerrada", "pendiente_caja", "cobrado", "no_cobrado"];

/**
 * Tesorería · Revisión cartulina · Solicitudes a cámaras: todas las
 * solicitudes que cartulina envió a cámaras, con la respuesta de cámaras y el
 * seguimiento de caja del recobro. La abren cartulina (marca vistas las
 * respuestas) y caja (registra si se cobró al conductor); cada uno ve solo
 * sus botones.
 */
export default async function SolicitudesCamarasPage({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string }>;
}) {
  const perms = await getCurrentPermissions();
  const deCartulina = canAccessSub(perms, "tesoreria", "cartulina");
  const deCaja = canAccessSub(perms, "tesoreria", "caja");
  if (!deCartulina && !deCaja) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  // El cajero sin cartulina solo ve los recobros que tiene que cobrar: ni las
  // normalidades ni lo que sigue en cámaras, y llega a lo pendiente.
  const soloCaja = !deCartulina;
  const sp = await searchParams;
  const etapas = soloCaja ? ETAPAS_CAJA : ETAPAS;
  const etapa = etapas.includes(sp.etapa as Etapa) ? (sp.etapa as Etapa) : soloCaja ? "pendiente_caja" : null;
  const datos = await getSolicitudesRecobro();
  const { disponible } = datos;
  const solicitudes = soloCaja ? datos.solicitudes.filter(esDeCaja) : datos.solicitudes;
  const alarma = contarAlarma(solicitudes);
  const editar = perms.isAdmin || perms.puedeEditar;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo={soloCaja ? "Recobros de cámaras" : "Revisión cartulina"}
        icono={ClipboardCheck}
        descripcion={
          soloCaja
            ? "Recobros que cámaras confirmó: registre si se le cobró al conductor del viaje."
            : "Solicitudes enviadas a cámaras: respuesta de cámaras y cobro del recobro en caja."
        }
      >
        <PestanasCartulina
          activa="solicitudes"
          alarma={disponible ? (soloCaja ? alarma.porCobrar : totalAlarma(alarma)) : 0}
          soloSolicitudes={soloCaja}
        />
      </PageHeader>
      <SolicitudesCamarasClient
        solicitudes={solicitudes}
        disponible={disponible}
        etapaInicial={etapa}
        hoy={hoyBogota()}
        puedeVer={deCartulina && editar}
        puedeCobrar={deCaja && editar}
        deCartulina={deCartulina}
        soloCaja={soloCaja}
      />
    </div>
  );
}
