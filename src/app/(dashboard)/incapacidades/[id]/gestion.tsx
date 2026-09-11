import { AlertTriangle, Calculator, CheckCircle2 } from "lucide-react";
import type { EntidadCatalogo, ExpedienteDetalle } from "@/lib/incapacidades/expedientes";
import type { SugerenciaSalario, TipoOrigen } from "@/lib/incapacidades/liquidacion";
import type { Faltante } from "@/lib/incapacidades/liquidacion-reglas";
import { PROCEDENCIA, cop, fechaCorta } from "@/lib/incapacidades/formato";
import { accionAceptarSugerencia, accionCompletar, accionHomologar, accionLiquidar, accionSobrescribir } from "./actions";

/**
 * Panel de gestión de la etapa 2 (fase 3): completar, homologar, sobrescribir
 * y liquidar. Componente puro salvo por las acciones que enlaza; los
 * formularios llevan la versión leída para detectar ediciones concurrentes.
 */

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8] disabled:bg-[#F8FAFC]";
const labelCls = "mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-gray-500";
const btnCls = "h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800";

function Tarjeta({ titulo, procedencia, children, nota }: { titulo: string; procedencia: keyof typeof PROCEDENCIA; children: React.ReactNode; nota?: React.ReactNode }) {
  const p = PROCEDENCIA[procedencia];
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4" style={{ borderTop: `3px solid ${p.color}` }}>
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {nota && <p className="mt-1 text-xs text-gray-500">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Motivo({ texto }: { texto: string }) {
  return (
    <label className="block">
      <span className={labelCls}>Motivo</span>
      <input name="motivo" placeholder={texto} className={inputCls} />
    </label>
  );
}

export function GestionExpediente({
  d,
  sugerencia,
  entidades,
  tipos,
  faltantes,
  mensajes,
}: {
  d: ExpedienteDetalle;
  sugerencia: SugerenciaSalario | null;
  entidades: EntidadCatalogo[];
  tipos: TipoOrigen[];
  faltantes: Faltante[];
  mensajes: { ok?: string; error?: string; aviso?: string };
}) {
  const v = d.vista;
  const oculto = (
    <>
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="version" value={v.version} />
    </>
  );
  const modalidadMatriz = (v.indicador_prorroga ?? "").toUpperCase();
  const liq = d.liquidaciones.find((l) => l.es_vigente) ?? null;

  return (
    <div id="gestion" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-gray-900 pt-4">
        <h2 className="text-base font-semibold text-gray-900">Gestión del expediente · etapa 2</h2>
        <span className="text-xs text-gray-500">Versión {v.version}. Si alguien más lo edita a la vez, el guardado se rechaza y hay que recargar.</span>
      </div>

      {mensajes.error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{mensajes.error}</span>
        </div>
      )}
      {mensajes.ok && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{mensajes.ok}</span>
        </div>
      )}
      {mensajes.aviso && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{mensajes.aviso}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Completar ── */}
        <Tarjeta titulo="Completar datos" procedencia="completado"
          nota="El salario lo diligencia RRHH (decisión 12.4). Cambiar un salario ya diligenciado es un ajuste y exige motivo.">
          {sugerencia && (
            <form action={accionAceptarSugerencia} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F8FAFC] p-2 text-xs text-gray-600">
              {oculto}
              <input type="hidden" name="salario_base" value={String(sugerencia.salario)} />
              <input type="hidden" name="salario_vigencia_desde" value={sugerencia.desde ?? ""} />
              <input type="hidden" name="responsable_email" value={v.responsable_email ?? ""} />
              <input type="hidden" name="observaciones" value={v.observaciones ?? ""} />
              <input type="hidden" name="proxima_accion" value={v.proxima_accion ?? ""} />
              <input type="hidden" name="proxima_accion_fecha" value={v.proxima_accion_fecha ?? ""} />
              <input type="hidden" name="motivo" value="Sugerencia de empleados aceptada" />
              <span>
                Sugerencia de empleados: <strong className="text-gray-900">{cop(sugerencia.salario)}</strong>
                {sugerencia.cargo ? ` · ${sugerencia.cargo}` : ""}{sugerencia.desde ? ` · desde ${fechaCorta(sugerencia.desde)}` : ""}.
                Es el salario <em>actual</em>, no necesariamente el vigente al inicio.
              </span>
              <button type="submit" className="h-7 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs font-medium text-gray-700 hover:bg-white/60">
                Usar esta sugerencia
              </button>
            </form>
          )}
          <form action={accionCompletar} className="space-y-3">
            {oculto}
            <label className="block">
              <span className={labelCls}>Responsable (correo)</span>
              <input name="responsable_email" type="email" defaultValue={v.responsable_email ?? ""} className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelCls}>Salario base (COP)</span>
                <input name="salario_base" inputMode="numeric" defaultValue={v.salario_base ?? ""} placeholder="1.300.000" className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Vigente desde</span>
                <input name="salario_vigencia_desde" type="date" defaultValue={v.salario_vigencia_desde ?? ""} className={inputCls} />
              </label>
            </div>
            <label className="block">
              <span className={labelCls}>Fuente del salario</span>
              <select name="salario_fuente" defaultValue={v.salario_fuente ?? "manual"} className={inputCls}>
                <option value="manual">Diligenciado a mano por RRHH</option>
                <option value="employees">Sugerencia de empleados aceptada</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelCls}>Próxima acción</span>
                <input name="proxima_accion" defaultValue={v.proxima_accion ?? ""} placeholder="Radicar ante la EPS" className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Fecha</span>
                <input name="proxima_accion_fecha" type="date" defaultValue={v.proxima_accion_fecha ?? ""} className={inputCls} />
              </label>
            </div>
            <label className="block">
              <span className={labelCls}>Observaciones</span>
              <textarea name="observaciones" rows={2} defaultValue={v.observaciones ?? ""} className="w-full rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-[#94A3B8]" />
            </label>
            <Motivo texto={v.salario_base != null ? "Obligatorio si cambias el salario o su vigencia" : "Solo si cambias un dato ya diligenciado"} />
            <button type="submit" className={btnCls}>Guardar datos</button>
          </form>
        </Tarjeta>

        {/* ── Homologar ── */}
        <Tarjeta titulo="Homologación" procedencia="homologado"
          nota="Tipo y entidad contra el catálogo activo. La modalidad de la matriz se puede corregir aquí; corregirla es un ajuste con motivo.">
          <form action={accionHomologar} className="space-y-3">
            {oculto}
            <label className="block">
              <span className={labelCls}>Tipo de incapacidad {v.origen ? <span className="normal-case text-gray-400">· la matriz trae {v.origen}</span> : null}</span>
              <select name="tipo_homologado" defaultValue={v.tipo_homologado ?? ""} className={inputCls}>
                <option value="">— sin homologar —</option>
                {tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.codigo} · {t.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Entidad pagadora {v.pagador_recibido ? <span className="normal-case text-gray-400">· la matriz trae «{v.pagador_recibido}»</span> : null}</span>
              <select name="entidad_catalogo_id" defaultValue={v.entidad_catalogo_id ?? ""} className={inputCls}>
                <option value="">— sin homologar —</option>
                {entidades.filter((e) => e.activo).map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre} · {e.clase ?? e.tipo}{e.dias_min_cobro != null ? ` · umbral ${e.dias_min_cobro} d` : ""}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Modalidad {modalidadMatriz ? <span className="normal-case text-gray-400">· la matriz trae {modalidadMatriz}</span> : null}</span>
              <select name="modalidad_ajustada" defaultValue={v.modalidad_ajustada ?? ""} className={inputCls}>
                <option value="">La de la matriz{modalidadMatriz ? ` (${modalidadMatriz})` : " (vacía)"}</option>
                <option value="INICIAL">INICIAL</option>
                <option value="PRORROGA">PRORROGA</option>
              </select>
            </label>
            <Motivo texto="Obligatorio si cambias algo ya homologado o la modalidad de la matriz" />
            <button type="submit" className={btnCls}>Guardar homologación</button>
          </form>
        </Tarjeta>

        {/* ── Sobrescribir + liquidar ── */}
        <div className="space-y-4">
          <Tarjeta titulo="Liquidar" procedencia="calculado"
            nota={liq ? `Vigente: ${liq.regla_codigo}, ${liq.dias_entidad} día(s) a cargo, ${cop(liq.valor_entidad)}. Recalcular deja esta liquidación en el historial.` : "Con la regla operativa. Propone el valor reclamado; no radica nada."}>
            {faltantes.length > 0 ? (
              <ul className="mb-3 space-y-1 text-xs text-amber-800">
                {faltantes.map((f) => (
                  <li key={f.campo} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {f.mensaje}</li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Todo lo necesario está diligenciado.</p>
            )}
            <form action={accionLiquidar}>
              <input type="hidden" name="id" value={v.id} />
              <button type="submit" disabled={faltantes.length > 0} className={`${btnCls} inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:bg-gray-300`}>
                <Calculator className="h-4 w-4" /> {liq ? "Recalcular" : "Liquidar"}
              </button>
            </form>
          </Tarjeta>

          <Tarjeta titulo="Sobrescribir el cálculo" procedencia="calculado"
            nota="Nivel 2 de la decisión 12.18: pisa el resultado sin cambiar las entradas. Siempre con motivo. Los días a cargo nunca por encima de los días totales; el valor por encima del total avisa.">
            <form action={accionSobrescribir} className="space-y-3">
              {oculto}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelCls}>Días a cargo {liq ? <span className="normal-case text-gray-400">· calc. {liq.dias_entidad}</span> : null}</span>
                  <input name="dias_entidad_ajustados" type="number" min={0} max={v.dias_incapacidad ?? undefined} defaultValue={v.dias_entidad_ajustados ?? ""} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>Valor reclamado {liq ? <span className="normal-case text-gray-400">· calc. {cop(liq.valor_entidad)}</span> : null}</span>
                  <input name="valor_reclamado_ajustado" inputMode="numeric" defaultValue={v.valor_reclamado_ajustado ?? ""} className={inputCls} />
                </label>
              </div>
              <Motivo texto="Obligatorio, también para quitar una sobrescritura" />
              <button type="submit" className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]">
                Guardar sobrescritura
              </button>
            </form>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
