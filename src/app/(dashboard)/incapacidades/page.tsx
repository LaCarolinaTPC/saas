import Link from "next/link";
import { HeartPulse, Info, Settings, FilePlus2, Landmark } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaBandeja } from "@/lib/incapacidades/auditoria";
import {
  leerCorte,
  listarEntidades,
  listarExpedientes,
  resumirBandeja,
  type EntidadCatalogo,
  type ExpedienteVista,
  type FiltrosBandeja,
} from "@/lib/incapacidades/expedientes";
import { ESTADOS_EXPEDIENTE, fechaCorta } from "@/lib/incapacidades/formato";
import { BandejaTabla, KpisBandeja, LeyendaProcedencia } from "./bandeja-tabla";
import { Fallo, SinAcceso } from "./sin-acceso";

export const dynamic = "force-dynamic";

const SOLO = new Set(["pendientes", "cobrables", "no_cobrables", "cambios"]);

/**
 * Bandeja de Recuperación de incapacidades: los expedientes que nacieron de la
 * matriz EPS desde el corte de gestión. Solo lectura en esta fase; completar,
 * liquidar y radicar llegan en las siguientes.
 */
export default async function IncapacidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; entidad?: string; q?: string; solo?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso />;

  const sp = await searchParams;
  const filtros: FiltrosBandeja = {
    estado: ESTADOS_EXPEDIENTE.some((e) => e.key === sp.estado) ? sp.estado : null,
    entidad: sp.entidad && /^[0-9a-f-]{36}$/i.test(sp.entidad) ? sp.entidad : null,
    q: sp.q?.trim() || null,
    solo: sp.solo && SOLO.has(sp.solo) ? (sp.solo as FiltrosBandeja["solo"]) : null,
  };

  let filas: ExpedienteVista[] = [];
  let entidades: EntidadCatalogo[] = [];
  let corte: string | null = null;
  let fallo: string | null = null;
  try {
    [filas, entidades, corte] = await Promise.all([listarExpedientes(filtros), listarEntidades(), leerCorte()]);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }

  if (!fallo) {
    await auditarConsultaBandeja({
      filtros: { estado: filtros.estado, entidad: filtros.entidad, q: filtros.q, solo: filtros.solo },
      filas: filas.length,
      rol: perms.userType,
      userEmail: perms.userEmail,
    });
  }

  const resumen = resumirBandeja(filas);
  const inputCls =
    "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Recuperación de incapacidades"
        icono={HeartPulse}
        descripcion="Expedientes de cobro ante la EPS o la ARL, uno por incapacidad de la matriz."
      >
        <div className="flex items-center gap-2">
          <Link
            href="/incapacidades/radicacion"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 hover:bg-[#F8FAFC]"
          >
            <Landmark className="h-4 w-4" /> Bandeja de cobro
          </Link>
          {perms.puedeEditar && (
            <Link
              href="/incapacidades/alta-manual"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 hover:bg-[#F8FAFC]"
            >
              <FilePlus2 className="h-4 w-4" /> Alta manual
            </Link>
          )}
          {perms.isAdmin && (
            <Link
              href="/incapacidades/parametros"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 hover:bg-[#F8FAFC]"
            >
              <Settings className="h-4 w-4" /> Parámetros
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="space-y-4 p-6">
        {fallo && <Fallo mensaje={fallo} />}

        <div className="flex items-start gap-2 rounded-xl border border-[#CCE3E6] bg-[#EEF7F8] px-4 py-3 text-sm text-[#0F4C55]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Gestión desde el <strong>{corte ? fechaCorta(corte) : "corte no configurado"}</strong>, por fecha de inicio de la
            incapacidad. Las anteriores siguen en la{" "}
            <Link href="/ausentismo?tab=matriz" className="font-medium underline">matriz EPS</Link> y solo entran aquí por alta
            manual con motivo.
          </p>
        </div>

        <KpisBandeja r={resumen} />

        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
          <label className="text-xs text-gray-500">
            <span className="mb-1 block font-medium uppercase tracking-wide">Buscar</span>
            <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="cédula o nombre" className={`${inputCls} w-56`} />
          </label>
          <label className="text-xs text-gray-500">
            <span className="mb-1 block font-medium uppercase tracking-wide">Estado</span>
            <select id="estado" name="estado" defaultValue={filtros.estado ?? ""} className={`${inputCls} w-44`}>
              <option value="">Todos</option>
              {ESTADOS_EXPEDIENTE.map((e) => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            <span className="mb-1 block font-medium uppercase tracking-wide">Entidad</span>
            <select id="entidad" name="entidad" defaultValue={filtros.entidad ?? ""} className={`${inputCls} w-52`}>
              <option value="">Todas</option>
              {entidades.filter((x) => x.activo).map((x) => (
                <option key={x.id} value={x.id}>{x.nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            <span className="mb-1 block font-medium uppercase tracking-wide">Mostrar</span>
            <select id="solo" name="solo" defaultValue={filtros.solo ?? ""} className={`${inputCls} w-52`}>
              <option value="">Todos</option>
              <option value="cobrables">Solo cobrables</option>
              <option value="no_cobrables">Solo no cobrables</option>
              <option value="pendientes">Con datos pendientes</option>
              <option value="cambios">La matriz cambió después</option>
            </select>
          </label>
          <button type="submit" className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">
            Filtrar
          </button>
          <Link href="/incapacidades" className="h-9 rounded-lg px-3 text-sm leading-9 text-gray-600 hover:underline">
            Limpiar
          </Link>
          <div className="ml-auto"><LeyendaProcedencia /></div>
        </form>

        <BandejaTabla filas={filas} />

        <p className="text-xs text-gray-500">
          {resumen.total.toLocaleString("es-CO")} expediente(s). Abre uno para completar datos, homologar, ajustar y
          liquidar. Radicar, recaudar y conciliar llegan en las fases 4 y 5 del plan.
        </p>
      </div>
    </div>
  );
}
