import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { hoyBogota } from "@/lib/operativo/constants";
import { sumarDias } from "@/lib/operativo/velocidad-reglas";
import { getKpisGps, getPosicionesFlota, type KpisGps } from "@/lib/operativo/gps-flota";
import { EncabezadoOperativo, PestanasOperativo } from "../ui";
import { GpsClient } from "./gps-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** El periodo más largo que se agrega de una vez (un trimestre). */
const MAX_DIAS = 92;

/**
 * Operativo · GPS de la flota.
 *
 *  - Arriba, EN VIVO de GEMA: dónde está cada bus y cuáles no reportan.
 *  - Abajo, los KPIs del periodo con lo que el cron del GPS copió al espejo:
 *    kilómetros, conducción brusca por 100 km y eventos críticos del sensor
 *    de pasajeros.
 */
export default async function GpsFlotaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  // Por defecto los últimos 30 días hasta ayer: el kilometraje de hoy llega mañana.
  const ayer = sumarDias(hoy, -1);
  let hasta = sp.hasta && FECHA_RE.test(sp.hasta) && sp.hasta <= hoy ? sp.hasta : ayer;
  let desde = sp.desde && FECHA_RE.test(sp.desde) ? sp.desde : sumarDias(hasta, -29);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (sumarDias(desde, MAX_DIAS - 1) < hasta) desde = sumarDias(hasta, -(MAX_DIAS - 1));

  const [posiciones, kpis] = await Promise.all([
    getPosicionesFlota(),
    getKpisGps(desde, hasta).then(
      (k): { k: KpisGps | null; error: string | null } => ({ k, error: null }),
      // Sin la migración la función no existe: la pantalla lo dice en vez de caerse.
      (e) => ({ k: null, error: e instanceof Error ? e.message : String(e) })
    ),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · GPS de la flota">
        <PestanasOperativo activa="gps" />
      </EncabezadoOperativo>
      <GpsClient
        key={`${desde}|${hasta}`}
        hoy={hoy}
        desde={desde}
        hasta={hasta}
        posiciones={posiciones}
        kpis={kpis.k}
        errorKpis={kpis.error}
      />
    </div>
  );
}
