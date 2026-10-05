import { redirect } from "next/navigation";
import { Scale } from "lucide-react";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";
import { getAbonosPendientes, getAbonosPorGestionar, getConciliacionAbonos, getCorteRecaudo, getRangoAbonos } from "@/lib/tesoreria/conciliacion-abonos-data";
import {
  DIAS_BUSQUEDA_PENDIENTES, ESTADOS_CONCILIACION, FECHA_RE, MAX_DIAS_RANGO,
  type EstadoConciliacion, type FilaConciliacion,
} from "@/lib/tesoreria/conciliacion-abonos-reglas";
import { diasInclusivos } from "@/lib/operativo/velocidad-reglas";
import { ConciliacionAbonosClient } from "./conciliacion-client";

export const dynamic = "force-dynamic";

/**
 * Tesorería · Conciliación de abonos: por viaje, lo que el conductor abonó en
 * GEMA (tabla `abonos`) frente al neto que finalmente se recaudó
 * (`viajes_recaudados`). Muestra los abonos que siguen sin recaudo y las
 * diferencias entre lo abonado y lo recaudado.
 */
export default async function ConciliacionAbonosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; estado?: string; q?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "abonos")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  let hasta = sp.hasta && FECHA_RE.test(sp.hasta) ? sp.hasta : hoy;
  if (hasta > hoy) hasta = hoy;
  let desde = sp.desde && FECHA_RE.test(sp.desde) ? sp.desde : sumarDias(hasta, -29);
  if (desde > hasta) desde = hasta;
  let aviso: string | null = null;
  if (diasInclusivos(desde, hasta) > MAX_DIAS_RANGO) {
    desde = sumarDias(hasta, -(MAX_DIAS_RANGO - 1));
    aviso = `El periodo se recortó a los últimos ${MAX_DIAS_RANGO} días (desde el ${desde}).`;
  }
  const estado = ESTADOS_CONCILIACION.includes(sp.estado as EstadoConciliacion) ? (sp.estado as EstadoConciliacion) : null;

  const desdePend = sumarDias(hoy, -(DIAS_BUSQUEDA_PENDIENTES - 1));
  const corte = await getCorteRecaudo();
  const [rango, datos] = await Promise.all([
    getRangoAbonos(),
    Promise.all([
      getConciliacionAbonos(desde, hasta, corte),
      getAbonosPendientes(desdePend, hoy, corte),
      getAbonosPorGestionar(corte),
    ]).then(
      ([filas, pendientes, porGestionar]) => ({ filas, pendientes, porGestionar, error: null as string | null }),
      (e) => ({
        filas: [] as FilaConciliacion[],
        pendientes: [] as FilaConciliacion[],
        porGestionar: [] as FilaConciliacion[],
        error: e instanceof Error ? e.message : String(e),
      })
    ),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Conciliación de abonos"
        icono={Scale}
        descripcion="Lo que el conductor abonó en GEMA frente al neto que finalmente se recaudó, viaje por viaje."
      />
      <ConciliacionAbonosClient
        key={`${desde}|${hasta}`}
        hoy={hoy}
        desde={desde}
        hasta={hasta}
        aviso={aviso}
        filas={datos.filas}
        pendientes={datos.pendientes}
        porGestionar={datos.porGestionar}
        desdePendientes={desdePend}
        corteRecaudo={corte}
        rangoDatos={rango}
        estadoInicial={estado}
        queryInicial={sp.q ?? ""}
        error={datos.error}
      />
    </div>
  );
}
