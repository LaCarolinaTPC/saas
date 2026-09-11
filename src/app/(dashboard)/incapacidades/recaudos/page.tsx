import Link from "next/link";
import { Banknote } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaBandeja } from "@/lib/incapacidades/auditoria";
import { listarEntidades, type EntidadCatalogo, type ExpedienteVista } from "@/lib/incapacidades/expedientes";
import { cop, fechaCorta, fechaHora } from "@/lib/incapacidades/formato";
import { MEDIOS_RECAUDO, calcularSaldo } from "@/lib/incapacidades/recaudo-reglas";
import {
  aplicacionesDeRecaudo,
  expedientesAplicables,
  leerTolerancia,
  listarRecaudos,
  type AplicacionFila,
  type RecaudoVista,
} from "@/lib/incapacidades/recaudos";
import { Fallo, SinAcceso } from "../sin-acceso";
import { accionAnularRecaudo, accionAplicarRecaudo, accionRegistrarRecaudo } from "./actions";

export const dynamic = "force-dynamic";

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
const labelCls = "mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-gray-500";

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/**
 * Recaudos (plan, pantalla 5): registrar el giro de la entidad, ver lo que
 * queda sin aplicar y aplicarlo a los expedientes radicados ante ella.
 */
export default async function RecaudosPage({
  searchParams,
}: {
  searchParams: Promise<{ recaudo?: string; entidad?: string; ok?: string; error?: string; todos?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso titulo="Recaudos" />;
  const sp = await searchParams;
  const UUID_RE = /^[0-9a-f-]{36}$/i;
  const entidadFiltro = sp.entidad && UUID_RE.test(sp.entidad) ? sp.entidad : null;
  const seleccionado = sp.recaudo && UUID_RE.test(sp.recaudo) ? sp.recaudo : null;

  let recaudos: RecaudoVista[] = [];
  let entidades: EntidadCatalogo[] = [];
  let tolerancia = 0;
  let aplicaciones: AplicacionFila[] = [];
  let aplicables: ExpedienteVista[] = [];
  let fallo: string | null = null;
  try {
    [recaudos, entidades, tolerancia] = await Promise.all([
      listarRecaudos({ entidad: entidadFiltro, soloConSaldo: sp.todos !== "1" }),
      listarEntidades(),
      leerTolerancia(),
    ]);
    const sel = recaudos.find((r) => r.id === seleccionado);
    if (sel) {
      [aplicaciones, aplicables] = await Promise.all([aplicacionesDeRecaudo(sel.id), expedientesAplicables(sel.entidad_catalogo_id)]);
    }
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!fallo) {
    await auditarConsultaBandeja({ filtros: { bandeja: "recaudos", entidad: entidadFiltro, recaudo: seleccionado }, filas: recaudos.length, rol: perms.userType, userEmail: perms.userEmail });
  }
  const sel = recaudos.find((r) => r.id === seleccionado) ?? null;
  const sinAplicar = recaudos.reduce((s, r) => s + Number(r.sin_aplicar), 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Recaudos de las entidades"
        icono={Banknote}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        descripcion="Cada giro de una EPS o ARL se registra una vez y se aplica a los expedientes radicados ante ella. Lo que queda sin aplicar es visible."
      />
      <div className="space-y-4 p-6">
        {fallo && <Fallo mensaje={fallo} />}
        {sp.error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{sp.error}</div>}
        {sp.ok && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</div>}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Registrar */}
          {perms.puedeEditar && (
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4" style={{ borderTop: "3px solid #059669" }}>
              <h3 className="text-sm font-semibold text-gray-900">Registrar un giro</h3>
              <form action={accionRegistrarRecaudo} className="mt-3 space-y-3">
                <label className="block">
                  <span className={labelCls}>Entidad que giró</span>
                  <select name="entidad_catalogo_id" required className={inputCls} defaultValue={entidadFiltro ?? ""}>
                    <option value="">— elige —</option>
                    {entidades.filter((e) => e.activo).map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.clase ?? e.tipo}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelCls}>Fecha de giro</span>
                    <input name="fecha_giro" type="date" required defaultValue={hoyBogota()} className={inputCls} />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Valor (COP)</span>
                    <input name="valor" inputMode="numeric" required placeholder="1.250.000" className={inputCls} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelCls}>Referencia</span>
                    <input name="referencia" placeholder="nº transferencia" className={inputCls} />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Medio</span>
                    <select name="medio" className={inputCls} defaultValue="transferencia">
                      {MEDIOS_RECAUDO.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className={labelCls}>Observaciones</span>
                  <input name="observaciones" className={inputCls} />
                </label>
                <button type="submit" className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">Registrar giro</button>
              </form>
            </section>
          )}

          {/* Lista */}
          <section className={`rounded-xl border border-[#E2E8F0] bg-white ${perms.puedeEditar ? "lg:col-span-2" : "lg:col-span-3"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-900">Giros {sp.todos === "1" ? "registrados" : "con valor sin aplicar"}</h3>
              <form method="get" className="flex flex-wrap items-center gap-2 text-xs">
                <select name="entidad" defaultValue={entidadFiltro ?? ""} className="h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs">
                  <option value="">Todas las entidades</option>
                  {entidades.filter((e) => e.activo).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
                <label className="flex items-center gap-1 text-gray-600"><input type="checkbox" name="todos" value="1" defaultChecked={sp.todos === "1"} /> incluir aplicados del todo</label>
                <button type="submit" className="h-8 rounded-md bg-gray-900 px-3 text-xs font-medium text-white">Filtrar</button>
                <span className="tabular-nums text-gray-600">sin aplicar: <strong className="text-gray-900">{cop(sinAplicar)}</strong></span>
              </form>
            </div>
            {recaudos.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">Ningún giro con estos filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2">Giro</th>
                      <th className="px-3 py-2">Entidad</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2 text-right">Aplicado</th>
                      <th className="px-3 py-2 text-right">Sin aplicar</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recaudos.map((r) => (
                      <tr key={r.id} className={`border-t border-[#F1F5F9] ${r.id === seleccionado ? "bg-[#EEF7F8]" : "hover:bg-[#F8FAFC]"}`}>
                        <td className="px-4 py-2">
                          <div className="tabular-nums text-gray-900">{fechaCorta(r.fecha_giro)}{r.referencia ? <span className="ml-2 font-mono text-xs text-gray-600">{r.referencia}</span> : null}</div>
                          <div className="text-xs text-gray-500">{r.medio ?? "—"} · {r.registrado_por_email ?? ""}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-900">{r.entidad_nombre}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{cop(r.valor)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{cop(r.aplicado)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: Number(r.sin_aplicar) > 0 ? "#B45309" : "#059669" }}>{cop(r.sin_aplicar)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/incapacidades/recaudos?recaudo=${r.id}${entidadFiltro ? `&entidad=${entidadFiltro}` : ""}${sp.todos === "1" ? "&todos=1" : ""}`} className="text-xs text-[#0F766E] underline">
                            {r.id === seleccionado ? "seleccionado" : "aplicar / ver"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Detalle del seleccionado */}
        {sel && (
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                Giro de {sel.entidad_nombre} · {fechaCorta(sel.fecha_giro)}{sel.referencia ? ` · ${sel.referencia}` : ""}
              </h3>
              <span className="text-sm tabular-nums text-gray-700">{cop(sel.valor)} · aplicado {cop(sel.aplicado)} · <strong style={{ color: Number(sel.sin_aplicar) > 0 ? "#B45309" : "#059669" }}>sin aplicar {cop(sel.sin_aplicar)}</strong></span>
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Aplicaciones</h4>
                {aplicaciones.length === 0 ? <p className="mt-2 text-xs italic text-gray-400">Todavía no se ha aplicado.</p> : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {aplicaciones.map((a) => (
                      <li key={a.id} className={`flex flex-wrap items-baseline justify-between gap-2 border-b border-[#F1F5F9] pb-1 last:border-0 ${a.anulada_at ? "opacity-60" : ""}`}>
                        <Link href={`/incapacidades/${a.expediente_id}`} className="text-gray-900 hover:underline">{a.expediente_nombre ?? a.expediente_cedula ?? a.expediente_id}</Link>
                        <span className="tabular-nums">{cop(a.valor_aplicado)}</span>
                        <span className="w-full text-xs text-gray-500">{a.aplicado_por_email ?? ""} · {fechaHora(a.created_at)}{a.anulada_at ? ` · anulada: ${a.motivo_anulacion}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {perms.puedeEditar && !sel.anulado_at && sel.aplicaciones === 0 && (
                  <form action={accionAnularRecaudo} className="mt-3 flex gap-2">
                    <input type="hidden" name="recaudo_id" value={sel.id} />
                    <input name="motivo" placeholder="Motivo de la anulación del giro" required minLength={5} className="h-8 flex-1 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs" />
                    <button type="submit" className="h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs text-red-700">Anular giro</button>
                  </form>
                )}
              </div>

              {perms.puedeEditar && !sel.anulado_at && Number(sel.sin_aplicar) > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Aplicar a un expediente radicado ante {sel.entidad_nombre}</h4>
                  {aplicables.length === 0 ? (
                    <p className="mt-2 text-xs italic text-gray-400">No hay expedientes radicados ante esta entidad pendientes de recaudo.</p>
                  ) : (
                    <form action={accionAplicarRecaudo} className="mt-2 space-y-3">
                      <input type="hidden" name="recaudo_id" value={sel.id} />
                      <label className="block">
                        <span className={labelCls}>Expediente</span>
                        <select name="expediente_id" required className={inputCls}>
                          <option value="">— elige —</option>
                          {aplicables.map((e) => {
                            const s = calcularSaldo({ valorReclamado: e.valor_reclamado, abonos: Number(e.abonos_aplicados ?? 0), ajustes: Number(e.ajustes_saldo ?? 0) }, tolerancia);
                            return (
                              <option key={e.id} value={e.id}>
                                {e.nombre ?? e.cedula} · {e.radicacion_codigo ?? "sin código"} · reclamado {cop(e.valor_reclamado)} · saldo {cop(s.saldo)}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="block flex-1">
                          <span className={labelCls}>Valor a aplicar (máx. {cop(sel.sin_aplicar)})</span>
                          <input name="valor" inputMode="numeric" required defaultValue={Math.round(Number(sel.sin_aplicar))} className={inputCls} />
                        </label>
                        <button type="submit" className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">Aplicar</button>
                      </div>
                      <p className="text-xs text-gray-500">Se puede aplicar parte a un expediente y el resto a otros. Un abono parcial deja el expediente en «con recaudo»; no lo cierra.</p>
                    </form>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
