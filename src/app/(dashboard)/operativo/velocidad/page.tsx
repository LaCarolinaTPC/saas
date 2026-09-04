import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { hoyBogota } from "@/lib/operativo/constants";
import {
  getIncidenciasVelocidad, getParametrosVelocidad, getRangoDatosVelocidad, getReportesVelocidad,
} from "@/lib/operativo/velocidad";
import { MES_RE, mesDe, semanasDelMes, type Incidencia } from "@/lib/operativo/velocidad-reglas";
import { EncabezadoOperativo, PestanasOperativo } from "../ui";
import { VelocidadClient } from "./velocidad-client";

export const dynamic = "force-dynamic";

/**
 * Operativo · Exceso de velocidad: conductores que igualan o superan el umbral
 * (60 km/h) cada semana del mes, con la marca de reporte a RRHH cuando llegan
 * al mínimo de incidencias. Los eventos vienen de GEMA (tabla `velocidades`)
 * y el conductor del viaje despachado a esa hora.
 */
export default async function VelocidadPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; todos?: string; q?: string; semana?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  const mesActual = mesDe(hoy);
  const mes = sp.mes && MES_RE.test(sp.mes) && sp.mes <= mesActual ? sp.mes : mesActual;
  const semanas = semanasDelMes(mes);
  const desde = semanas[0].desde;
  const hasta = semanas[semanas.length - 1].hasta;

  const [parametros, rango] = await Promise.all([getParametrosVelocidad(), getRangoDatosVelocidad()]);
  let incidencias: Incidencia[] = [];
  let error: string | null = null;
  try {
    incidencias = await getIncidenciasVelocidad(desde, hasta, parametros);
  } catch (e) {
    // Sin la migración aplicada la función no existe: la pantalla lo dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }
  const reportes = await getReportesVelocidad(desde, hasta);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · Exceso de velocidad">
        <PestanasOperativo activa="velocidad" />
      </EncabezadoOperativo>
      <VelocidadClient
        hoy={hoy}
        mes={mes}
        mesActual={mesActual}
        semanas={semanas}
        parametros={parametros}
        incidencias={incidencias}
        reportes={reportes}
        rangoDatos={rango}
        soloReportablesInicial={sp.todos !== "1"}
        queryInicial={sp.q ?? ""}
        semanaInicial={sp.semana && /^\d{1,2}$/.test(sp.semana) ? Number(sp.semana) : null}
        puedeEditar={perms.isAdmin || perms.puedeEditar}
        error={error}
      />
    </div>
  );
}
