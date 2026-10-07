import { Cctv } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { diasEntre, hoyBogota } from "@/lib/operativo/constants";
import {
  contarViajesDespachados, getHistorialCamaras, getRecaudoPorNumero, getTiposNovedad,
} from "@/lib/mantenimiento/camaras-data";
import { resumirTablero, type Tablero } from "@/lib/mantenimiento/camaras-tablero";
import { PestanasCamaras } from "../pestanas";
import { TableroCamarasClient } from "./tablero-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 731;

/** Primer día del mes, `meses` meses atrás de la fecha dada. */
function inicioMes(fecha: string, meses: number): string {
  const d = new Date(`${fecha.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}

/**
 * Tablero de cámaras y sensores: cobertura de revisión frente a los viajes
 * despachados, fallas por tipo y mes, buses con fallas y la diferencia entre
 * el aforo del video y la caja por conductor. Por defecto, los últimos tres meses.
 */
export default async function TableroCamarasPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "camaras") && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  let hasta = sp.hasta && FECHA_RE.test(sp.hasta) ? sp.hasta : hoy;
  if (hasta > hoy) hasta = hoy;
  let desde = sp.desde && FECHA_RE.test(sp.desde) ? sp.desde : inicioMes(hasta, 2);
  if (desde > hasta) desde = hasta;
  let aviso: string | null = null;
  if (diasEntre(desde, hasta) + 1 > MAX_DIAS) {
    desde = inicioMes(hasta, 23);
    aviso = `El periodo se recortó a dos años (desde el ${desde}).`;
  }

  let tablero: Tablero | null = null;
  let despachados = 0;
  let error: string | null = null;
  try {
    const [revisiones, tipos, total] = await Promise.all([
      getHistorialCamaras({
        desde, hasta, codigo: null, conductor: null, elemento: null, tipo: null, falla: null, origen: null, conAlertas: false,
      }),
      getTiposNovedad(),
      contarViajesDespachados(desde, hasta),
    ]);
    const recaudo = Object.fromEntries(
      await getRecaudoPorNumero(revisiones.flatMap((r) => (r.despacho_numero ? [r.despacho_numero] : []))),
    );
    tablero = resumirTablero(revisiones, tipos, recaudo);
    despachados = total;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Cámaras y sensores" icono={Cctv}>
        <PestanasCamaras activa="tablero" />
      </PageHeader>
      <TableroCamarasClient desde={desde} hasta={hasta} tablero={tablero} despachados={despachados} aviso={aviso} error={error} />
    </div>
  );
}
