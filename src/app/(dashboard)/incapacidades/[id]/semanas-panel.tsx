import { AlertTriangle, BadgeCheck } from "lucide-react";
import type { ExpedienteDetalle } from "@/lib/incapacidades/expedientes";
import { fechaCorta, fechaHora } from "@/lib/incapacidades/formato";
import { REQUISITO_SEMANAS, faltanSemanas, mensajeSemanas } from "@/lib/incapacidades/semanas-reglas";
import { accionAcreditarSemanas, accionRetirarAcreditacion } from "./actions";

/**
 * Requisito de semanas cotizadas antes del inicio (solo EPS). Se muestra
 * cuando bloquea el cobro o cuando RRHH lo acreditó; a la ARL no le aplica y
 * al que cumple por la fecha no le hace falta.
 */

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
const labelCls = "mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-gray-500";
const btnCls = "h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800";
const btnSecCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-red-700 hover:bg-[#F8FAFC]";

export function SemanasPanel({ d, puedeEditar }: { d: ExpedienteDetalle; puedeEditar: boolean }) {
  const v = d.vista;
  const r = v.requisito_semanas;
  if (!r || r === "no_aplica" || r === "cumple") return null;
  const bloquea = faltanSemanas(v);
  const color = REQUISITO_SEMANAS[r].color;
  const soporte = d.adjuntos.find((a) => a.id === v.semanas_acreditadas_adjunto_id);
  const oculto = (
    <>
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="version" value={v.version} />
    </>
  );

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4" style={{ borderTop: `3px solid ${color}` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Semanas cotizadas antes del inicio</h3>
        <span className="text-[11px] uppercase tracking-wide" style={{ color }}>{REQUISITO_SEMANAS[r].label}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        La EPS paga la incapacidad de origen común solo si el trabajador cotizó {v.semanas_min_cotizacion ?? 4} semanas
        ininterrumpidas antes de su inicio (Decreto 1427 de 2022). Se presume con la fecha de vinculación del maestro; en
        la prórroga cuenta el inicio de la incapacidad inicial.
      </p>

      <dl className="mt-3 grid gap-x-6 gap-y-1 rounded-lg bg-[#F8FAFC] p-3 text-sm sm:grid-cols-3">
        <div><dt className={labelCls}>Vinculación</dt><dd className="tabular-nums text-gray-900">{v.fecha_vinculacion ? fechaCorta(v.fecha_vinculacion) : "sin dato en el maestro"}</dd></div>
        <div><dt className={labelCls}>Inicio que cuenta</dt><dd className="tabular-nums text-gray-900">{v.inicio_cadena ? fechaCorta(v.inicio_cadena) : "—"}</dd></div>
        <div><dt className={labelCls}>Días antes del inicio</dt><dd className="tabular-nums text-gray-900">{v.dias_previos_vinculacion ?? "—"} de {(v.semanas_min_cotizacion ?? 4) * 7}</dd></div>
      </dl>

      {bloquea && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {mensajeSemanas(v)} No se habilita para cobro.
        </p>
      )}

      {r === "acreditado" && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <BadgeCheck className="h-4 w-4 self-center text-[#0891B2]" />
          <span className="text-gray-900">{v.semanas_acreditadas_motivo}</span>
          <span className="text-xs text-gray-500">soporte: {soporte?.archivo_nombre ?? "—"}</span>
          <span className="text-xs text-gray-400">{v.semanas_acreditadas_por_email ?? ""}{v.semanas_acreditadas_at ? ` · ${fechaHora(v.semanas_acreditadas_at)}` : ""}</span>
        </div>
      )}

      {puedeEditar && bloquea && (
        d.adjuntos.length === 0 ? (
          <p className="mt-3 text-xs text-gray-600">
            Si el trabajador cotizaba con otro empleador sin interrupción, cargue el certificado de semanas de la EPS en
            Soportes y vuelva aquí para acreditarlo.
          </p>
        ) : (
          <form action={accionAcreditarSemanas} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {oculto}
            <label className="block">
              <span className={labelCls}>Soporte (certificado de la EPS)</span>
              <select name="adjunto_id" required className={inputCls} defaultValue="">
                <option value="" disabled>Elija un soporte cargado</option>
                {d.adjuntos.map((a) => <option key={a.id} value={a.id}>{a.archivo_nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Motivo</span>
              <input name="motivo" required minLength={10} placeholder="Cotizaba con otro empleador desde…" className={inputCls} />
            </label>
            <button type="submit" className={btnCls}>Acreditar semanas</button>
          </form>
        )
      )}

      {puedeEditar && v.semanas_acreditadas_at && (
        <form action={accionRetirarAcreditacion} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          {oculto}
          <label className="block">
            <span className={labelCls}>Retirar la acreditación</span>
            <input name="motivo" required minLength={5} placeholder="Motivo del retiro (mínimo 5 caracteres)" className={inputCls} />
          </label>
          <button type="submit" className={btnSecCls}>Retirar</button>
        </form>
      )}
    </section>
  );
}
