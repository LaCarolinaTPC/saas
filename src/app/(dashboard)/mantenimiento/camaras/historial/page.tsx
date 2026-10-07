import { Cctv } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { diasEntre, hoyBogota } from "@/lib/operativo/constants";
import {
  getHistorialCamaras, getRecaudoPorNumero, getTiposNovedad, type FiltrosHistorialCamaras, type RevisionCamaras,
} from "@/lib/mantenimiento/camaras-data";
import { ELEMENTOS, type Elemento, type TipoNovedad } from "@/lib/mantenimiento/camaras-reglas";
import { PestanasCamaras } from "../pestanas";
import { HistorialCamarasClient } from "./historial-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Dos años: el histórico del Forms arranca en dic-2024. */
const MAX_DIAS = 731;

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

type Params = {
  desde?: string; hasta?: string; codigo?: string; conductor?: string; elemento?: string; tipo?: string;
  falla?: string; origen?: string; alertas?: string;
};

/** Historial de revisiones de cámaras y sensores: filtros, semáforo y Excel. */
export default async function HistorialCamarasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "camaras") && !canAccess(perms, "mantenimiento")) {
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
  const filtros: FiltrosHistorialCamaras = {
    desde,
    hasta,
    codigo: /^\d{1,5}$/.test(codigo) ? codigo : null,
    conductor: sp.conductor?.trim() || null,
    elemento: ELEMENTOS.includes(sp.elemento as Elemento) ? (sp.elemento as Elemento) : null,
    tipo: sp.tipo?.trim() || null,
    falla: sp.falla === "si" ? true : sp.falla === "no" ? false : null,
    origen: sp.origen === "formulario" || sp.origen === "migracion" ? sp.origen : null,
    conAlertas: sp.alertas === "1",
  };

  let revisiones: RevisionCamaras[] = [];
  let tipos: TipoNovedad[] = [];
  let recaudo: Record<number, number | null> = {};
  let error: string | null = null;
  try {
    [revisiones, tipos] = await Promise.all([getHistorialCamaras(filtros), getTiposNovedad()]);
    const mapa = await getRecaudoPorNumero(revisiones.flatMap((r) => (r.despacho_numero ? [r.despacho_numero] : [])));
    recaudo = Object.fromEntries(mapa);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Cámaras y sensores" icono={Cctv}>
        <PestanasCamaras activa="historial" />
      </PageHeader>
      <HistorialCamarasClient
        filtros={{
          desde, hasta, codigo: filtros.codigo ?? "", conductor: filtros.conductor ?? "", elemento: filtros.elemento ?? "",
          tipo: filtros.tipo ?? "", falla: sp.falla ?? "", origen: filtros.origen ?? "", alertas: filtros.conAlertas,
        }}
        revisiones={revisiones}
        tipos={tipos}
        recaudo={recaudo}
        puedeEditar={perms.isAdmin || perms.puedeEditar}
        aviso={aviso}
        error={error}
      />
    </div>
  );
}
