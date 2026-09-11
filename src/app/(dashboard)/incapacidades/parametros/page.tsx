import { Settings } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import {
  leerCorte,
  listarEntidades,
  listarReglas,
  type EntidadCatalogo,
  type ReglaFila,
} from "@/lib/incapacidades/expedientes";
import { CLASES_ENTIDAD, fechaCorta, fechaHora } from "@/lib/incapacidades/formato";
import { Fallo, SinAcceso } from "../sin-acceso";
import { leerTolerancia } from "@/lib/incapacidades/recaudos";
import { actualizarCorte, actualizarEntidad, actualizarTolerancia } from "./actions";

export const dynamic = "force-dynamic";

const inputCls =
  "h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";

/**
 * Parámetros del módulo (solo administrador): corte de gestión, reglas del
 * motor y el catálogo de entidades con lo que exige radicar. Cambiar el umbral
 * de una EPS cambia qué incapacidades son cobrables en toda la bandeja.
 */
export default async function ParametrosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso />;
  if (!perms.isAdmin) {
    return <SinAcceso titulo="Parámetros de incapacidades" motivo="Los parámetros del módulo los cambia solo el administrador: mueven el dinero que se reclama en toda la operación." />;
  }

  const sp = await searchParams;
  let corte: string | null = null;
  let reglas: ReglaFila[] = [];
  let entidades: EntidadCatalogo[] = [];
  let tolerancia = 0;
  let fallo: string | null = null;
  try {
    [corte, reglas, entidades, tolerancia] = await Promise.all([leerCorte(), listarReglas(), listarEntidades(), leerTolerancia().catch(() => 0)]);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Parámetros de incapacidades"
        icono={Settings}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        descripcion="Corte de gestión, reglas del motor y catálogo de entidades pagadoras."
      />
      <div className="space-y-4 p-6">
        {fallo && <Fallo mensaje={fallo} />}
        {sp.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{sp.error}</div>
        )}
        {sp.ok && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {sp.ok === "corte" ? "Corte de gestión guardado." : sp.ok === "tolerancia" ? "Tolerancia de conciliación guardada." : "Entidad guardada."}
          </div>
        )}

        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Corte de gestión</h3>
          <p className="mt-1 text-xs text-gray-500">
            Entran en gestión las incapacidades vigentes de la matriz cuya <strong>fecha de inicio</strong> es igual o
            posterior al corte. Moverlo hacia atrás no crea expedientes retroactivos: una incapacidad anterior entra solo
            por alta manual con motivo.
          </p>
          <form action={actualizarCorte} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-500">
              <span className="mb-1 block font-medium uppercase tracking-wide">Fecha de corte</span>
              <input id="fecha_corte" name="fecha_corte" type="date" defaultValue={corte ?? ""} required className={inputCls} />
            </label>
            <button type="submit" className="h-8 rounded-md bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800">
              Guardar corte
            </button>
            <span className="text-xs text-gray-500">Vigente: {corte ? fechaCorta(corte) : "sin configurar"}</span>
          </form>
        </section>

        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Tolerancia de conciliación</h3>
          <p className="mt-1 text-xs text-gray-500">
            Diferencia máxima, en pesos, entre lo reclamado y lo recaudado más ajustes para dar un expediente por
            conciliado (decisión 12.6, por confirmar). Cero = exacto, como el indicador del libro Excel. Cerrar con un
            saldo mayor exige una excepción escrita.
          </p>
          <form action={actualizarTolerancia} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-500">
              <span className="mb-1 block font-medium uppercase tracking-wide">Tolerancia (COP)</span>
              <input id="tolerancia" name="tolerancia" inputMode="numeric" defaultValue={tolerancia} required className={`${inputCls} w-40`} />
            </label>
            <button type="submit" className="h-8 rounded-md bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800">Guardar tolerancia</button>
          </form>
        </section>

        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Reglas del motor</h3>
          <p className="mt-1 text-xs text-gray-500">
            Solo una regla es operativa; las demás existen para las pruebas de compatibilidad con el libro Excel. Una
            regla usada por una liquidación no se edita: se crea una versión nueva.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Código</th>
                  <th className="px-2 py-2">Descripción</th>
                  <th className="px-2 py-2">Operativa</th>
                  <th className="px-2 py-2">Vigente desde</th>
                  <th className="px-2 py-2">Aprobada</th>
                </tr>
              </thead>
              <tbody>
                {reglas.map((r) => (
                  <tr key={r.id} className="border-b border-[#F1F5F9] align-top last:border-0">
                    <td className="px-2 py-2 font-mono text-xs text-gray-900">{r.codigo}</td>
                    <td className="px-2 py-2 text-gray-700">{r.descripcion}</td>
                    <td className="px-2 py-2">
                      {r.operativa ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Operativa</span>
                      ) : (
                        <span className="text-xs text-gray-500">compatibilidad</span>
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-gray-700">{fechaCorta(r.vigente_desde)}</td>
                    <td className="px-2 py-2 text-xs text-gray-500">
                      {r.aprobado_por_email ? `${r.aprobado_por_email} · ${fechaHora(r.aprobado_at)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Entidades pagadoras</h3>
          <p className="mt-1 text-xs text-gray-500">
            Las EPS y ARL de la matriz, con lo que hace falta para radicar. <strong>Umbral de días cobrables</strong>: desde
            cuántos días de incapacidad se reclama a esa entidad (decisión 12.17; semilla 4 para EPS y 1 para ARL). Una
            incapacidad por debajo del umbral no se radica sin excepción registrada.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Entidad</th>
                  <th className="px-2 py-2">Clase</th>
                  <th className="px-2 py-2">NIT</th>
                  <th className="px-2 py-2">Vigente desde</th>
                  <th className="px-2 py-2">Vigente hasta</th>
                  <th className="px-2 py-2 text-right">Umbral (días)</th>
                  <th className="px-2 py-2 text-right">Usos</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entidades.map((x) => (
                  <tr key={x.id} className={`border-b border-[#F1F5F9] align-middle last:border-0 ${x.activo ? "" : "opacity-60"}`}>
                    <td className="px-2 py-2">
                      <div className="font-medium text-gray-900">{x.nombre}</div>
                      <div className="text-xs text-gray-500">{x.tipo}{x.activo ? "" : " · inactiva"}</div>
                    </td>
                    <td className="px-2 py-2">
                      <select name="clase" form={`ent-${x.id}`} defaultValue={x.clase ?? ""} className={`${inputCls} w-24`}>
                        <option value="">—</option>
                        {CLASES_ENTIDAD.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input name="nit" form={`ent-${x.id}`} defaultValue={x.nit ?? ""} placeholder="800.000.000-1" className={`${inputCls} w-36`} />
                    </td>
                    <td className="px-2 py-2">
                      <input name="vigente_desde" form={`ent-${x.id}`} type="date" defaultValue={x.vigente_desde ?? ""} className={`${inputCls} w-40`} />
                    </td>
                    <td className="px-2 py-2">
                      <input name="vigente_hasta" form={`ent-${x.id}`} type="date" defaultValue={x.vigente_hasta ?? ""} className={`${inputCls} w-40`} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input name="dias_min_cobro" form={`ent-${x.id}`} type="number" min={0} max={365} defaultValue={x.dias_min_cobro ?? ""} className={`${inputCls} w-20 text-right`} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">{x.usos}</td>
                    <td className="px-2 py-2 text-right">
                      <form id={`ent-${x.id}`} action={actualizarEntidad}>
                        <input type="hidden" name="id" value={x.id} />
                        <button type="submit" className="h-8 rounded-md border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC]">
                          Guardar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
