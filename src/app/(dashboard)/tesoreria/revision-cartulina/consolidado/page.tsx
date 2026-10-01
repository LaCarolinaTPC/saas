import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";
import { getConsolidadoTimbradas } from "@/lib/tesoreria/revision-timbradas-consolidado-data";
import { INICIO_REVISION_GESTIVO } from "@/lib/tesoreria/revision-timbradas-consolidado";
import { PestanasCartulina } from "../pestanas";
import { ConsolidadoClient } from "./consolidado-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Máximo de días por consulta (dos meses). */
const MAX_DIAS = 62;

/**
 * Tesorería · Revisión cartulina · Consolidado: avance de la revisión de
 * timbradas por día, por estado y por revisor en un periodo, a partir de los
 * checks, la foto diaria del cálculo y los cierres del día.
 */
export default async function ConsolidadoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "cartulina")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  const ayer = sumarDias(hoy, -1);
  let hasta = sp.hasta && FECHA_RE.test(sp.hasta) ? sp.hasta : ayer;
  if (hasta > ayer) hasta = ayer;
  let desde = sp.desde && FECHA_RE.test(sp.desde) ? sp.desde : `${hasta.slice(0, 7)}-01`;
  if (desde < INICIO_REVISION_GESTIVO) desde = INICIO_REVISION_GESTIVO;
  if (desde > hasta) desde = hasta;
  let aviso: string | null = null;
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5) + 1;
  if (dias > MAX_DIAS) {
    desde = sumarDias(hasta, -(MAX_DIAS - 1));
    aviso = `El periodo se recortó a los últimos ${MAX_DIAS} días (desde el ${desde}).`;
  }

  const { disponible, consolidado, error } = await getConsolidadoTimbradas(desde, hasta);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Revisión cartulina"
        icono={ClipboardCheck}
        descripcion="Consolidado de la revisión de timbradas: avance por día, por estado y por revisor."
      >
        <PestanasCartulina activa="consolidado" />
      </PageHeader>
      <ConsolidadoClient
        key={`${desde}|${hasta}`}
        desde={desde}
        hasta={hasta}
        ayer={ayer}
        inicio={INICIO_REVISION_GESTIVO}
        consolidado={consolidado}
        disponible={disponible}
        error={error ?? null}
        aviso={aviso}
        usuario={perms.userEmail}
      />
    </div>
  );
}
