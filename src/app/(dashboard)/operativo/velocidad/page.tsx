import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { hoyBogota } from "@/lib/operativo/constants";
import {
  getIncidenciasVelocidad, getParametrosVelocidad, getRangoDatosVelocidad, getReportesVelocidad,
} from "@/lib/operativo/velocidad";
import {
  FECHA_RE, MAX_DIAS_RANGO, MES_RE, diasInclusivos, limitesDelMes, mesDe, rangoDeConsulta, semanasDelRango, sumarDias,
  type Incidencia,
} from "@/lib/operativo/velocidad-reglas";
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
  searchParams: Promise<{ desde?: string; hasta?: string; mes?: string; todos?: string; q?: string; semana?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  const mesActual = mesDe(hoy);
  // Periodo consultado: `desde`/`hasta` explícitos; si no, el mes (`mes` o el actual).
  // Se recorta a hoy y a MAX_DIAS_RANGO días para que la consulta no se desborde.
  const mes = sp.mes && MES_RE.test(sp.mes) && sp.mes <= mesActual ? sp.mes : mesActual;
  const porDefecto = limitesDelMes(mes);
  let desde = sp.desde && FECHA_RE.test(sp.desde) ? sp.desde : porDefecto.desde;
  let hasta = sp.hasta && FECHA_RE.test(sp.hasta) ? sp.hasta : porDefecto.hasta;
  if (hasta > hoy) hasta = hoy;
  if (desde > hasta) desde = hasta;
  let avisoRango: string | null = null;
  if (diasInclusivos(desde, hasta) > MAX_DIAS_RANGO) {
    desde = sumarDias(hasta, -(MAX_DIAS_RANGO - 1));
    avisoRango = `El periodo se recortó a los últimos ${MAX_DIAS_RANGO} días (desde el ${desde}): es el máximo que se consulta de una vez.`;
  }
  // Las semanas son de lunes a domingo completas: se consultan sus fechas
  // reales aunque desborden el periodo pedido, para que el mínimo de
  // incidencias por semana se cuente sobre la semana entera.
  const semanas = semanasDelRango(desde, hasta);
  const consulta = rangoDeConsulta(semanas, hoy);

  const [parametros, rango] = await Promise.all([getParametrosVelocidad(), getRangoDatosVelocidad()]);
  let incidencias: Incidencia[] = [];
  let error: string | null = null;
  try {
    incidencias = await getIncidenciasVelocidad(consulta.desde, consulta.hasta, parametros);
  } catch (e) {
    // Sin la migración aplicada la función no existe: la pantalla lo dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }
  const reportes = await getReportesVelocidad(consulta.desde, consulta.hasta);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · Exceso de velocidad">
        <PestanasOperativo activa="velocidad" />
      </EncabezadoOperativo>
      <VelocidadClient
        hoy={hoy}
        desde={desde}
        hasta={hasta}
        consulta={consulta}
        mesActual={mesActual}
        semanas={semanas}
        avisoRango={avisoRango}
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
