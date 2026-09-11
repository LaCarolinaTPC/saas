import { AlertTriangle, Send } from "lucide-react";
import type { ExpedienteDetalle } from "@/lib/incapacidades/expedientes";
import { cop, fechaCorta, fechaHora } from "@/lib/incapacidades/formato";
import {
  bajoUmbral,
  colorRadicacion,
  etiquetaRadicacion,
  impedimentosParaRadicar,
} from "@/lib/incapacidades/radicacion-reglas";
import { accionAnularRadicacion, accionDevolver, accionMarcarRadicada, accionRadicar } from "./actions";

/**
 * Radicación ante la entidad (fase 4): la activa, las acciones que caben en
 * su estado y el historial. Componente puro salvo por las acciones.
 */

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
const labelCls = "mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-gray-500";
const btnCls = "h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800";
const btnSecCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]";

export function ChipRadicacion({ estado }: { estado: string }) {
  const c = colorRadicacion(estado);
  return (
    <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${c}1a`, color: c }}>
      {etiquetaRadicacion(estado)}
    </span>
  );
}

export function RadicacionPanel({ d, hoy, puedeEditar }: { d: ExpedienteDetalle; hoy: string; puedeEditar: boolean }) {
  const v = d.vista;
  const activa = d.radicaciones.find((r) => r.estado === "solicitada" || r.estado === "radicada") ?? null;
  const impedimentos = impedimentosParaRadicar(v);
  const esBajoUmbral = bajoUmbral(v);
  const oculto = (
    <>
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="version" value={v.version} />
    </>
  );

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4" style={{ borderTop: "3px solid #0891B2" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Radicación ante la entidad</h3>
        <span className="text-[11px] uppercase tracking-wide text-[#0891B2]">Cobro</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        «Cobrada» significa que existe una radicación con código de la entidad. El código es único por entidad; una
        devolución permite radicar otra vez; una anulación conserva la evidencia.
      </p>

      {/* Activa */}
      <div className="mt-3 rounded-lg bg-[#F8FAFC] p-3 text-sm">
        {activa ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <ChipRadicacion estado={activa.estado} />
            <span className="text-gray-900">{v.entidad_nombre ?? "—"}</span>
            <span className="tabular-nums text-gray-700">solicitada {fechaCorta(activa.fecha_solicitud)}</span>
            {activa.fecha_radicacion && <span className="tabular-nums text-gray-700">radicada {fechaCorta(activa.fecha_radicacion)}</span>}
            {activa.codigo_radicacion && <span className="font-mono text-xs text-gray-900">{activa.codigo_radicacion}</span>}
            <span className="tabular-nums font-medium text-gray-900">{cop(activa.valor_reclamado)}</span>
            {activa.bajo_umbral && <span className="text-xs text-amber-700">bajo umbral · {activa.excepcion_motivo}</span>}
          </div>
        ) : (
          <span className="text-xs italic text-gray-400">Sin radicación activa.</span>
        )}
      </div>

      {puedeEditar && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Nueva radicación */}
          {!activa && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Solicitar o radicar</h4>
              {impedimentos.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {impedimentos.map((i) => (
                    <li key={i.campo} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {i.mensaje}</li>
                  ))}
                </ul>
              ) : (
                <form action={accionRadicar} className="mt-2 space-y-3">
                  {oculto}
                  <p className="text-xs text-gray-600">
                    Se reclama <strong className="text-gray-900">{cop(v.valor_reclamado)}</strong> a {v.entidad_nombre} por{" "}
                    {v.dias_entidad_ajustados ?? v.dias_entidad ?? "—"} día(s) a cargo.
                  </p>
                  {esBajoUmbral && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      <p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Por debajo del umbral</p>
                      <p className="mt-0.5">
                        La incapacidad tiene {v.dias_incapacidad ?? "—"} día(s) y {v.entidad_nombre ?? "la entidad"} reclama desde{" "}
                        {v.entidad_dias_min_cobro ?? "—"}. Radicar exige una excepción escrita.
                      </p>
                      <input name="excepcion_motivo" placeholder="Motivo de la excepción (mínimo 10 caracteres)" className={`${inputCls} mt-2`} required minLength={10} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={labelCls}>Fecha de solicitud</span>
                      <input name="fecha_solicitud" type="date" defaultValue={hoy} required className={inputCls} />
                    </label>
                    <label className="block">
                      <span className={labelCls}>Fecha de radicación</span>
                      <input name="fecha_radicacion" type="date" className={inputCls} />
                    </label>
                  </div>
                  <label className="block">
                    <span className={labelCls}>Código de radicación (si la entidad ya lo devolvió)</span>
                    <input name="codigo_radicacion" placeholder="RAD-2026-000123" className={inputCls} />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Observaciones</span>
                    <input name="observaciones" className={inputCls} />
                  </label>
                  <button type="submit" className={`${btnCls} inline-flex items-center gap-1.5`}>
                    <Send className="h-4 w-4" /> Registrar
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Acciones sobre la activa */}
          {activa && (
            <div className="space-y-4">
              {activa.estado === "solicitada" && (
                <form action={accionMarcarRadicada} className="space-y-3">
                  {oculto}
                  <input type="hidden" name="radicacion_id" value={activa.id} />
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">La entidad devolvió el código</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={labelCls}>Código</span>
                      <input name="codigo_radicacion" required className={inputCls} />
                    </label>
                    <label className="block">
                      <span className={labelCls}>Fecha de radicación</span>
                      <input name="fecha_radicacion" type="date" defaultValue={hoy} required className={inputCls} />
                    </label>
                  </div>
                  <button type="submit" className={btnCls}>Marcar radicada</button>
                </form>
              )}
              <form action={accionDevolver} className="space-y-2">
                {oculto}
                <input type="hidden" name="radicacion_id" value={activa.id} />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">La entidad la devolvió</h4>
                <input name="motivo" placeholder="Motivo de la devolución (mínimo 5 caracteres)" required minLength={5} className={inputCls} />
                <button type="submit" className={btnSecCls}>Marcar devuelta</button>
              </form>
            </div>
          )}
          {activa && (
            <form action={accionAnularRadicacion} className="space-y-2">
              {oculto}
              <input type="hidden" name="radicacion_id" value={activa.id} />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Error de captura</h4>
              <input name="motivo" placeholder="Motivo de la anulación (mínimo 5 caracteres)" required minLength={5} className={inputCls} />
              <button type="submit" className={`${btnSecCls} text-red-700`}>Anular radicación</button>
            </form>
          )}
        </div>
      )}

      {/* Historial */}
      {d.radicaciones.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Historial de radicaciones</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {d.radicaciones.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[#F1F5F9] pb-1 last:border-0">
                <ChipRadicacion estado={r.estado} />
                <span className="tabular-nums text-gray-700">{fechaCorta(r.fecha_solicitud)}{r.fecha_radicacion ? ` → ${fechaCorta(r.fecha_radicacion)}` : ""}</span>
                {r.codigo_radicacion && <span className="font-mono text-xs text-gray-900">{r.codigo_radicacion}</span>}
                <span className="tabular-nums text-gray-900">{cop(r.valor_reclamado)}</span>
                {r.motivo_devolucion && <span className="text-xs text-amber-700">devuelta: {r.motivo_devolucion}</span>}
                {r.motivo_anulacion && <span className="text-xs text-gray-500">anulada: {r.motivo_anulacion}</span>}
                <span className="text-xs text-gray-400">{r.registrada_por_email ?? ""} · {fechaHora(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
