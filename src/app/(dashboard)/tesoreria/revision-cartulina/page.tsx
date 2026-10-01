import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";
import { getMarcasRevision, getRevisionTimbradas, type RevisionDia } from "@/lib/tesoreria/revision-timbradas-data";
import { PestanasCartulina } from "./pestanas";
import { RevisionTimbradasClient } from "./revision-timbradas-client";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ fecha?: string }>;
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

  let revision: RevisionDia | null = null;
  let error: string | null = null;
  try {
    revision = await getRevisionTimbradas(fecha);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const marcas = await getMarcasRevision(fecha);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Revisión cartulina"
        icono={ClipboardCheck}
        descripcion="Timbradas por viaje: despacho, puntos virtuales del terminal, recaudo y descuentos de GEMA."
      >
        <PestanasCartulina activa="revision" />
      </PageHeader>
      <RevisionTimbradasClient
        key={fecha}
        fecha={fecha}
        hoy={hoy}
        revision={revision}
        error={error}
        marcasIniciales={marcas.marcas}
        evidenciaDisponible={marcas.disponible}
        puedeRevisar={perms.isAdmin || perms.puedeEditar}
        revisor={perms.userEmail}
      />
    </div>
  );
}
