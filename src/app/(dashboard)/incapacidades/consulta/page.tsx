import Link from "next/link";
import { Eye, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaBandeja } from "@/lib/incapacidades/auditoria";
import { leerCorte, listarExpedientes, type ExpedienteVista } from "@/lib/incapacidades/expedientes";
import { ESTADOS_EXPEDIENTE, fechaCorta } from "@/lib/incapacidades/formato";
import { BandejaTabla, LeyendaProcedencia } from "../bandeja-tabla";
import { Fallo, SinAcceso } from "../sin-acceso";

export const dynamic = "force-dynamic";

/**
 * Consulta (plan, pantalla 7): el expediente en solo lectura, para quien
 * revisa sin gestionar (Revisoría cuando se le asigne el submódulo
 * `incap_consulta`). Esta pantalla no enlaza ninguna acción de escritura; el
 * expediente que abre muestra sus formularios solo a quien tenga permiso de
 * edición, y cada consulta queda en la auditoría.
 */
export default async function ConsultaPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso titulo="Consulta de incapacidades" />;
  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const estado = ESTADOS_EXPEDIENTE.some((e) => e.key === sp.estado) ? sp.estado! : null;

  let filas: ExpedienteVista[] = [];
  let corte: string | null = null;
  let fallo: string | null = null;
  try {
    [filas, corte] = await Promise.all([listarExpedientes({ q, estado }), leerCorte()]);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!fallo) await auditarConsultaBandeja({ filtros: { bandeja: "consulta", q, estado }, filas: filas.length, rol: perms.userType, userEmail: perms.userEmail });

  const inputCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Consulta de incapacidades"
        icono={Eye}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        descripcion="Solo lectura: expediente, soportes, historial y observaciones. Cada consulta queda en la auditoría."
      />
      <div className="space-y-4 p-6">
        {fallo && <Fallo mensaje={fallo} />}
        <div className="flex items-start gap-2 rounded-xl border border-[#CCE3E6] bg-[#EEF7F8] px-4 py-3 text-sm text-[#0F4C55]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Gestión desde el <strong>{corte ? fechaCorta(corte) : "—"}</strong> por fecha de inicio. Las incapacidades anteriores están en la{" "}
            <Link href="/ausentismo?tab=matriz" className="font-medium underline">matriz EPS</Link>. Esta pantalla no modifica nada.
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
          <label className="text-xs text-gray-500">
            <span className="mb-1 block font-medium uppercase tracking-wide">Buscar</span>
            <input id="q" name="q" defaultValue={q ?? ""} placeholder="cédula o nombre" className={`${inputCls} w-56`} />
          </label>
          <label className="text-xs text-gray-500">
            <span className="mb-1 block font-medium uppercase tracking-wide">Estado</span>
            <select id="estado" name="estado" defaultValue={estado ?? ""} className={`${inputCls} w-44`}>
              <option value="">Todos</option>
              {ESTADOS_EXPEDIENTE.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">Buscar</button>
          <div className="ml-auto"><LeyendaProcedencia /></div>
        </form>
        <BandejaTabla filas={filas} />
        <p className="text-xs text-gray-500">{filas.length.toLocaleString("es-CO")} expediente(s).</p>
      </div>
    </div>
  );
}
