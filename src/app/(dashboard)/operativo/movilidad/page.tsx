import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { hoyBogota } from "@/lib/operativo/constants";
import { getMovilidadPorHora, getRangoHistoricoDespacho } from "@/lib/operativo/movilidad";
import { FECHA_RE, MAX_DIAS_RANGO, TIPOS_DIA, type FilaMovilidad, type TipoDia } from "@/lib/operativo/movilidad-reglas";
import { diasInclusivos, sumarDias } from "@/lib/operativo/velocidad-reglas";
import { EncabezadoOperativo, PestanasOperativo } from "../ui";
import { MovilidadClient } from "./movilidad-client";

export const dynamic = "force-dynamic";

/**
 * Operativo · Movilidad: cuánto dura la vuelta de cada ruta según la hora en
 * que sale el bus, con el histórico de despacho de GEMA (`historico_despacho`).
 * Sirve para decidir cambios al despacho: tiempos de vuelta por franja,
 * salidas que conviene correr de hora y dónde reforzar o reducir.
 */
export default async function MovilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; ruta?: string; dia?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  // Por defecto los últimos 90 días hasta ayer: el día en curso todavía no
  // tiene las llegadas cerradas.
  const ayer = sumarDias(hoy, -1);
  let hasta = sp.hasta && FECHA_RE.test(sp.hasta) ? sp.hasta : ayer;
  if (hasta > hoy) hasta = hoy;
  let desde = sp.desde && FECHA_RE.test(sp.desde) ? sp.desde : sumarDias(hasta, -89);
  if (desde > hasta) desde = hasta;
  let avisoRango: string | null = null;
  if (diasInclusivos(desde, hasta) > MAX_DIAS_RANGO) {
    desde = sumarDias(hasta, -(MAX_DIAS_RANGO - 1));
    avisoRango = `El periodo se recortó a los últimos ${MAX_DIAS_RANGO} días (desde el ${desde}).`;
  }
  const tipoDia: TipoDia = TIPOS_DIA.includes(sp.dia as TipoDia) ? (sp.dia as TipoDia) : "LV";

  const [rango, consulta] = await Promise.all([
    getRangoHistoricoDespacho(),
    getMovilidadPorHora(desde, hasta).then(
      (filas) => ({ filas, error: null }),
      // Sin la migración aplicada la función no existe: la pantalla lo dice en vez de caerse.
      (e) => ({ filas: [] as FilaMovilidad[], error: e instanceof Error ? e.message : String(e) })
    ),
  ]);
  const { filas, error } = consulta;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · Movilidad por hora">
        <PestanasOperativo activa="movilidad" />
      </EncabezadoOperativo>
      <MovilidadClient
        key={`${desde}|${hasta}`}
        hoy={hoy}
        desde={desde}
        hasta={hasta}
        avisoRango={avisoRango}
        filas={filas}
        rangoDatos={rango}
        rutaInicial={sp.ruta ?? null}
        tipoDiaInicial={tipoDia}
        error={error}
      />
    </div>
  );
}
