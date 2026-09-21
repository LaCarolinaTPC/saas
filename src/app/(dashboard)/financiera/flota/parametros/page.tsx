import { Landmark } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { leerParametrosConRastro, type ParametroConRastro } from "@/lib/financiera/consulta";
import { listarPeriodos, type PeriodoFila } from "@/lib/financiera/consolidacion";
import { ESTADO_PERIODO, cop, decimal, entero, fechaHora, nombrePeriodo, porcentaje } from "@/lib/financiera/formato";
import { Fallo, SinAcceso } from "../../sin-acceso";
import { pestanasPermitidas } from "../marco";
import { Pestanas } from "../filtros";
import { actualizarUmbrales, reabrir } from "./actions";

export const dynamic = "force-dynamic";

const inputCls = "h-8 w-28 rounded-md border border-[#E2E8F0] bg-white px-2 text-sm tabular-nums text-gray-900 outline-none focus:border-[#94A3B8]";

const AYUDA: Record<string, string> = {
  rentabilidad:
    "Se aplica a la rentabilidad ponderada de cada vehículo. Solo se puede clasificar un vehículo que tenga el archivo contable de todos sus meses.",
  gasto_timbrada:
    "En pesos por timbrada. Ojo: el pasaje subió ~10 % en 2026, así que un umbral en pesos fijos envejece; el plan (6.3.1) propone evaluarlo como porcentaje del ingreso por timbrada.",
  productividad:
    "Viajes por vehículo-mes. Es el único indicador exacto sin archivo contable. Con 90/80 la flota no alcanza el verde en ningún mes: promedia 77 viajes por bus-mes.",
};

/**
 * Parámetros de Gestión de flota: los umbrales de semáforo y la reapertura de
 * períodos cerrados. Ambas cosas son del administrador (`fin_parametros` está
 * en SUBS_SOLO_ADMIN): mueven lo que se reporta a Subgerencia.
 */
export default async function ParametrosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_parametros")) {
    return (
      <SinAcceso
        titulo="Parámetros de Gestión de flota"
        motivo="Los umbrales de semáforo y la reapertura de períodos los cambia solo el administrador: mueven las cifras que ve todo el módulo."
      />
    );
  }

  const sp = await searchParams;
  let parametros: ParametroConRastro[] = [];
  let periodos: PeriodoFila[] = [];
  let fallo: string | null = null;
  try {
    [parametros, periodos] = await Promise.all([leerParametrosConRastro(), listarPeriodos()]);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  const cerrados = periodos.filter((p) => p.estado === "cerrado");
  const reabiertos = periodos.filter((p) => p.estado === "reabierto");

  const formato = (ind: string, v: number) => (ind === "rentabilidad" ? porcentaje(v) : ind === "gasto_timbrada" ? cop(v) : decimal(v, 0));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Parámetros de Gestión de flota"
        icono={Landmark}
        descripcion="Umbrales de semáforo y reapertura de períodos cerrados. Solo el administrador."
        pie={
          <div className="mt-2">
            <Pestanas pestanas={pestanasPermitidas(perms)} />
          </div>
        }
      />
      <div className="mx-auto max-w-[1100px] space-y-4 p-4 sm:p-6">
        {fallo && <Fallo mensaje={fallo} />}
        {sp.error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{sp.error}</div>}
        {sp.ok === "umbrales" && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Umbrales actualizados. El cambio quedó en la bitácora.</div>}
        {sp.ok === "sin_cambios" && <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-gray-600">No cambiaste ningún valor.</div>}
        {sp.ok === "reabierto" && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Período reabierto. Se guardó una copia de sus cifras y se recalculará en la siguiente corrida.</div>}

        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Umbrales de semáforo</h2>
            <p className="text-xs text-gray-500">
              Vienen del aplicativo de Lovable, donde estaban escritos en el código. Cambiarlos reclasifica todos los vehículos del
              módulo; el valor anterior queda en Auditoría.
            </p>
          </div>
          <ul className="divide-y divide-[#F1F5F9]">
            {parametros.map((p) => (
              <li key={p.indicador} className="p-4">
                <form action={actualizarUmbrales} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="indicador" value={p.indicador} />
                  <div className="min-w-[240px] flex-1">
                    <p className="text-sm font-medium text-gray-900">{p.etiqueta}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{AYUDA[p.indicador]}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {p.mayorEsMejor ? "Mayor es mejor" : "Menor es mejor"} · unidad {p.unidad} · hoy: excelente{" "}
                      {formato(p.indicador, p.umbralExcelente)}, aceptable {formato(p.indicador, p.umbralAceptable)}
                      {p.updatedAt && ` · último cambio ${fechaHora(p.updatedAt)}${p.actualizadoPorEmail ? ` por ${p.actualizadoPorEmail}` : ""}`}
                    </p>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      🟢 Excelente {p.mayorEsMejor ? "≥" : "≤"}
                    </span>
                    <input name="excelente" defaultValue={String(p.umbralExcelente)} className={inputCls} inputMode="decimal" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      🟡 Aceptable {p.mayorEsMejor ? "≥" : "≤"}
                    </span>
                    <input name="aceptable" defaultValue={String(p.umbralAceptable)} className={inputCls} inputMode="decimal" />
                  </label>
                  <button type="submit" className="h-8 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]">
                    Guardar
                  </button>
                </form>
              </li>
            ))}
            {parametros.length === 0 && !fallo && (
              <li className="px-4 py-6 text-center text-sm text-gray-500">No hay parámetros cargados.</li>
            )}
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Reabrir un período cerrado</h2>
            <p className="text-xs text-gray-500">
              Un mes cerrado no se recalcula ni admite cambios en su archivo contable. Reabrirlo guarda una copia de las cifras
              actuales, lo vuelve a poner en la corrida diaria y deja el motivo en la bitácora. GEMA lo cerrará de nuevo.
            </p>
          </div>
          <div className="p-4">
            {cerrados.length === 0 ? (
              <p className="text-sm text-gray-500">No hay períodos cerrados.</p>
            ) : (
              <form action={reabrir} className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Período</span>
                  <select name="periodo" className="h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]">
                    {cerrados.map((p) => (
                      <option key={p.periodo} value={p.periodo}>
                        {nombrePeriodo(p.periodo)} — {p.vehiculos != null ? `${entero(p.vehiculos)} vehículos` : "sin consolidar"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[320px] flex-1 flex-col gap-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Motivo (obligatorio)</span>
                  <input
                    name="motivo"
                    required
                    minLength={10}
                    placeholder="Ej.: contabilidad corrigió los repuestos de tres vehículos"
                    className="h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]"
                  />
                </label>
                <button type="submit" className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-900 hover:bg-amber-100">
                  Reabrir
                </button>
              </form>
            )}

            {reabiertos.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Períodos reabiertos ahora mismo</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {reabiertos.map((p) => (
                    <li key={p.periodo}>
                      <span className="capitalize">{nombrePeriodo(p.periodo)}</span> · {p.motivoReapertura ?? "sin motivo"} ·{" "}
                      {p.reabiertoPorEmail ?? "—"} · {fechaHora(p.reabiertoAt)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">Se recalculan en cada corrida hasta que el marcador de GEMA los cierre otra vez.</p>
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Estado de los períodos</h2>
          </div>
          <div className="flex flex-wrap gap-1.5 p-4">
            {periodos.map((p) => {
              const est = ESTADO_PERIODO[p.estado];
              return (
                <span
                  key={p.periodo}
                  title={`${est.ayuda}${p.cerradoPor ? ` · ${p.cerradoPor}` : ""}`}
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${est.clase}`}
                >
                  {p.periodo}
                </span>
              );
            })}
            {periodos.length === 0 && <p className="text-sm text-gray-500">Todavía no hay períodos consolidados.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
