import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { canAccessSub, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { alarmaPara, contarAlarma, esDeCaja, type FiltroEtapa } from "@/lib/tesoreria/recobros-camaras";
import { getGestionesRecobros, getSolicitudesRecobro } from "@/lib/tesoreria/recobros-camaras-data";
import { PestanasCartulina } from "../pestanas";
import { totalAlarma } from "../aviso-recobros";
import { SolicitudesCamarasClient } from "./solicitudes-camaras-client";

export const dynamic = "force-dynamic";

const FILTROS: readonly FiltroEtapa[] = [
  "en_camaras", "cerrada", "pendiente_caja", "en_seguimiento", "por_autorizar",
  "cobrado", "incobrable", "abiertos", "vencida",
];

/**
 * Tesorería · Revisión cartulina · Solicitudes a cámaras: todas las
 * solicitudes que cartulina envió a cámaras, con la respuesta de cámaras y el
 * seguimiento de caja del recobro. La abren cartulina (sigue sus
 * solicitudes), caja (gestiona y cobra al conductor) y la directora de
 * tesorería (autoriza los incobrables); cada uno ve solo sus botones. Los
 * indicadores de gestión son para cartulina, la directora y el admin.
 */
export default async function SolicitudesCamarasPage({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string }>;
}) {
  const perms = await getCurrentPermissions();
  const deCartulina = canAccessSub(perms, "tesoreria", "cartulina");
  const deCaja = canAccessSub(perms, "tesoreria", "caja");
  const autoriza = canAccessSub(perms, "tesoreria", "recobros_incobrable");
  if (!deCartulina && !deCaja && !autoriza) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  // Sin cartulina solo se ven los recobros (lo que caja cobra y la directora
  // autoriza): ni las normalidades ni lo que sigue en cámaras.
  const soloRecobros = !deCartulina;
  const sp = await searchParams;
  const hoy = hoyBogota();
  const filtroPorDefecto: FiltroEtapa | null = !soloRecobros ? null : deCaja ? "abiertos" : "por_autorizar";
  const filtro = FILTROS.includes(sp.etapa as FiltroEtapa) ? (sp.etapa as FiltroEtapa) : filtroPorDefecto;
  const [datos, gestiones] = await Promise.all([getSolicitudesRecobro(), getGestionesRecobros()]);
  const { disponible } = datos;
  const solicitudes = soloRecobros ? datos.solicitudes.filter(esDeCaja) : datos.solicitudes;
  const alarma = alarmaPara(contarAlarma(solicitudes, hoy), { cartulina: deCartulina, caja: deCaja, autoriza });
  const editar = puedeEditarEn(perms, "tesoreria.cartulina", "tesoreria.caja", "tesoreria.recobros_incobrable");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo={soloRecobros ? "Recobros de cámaras" : "Revisión cartulina"}
        icono={ClipboardCheck}
        descripcion={
          soloRecobros
            ? "Recobros que cámaras confirmó: gestión y cobro al conductor del viaje."
            : "Solicitudes enviadas a cámaras: respuesta de cámaras y seguimiento del recobro en caja."
        }
      >
        <PestanasCartulina
          activa="solicitudes"
          alarma={disponible ? totalAlarma(alarma) : 0}
          soloSolicitudes={soloRecobros}
        />
      </PageHeader>
      <SolicitudesCamarasClient
        solicitudes={solicitudes}
        gestiones={gestiones}
        disponible={disponible}
        filtroInicial={filtro}
        hoy={hoy}
        puedeCobrar={deCaja && editar}
        puedeAutorizar={autoriza && editar}
        verIndicadores={deCartulina || autoriza || perms.isAdmin}
        deCartulina={deCartulina}
        soloRecobros={soloRecobros}
      />
    </div>
  );
}
