import Link from "next/link";
import { AlertTriangle, Lock, Unlock } from "lucide-react";
import type { ExpedienteVista } from "@/lib/incapacidades/expedientes";
import { cop, fechaCorta, fechaHora } from "@/lib/incapacidades/formato";
import { ESTADOS_CONCILIACION, TIPOS_AJUSTE, type Saldo } from "@/lib/incapacidades/recaudo-reglas";
import type { AjusteMonetarioFila, AplicacionFila } from "@/lib/incapacidades/recaudos";
import { accionAjusteMonetario, accionAnularAjusteMonetario, accionAnularAplicacion, accionCerrar, accionReabrir } from "./actions";

/**
 * Saldo operativo con sus componentes, recaudos aplicados, ajustes monetarios
 * y cierre (fase 5). Componente puro salvo por las acciones.
 */

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
const labelCls = "mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-gray-500";
const btnCls = "h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800";
const btnSecCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]";

export function ChipConciliacion({ estado }: { estado: Saldo["estado"] }) {
  const e = ESTADOS_CONCILIACION[estado];
  return (
    <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${e.color}1a`, color: e.color }} title={`Legado Excel: ${e.legado}`}>
      {e.label}
    </span>
  );
}

function Componente({ label, valor, signo }: { label: string; valor: number | null; signo?: "−" | "=" }) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] p-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{signo ? `${signo} ` : ""}{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{valor == null ? <span className="text-sm italic text-gray-400">pendiente</span> : cop(valor)}</p>
    </div>
  );
}

export function SaldoPanel({
  v,
  saldo,
  tolerancia,
  aplicaciones,
  ajustes,
  puedeEditar,
}: {
  v: ExpedienteVista;
  saldo: Saldo;
  tolerancia: number;
  aplicaciones: AplicacionFila[];
  ajustes: AjusteMonetarioFila[];
  puedeEditar: boolean;
}) {
  const oculto = (
    <>
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="version" value={v.version} />
    </>
  );
  const cerrado = v.estado === "cerrado";
  const puedeMover = puedeEditar && ["radicado", "con_recaudo", "conciliado"].includes(v.estado);

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4" style={{ borderTop: "3px solid #059669" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Recaudos y saldo</h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ChipConciliacion estado={saldo.estado} />
          <span>tolerancia {cop(tolerancia)}</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Saldo operativo = valor reclamado − abonos aplicados − ajustes que extinguen saldo. La base exigible sigue por confirmar
        (decisión 12.5); por eso los tres componentes se muestran siempre por separado. Un abono parcial no cierra.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Componente label="Valor reclamado" valor={v.valor_reclamado} />
        <Componente label="Abonos aplicados" valor={Number(v.abonos_aplicados ?? 0)} signo="−" />
        <Componente label="Ajustes que extinguen" valor={Number(v.ajustes_saldo ?? 0)} signo="−" />
        <div className="rounded-lg p-3" style={{ background: `${ESTADOS_CONCILIACION[saldo.estado].color}14` }}>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">= Saldo operativo</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: ESTADOS_CONCILIACION[saldo.estado].color }}>
            {saldo.estado === "sin_base" ? <span className="text-sm italic text-gray-400">sin valor reclamado</span> : cop(saldo.saldo)}
          </p>
          {saldo.estado === "sobrepago" && <p className="text-xs text-violet-700">La entidad giró más de lo reclamado.</p>}
        </div>
      </div>

      {cerrado && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Cerrado {fechaHora(v.cerrado_at)}{v.cerrado_por_email ? ` por ${v.cerrado_por_email}` : ""}{v.cierre_por_excepcion ? " · por excepción" : ""}</p>
            {v.motivo_cierre && <p className="text-xs text-gray-600">{v.motivo_cierre}</p>}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Aplicaciones */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Recaudos aplicados</h4>
          {aplicaciones.length === 0 ? (
            <p className="mt-2 text-xs italic text-gray-400">
              Ningún recaudo aplicado.{" "}
              {v.radicacion_estado === "radicada" && <Link href="/incapacidades/recaudos" className="not-italic text-[#0F766E] underline">Aplicar desde Recaudos</Link>}
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {aplicaciones.map((a) => (
                <li key={a.id} className={`rounded-lg bg-[#F8FAFC] p-2 ${a.anulada_at ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="tabular-nums font-medium text-gray-900">{cop(a.valor_aplicado)}</span>
                    <span className="text-xs text-gray-500">giro {fechaCorta(a.fecha_giro)}{a.referencia ? ` · ${a.referencia}` : ""}{a.entidad_nombre ? ` · ${a.entidad_nombre}` : ""}</span>
                  </div>
                  <div className="text-xs text-gray-500">{a.aplicado_por_email ?? ""} · {fechaHora(a.created_at)}{a.anulada_at ? ` · anulada: ${a.motivo_anulacion}` : ""}</div>
                  {!a.anulada_at && puedeEditar && !cerrado && (
                    <form action={accionAnularAplicacion} className="mt-1 flex gap-2">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="aplicacion_id" value={a.id} />
                      <input name="motivo" placeholder="Motivo de la anulación" required minLength={5} className="h-8 flex-1 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs" />
                      <button type="submit" className="h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs text-red-700">Anular</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ajustes monetarios */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Ajustes monetarios</h4>
          {ajustes.length === 0 ? (
            <p className="mt-2 text-xs italic text-gray-400">Sin ajustes.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {ajustes.map((a) => (
                <li key={a.id} className={`rounded-lg bg-[#F8FAFC] p-2 ${a.anulado_at ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900">{TIPOS_AJUSTE.find((t) => t.key === a.tipo)?.label ?? a.tipo}</span>
                    <span className="tabular-nums font-medium text-gray-900">{Number(a.valor) < 0 ? "−" : ""}{cop(Math.abs(Number(a.valor)))}{!a.extingue_saldo && <span className="ml-1 text-xs font-normal text-gray-500">no extingue</span>}</span>
                  </div>
                  <div className="text-xs text-gray-500">{a.motivo} · {a.autorizado_por_email ?? ""} · {fechaHora(a.created_at)}{a.anulado_at ? ` · anulado: ${a.motivo_anulacion}` : ""}</div>
                  {!a.anulado_at && puedeEditar && !cerrado && (
                    <form action={accionAnularAjusteMonetario} className="mt-1 flex gap-2">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="ajuste_id" value={a.id} />
                      <input name="motivo" placeholder="Motivo de la anulación" required minLength={5} className="h-8 flex-1 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs" />
                      <button type="submit" className="h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs text-red-700">Anular</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {puedeMover && (
            <form action={accionAjusteMonetario} className="mt-3 space-y-2 rounded-lg border border-dashed border-[#E2E8F0] p-3">
              {oculto}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelCls}>Tipo</span>
                  <select name="tipo" className={inputCls} defaultValue="glosa_aceptada">
                    {TIPOS_AJUSTE.map((t) => <option key={t.key} value={t.key} title={t.ayuda}>{t.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={labelCls}>Valor (− aumenta el saldo)</span>
                  <input name="valor" inputMode="numeric" placeholder="5.000" required className={inputCls} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" name="extingue_saldo" defaultChecked /> Extingue saldo (entra al saldo operativo)
              </label>
              <input name="motivo" placeholder="Motivo del ajuste (mínimo 5 caracteres)" required minLength={5} className={inputCls} />
              <button type="submit" className={btnSecCls}>Registrar ajuste</button>
            </form>
          )}
        </div>
      </div>

      {/* Cierre */}
      {puedeEditar && (puedeMover || cerrado) && (
        <div className="mt-4 border-t border-[#F1F5F9] pt-3">
          {cerrado ? (
            <form action={accionReabrir} className="flex flex-wrap items-end gap-3">
              {oculto}
              <label className="block flex-1">
                <span className={labelCls}>Motivo para reabrir</span>
                <input name="motivo" required minLength={5} className={inputCls} />
              </label>
              <button type="submit" className={`${btnSecCls} inline-flex items-center gap-1.5`}><Unlock className="h-4 w-4" /> Reabrir</button>
            </form>
          ) : (
            <form action={accionCerrar} className="flex flex-wrap items-end gap-3">
              {oculto}
              <div className="flex-1">
                <span className={labelCls}>{saldo.dentroTolerancia ? "Motivo (opcional)" : "Excepción aprobada (obligatoria: hay saldo)"}</span>
                <input name="motivo" required={!saldo.dentroTolerancia} minLength={saldo.dentroTolerancia ? undefined : 10} placeholder={saldo.dentroTolerancia ? "Conciliado" : "Por qué se cierra con saldo (mínimo 10 caracteres)"} className={inputCls} />
              </div>
              <button type="submit" className={`${btnCls} inline-flex items-center gap-1.5`}><Lock className="h-4 w-4" /> Cerrar expediente</button>
              {!saldo.dentroTolerancia && (
                <p className="flex w-full items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> El saldo es {cop(saldo.saldo)}: cerrar sin conciliar queda marcado como excepción.</p>
              )}
            </form>
          )}
        </div>
      )}
    </section>
  );
}
