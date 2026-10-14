import { Fuel } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { diasEntre, hoyBogota } from "@/lib/operativo/constants";
import { getHistorialCombustible, type FiltrosHistorialCombustible, type TanqueoFila } from "@/lib/mantenimiento/combustible-data";
import { PestanasCombustible } from "../pestanas";
import { HistorialCombustibleClient } from "./historial-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Un año: ~36.000 tanqueos, que todavía caben en la pantalla y el Excel. */
const MAX_DIAS = 366;

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

type Params = { desde?: string; hasta?: string; codigo?: string; placa?: string; alertas?: string };

/** Historial de tanqueos de combustible: filtros, totales y Excel. */
export default async function HistorialCombustiblePage({ searchParams }: { searchParams: Promise<Params> }) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "combustible")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  let hasta = sp.hasta && FECHA_RE.test(sp.hasta) ? sp.hasta : hoy;
  if (hasta > hoy) hasta = hoy;
  let desde = sp.desde && FECHA_RE.test(sp.desde) ? sp.desde : restarDias(hasta, 29);
  if (desde > hasta) desde = hasta;
  let aviso: string | null = null;
  if (diasEntre(desde, hasta) + 1 > MAX_DIAS) {
    desde = restarDias(hasta, MAX_DIAS - 1);
    aviso = `El periodo se recortó a los últimos ${MAX_DIAS} días (desde el ${desde}).`;
  }
  const codigo = sp.codigo?.trim() ?? "";
  const placa = (sp.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const filtros: FiltrosHistorialCombustible = {
    desde,
    hasta,
    codigo: /^\d{1,5}$/.test(codigo) ? codigo.replace(/^0+(?=\d)/, "") : null,
    placa: placa || null,
    conAlertas: sp.alertas === "1",
  };

  let tanqueos: TanqueoFila[] = [];
  let error: string | null = null;
  try {
    tanqueos = await getHistorialCombustible(filtros);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Combustible" icono={Fuel}>
        <PestanasCombustible activa="historial" />
      </PageHeader>
      <HistorialCombustibleClient
        filtros={{ desde, hasta, codigo: filtros.codigo ?? "", placa: filtros.placa ?? "", alertas: filtros.conAlertas }}
        tanqueos={tanqueos}
        aviso={aviso}
        error={error}
      />
    </div>
  );
}
