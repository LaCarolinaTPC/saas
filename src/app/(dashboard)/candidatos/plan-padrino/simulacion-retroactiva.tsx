"use client";

/**
 * Simulación con TODOS los referidos actuales: qué pasaría si el borrador
 * rigiera desde una fecha (puede ser pasada). Es el mismo cálculo que aplica
 * la publicación retroactiva; no guarda nada.
 */
import { Fragment, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateBogota } from "@/lib/utils";
import { estadoReferido } from "@/lib/padrino/reglas";
import { BENEFICIARIO_LABEL, estadoHito } from "@/lib/padrino/hitos";
import { resumenRetroactivo, type FilaRetroactiva, type HitoVista, type SimulacionRetroactiva } from "@/lib/padrino/retroactivo";
import { simularRetroactivo } from "@/lib/padrino/actions";
import { inputCls } from "./buscadores";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const ACCION = {
  rehacer: { label: "Se rehacen los hitos", cls: "bg-[#EEF2FF] text-[#4F46E5]" },
  revalidar: { label: "Se revalida", cls: "bg-[#FEF3C7] text-[#92400E]" },
  sin_cambio: { label: "Sin cambio", cls: "bg-[#F1F5F9] text-gray-500" },
} as const;

function Diferencia({ antes, despues }: { antes: number; despues: number }) {
  const d = despues - antes;
  if (!d) return <span className="text-gray-400">—</span>;
  return <span className={d > 0 ? "text-[#B45309]" : "text-emerald-700"}>{d > 0 ? "+" : "−"}{COP.format(Math.abs(d))}</span>;
}

function Cambio({ antes, despues }: { antes: number; despues: number }) {
  return (
    <span className="tabular-nums">
      {antes === despues ? COP.format(despues) : <>{COP.format(antes)} → <strong>{COP.format(despues)}</strong></>}
    </span>
  );
}

function Tarjeta({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{titulo}</p>
      <p className="mt-1 text-sm text-gray-900">{children}</p>
      {nota && <p className="mt-0.5 text-[11px] text-gray-500">{nota}</p>}
    </div>
  );
}

function ListaHitos({ titulo, hitos }: { titulo: string; hitos: HitoVista[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold text-gray-700">{titulo}</p>
      {!hitos.length ? (
        <p className="text-[11px] text-gray-500">Sin hitos.</p>
      ) : (
        <table className="w-full text-[11px]">
          <tbody className="divide-y divide-[#F1F5F9]">
            {hitos.map((h) => {
              const e = estadoHito(h.estado);
              return (
                <tr key={`${h.numero}-${h.beneficiario}`} title={h.motivo ?? undefined}>
                  <td className="whitespace-nowrap py-1 pr-2 text-gray-500">{formatDateBogota(h.fecha)}</td>
                  <td className="py-1 pr-2 text-gray-700">
                    {h.numero}. {h.descripcion}
                    <span className="text-gray-400"> · {BENEFICIARIO_LABEL[h.beneficiario]}</span>
                    {h.conservado && <span className="ml-1 rounded bg-[#F1F5F9] px-1 text-[10px] text-gray-500">se conserva</span>}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums text-gray-900">{COP.format(h.valor)}</td>
                  <td className="py-1">
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: e?.bg, color: e?.color }}>{e?.label ?? h.estado}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Detalle({ f }: { f: FilaRetroactiva }) {
  return (
    <div className="space-y-2 bg-[#F8FAFC] p-3">
      <p className="text-[11px] text-gray-600">{f.esquemaDato}</p>
      {f.sinBonificacion && <p className="text-[11px] font-medium text-red-700">Sin bonificación: {f.sinBonificacion}</p>}
      {f.bloqueantes.length > 0 && (
        <div className="text-[11px] text-red-700">
          <p className="font-medium">{f.accion === "rehacer" ? "Bloquean los hitos (al contratar):" : "Bloquean la elegibilidad:"}</p>
          <ul className="list-disc pl-4">{f.bloqueantes.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {f.observaciones.length > 0 && (
        <div className="text-[11px] text-amber-800">
          <p className="font-medium">{f.accion === "rehacer" ? "No cumple con la versión nueva (ya se decidió la elegibilidad; no bloquea):" : "Piden observación al decidir:"}</p>
          <ul className="list-disc pl-4">{f.observaciones.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {f.accion === "rehacer" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ListaHitos titulo={`Hoy (${f.versionActual ?? "versión actual"})`} hitos={f.hitosActuales} />
          <ListaHitos titulo="Con la versión nueva (estado proyectado a hoy)" hitos={f.hitosNuevos} />
        </div>
      )}
      {f.notas.length > 0 && (
        <ul className="list-disc pl-4 text-[11px] text-gray-600">{f.notas.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
    </div>
  );
}

/** Resumen y tabla de una simulación retroactiva. */
export function ResultadoRetroactivo({ sim }: { sim: SimulacionRetroactiva }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const r = resumenRetroactivo(sim.filas);
  const alternar = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-gray-600">
        Si la <strong>{sim.version}</strong> rigiera desde el <strong>{formatDateBogota(sim.fecha)}</strong> (proyección al {formatDateBogota(sim.hoy)}).{" "}
        {sim.reemplaza ? `La ${sim.reemplaza} empieza el mismo día: queda reemplazada y nunca rigió.` : sim.cierra ? `La ${sim.cierra.version} se cierra el ${formatDateBogota(sim.cierra.hasta)}.` : ""}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Referidos" nota={`${sim.sinCambio} sin cambio (ingresaron antes, anulados o cerrados)`}>
          <strong>{r.rehacer}</strong> contratados se rehacen · <strong>{r.revalidar}</strong> sin contratar se revalidan
        </Tarjeta>
        <Tarjeta titulo="Comprometido (contratados)" nota={`Con la nueva: padrino ${COP.format(r.nuevo.padrino)} · referido ${COP.format(r.nuevo.referido)}`}>
          <Cambio antes={r.actual.comprometido} despues={r.nuevo.comprometido} />
        </Tarjeta>
        <Tarjeta titulo="Causado a hoy" nota={`Pagado: ${COP.format(r.actual.pagado)} (se respeta)`}>
          <Cambio antes={r.actual.causado} despues={r.nuevo.causado} />
        </Tarjeta>
        <Tarjeta titulo="Ajustes y sobrepagos" nota="Ajuste: la nueva paga más por un hito ya pagado. Sobrepago: se pagó de más; se revisa a mano.">
          Ajustes {COP.format(r.ajustes)} · sobrepago <span className={r.sobrepago ? "font-semibold text-red-700" : ""}>{COP.format(r.sobrepago)}</span>
        </Tarjeta>
        {(r.potencial.actual > 0 || r.potencial.nuevo > 0) && (
          <Tarjeta titulo="Sin contratar, si cumplen todo el plan">
            <Cambio antes={r.potencial.actual} despues={r.potencial.nuevo} />
          </Tarjeta>
        )}
        {r.conError > 0 && <Tarjeta titulo="Con error">{r.conError} referido(s) no se pudieron calcular: vea el detalle.</Tarjeta>}
      </div>

      {sim.filas.length === 0 ? (
        <p className="text-xs text-gray-500">Ningún referido cambia con esa fecha.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-2 py-1.5" />
                <th className="py-1.5 pr-3">Referido · padrino</th>
                <th className="py-1.5 pr-3">Ingreso</th>
                <th className="py-1.5 pr-3">Qué pasa</th>
                <th className="py-1.5 pr-3">Estado</th>
                <th className="py-1.5 pr-3">Esquema</th>
                <th className="py-1.5 pr-3 text-right">Comprometido</th>
                <th className="py-1.5 pr-3 text-right">Causado a hoy</th>
                <th className="py-1.5 pr-3 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {sim.filas.map((f) => {
                const abierto = abiertos.has(f.referidoId);
                const a = ACCION[f.accion];
                const potencial = f.potencial;
                return (
                  <Fragment key={f.referidoId}>
                    <tr className="cursor-pointer hover:bg-[#F8FAFC]" onClick={() => alternar(f.referidoId)}>
                      <td className="px-2 py-1.5 text-gray-400">{abierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                      <td className="py-1.5 pr-3">
                        <span className="font-medium text-gray-900">{f.referido.nombre ?? f.referido.cedula}</span>
                        <span className="block text-[10px] text-gray-400">{f.referido.cedula} · padrino {f.padrino.nombre ?? f.padrino.cedula}</span>
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-gray-600">{f.fechaIngreso ? formatDateBogota(f.fechaIngreso) : "sin contratar"}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${a.cls}`}>{a.label}</span>
                        {f.error && <span className="block text-[10px] text-red-600">{f.error}</span>}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-gray-600">
                        {estadoReferido(f.estado)?.label ?? f.estado}
                        {f.estadoNuevo !== f.estado && <> → <strong>{estadoReferido(f.estadoNuevo)?.label ?? f.estadoNuevo}</strong></>}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-gray-700" title={f.esquemaDato}>
                        {f.esquemaActual === f.esquemaNuevo ? f.esquemaNuevo : <>{f.esquemaActual} → <strong>{f.esquemaNuevo}</strong></>}
                        {f.sinBonificacion && <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-700">sin bonificación</span>}
                        {f.bloqueantes.length > 0 && <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-700">{f.bloqueantes.length} bloquea(n)</span>}
                      </td>
                      {potencial ? (
                        <>
                          <td className="py-1.5 pr-3 text-right text-gray-700" title="Si se contrata y cumple todo el plan">
                            <Cambio antes={potencial.actual} despues={potencial.nuevo} />
                            <span className="block text-[10px] text-gray-400">si cumple todo el plan</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right text-gray-400">—</td>
                          <td className="py-1.5 pr-3 text-right"><Diferencia antes={potencial.actual} despues={potencial.nuevo} /></td>
                        </>
                      ) : (
                        <>
                          <td className="py-1.5 pr-3 text-right text-gray-700"><Cambio antes={f.actual.comprometido} despues={f.nuevo.comprometido} /></td>
                          <td className="py-1.5 pr-3 text-right text-gray-700"><Cambio antes={f.actual.causado} despues={f.nuevo.causado} /></td>
                          <td className="py-1.5 pr-3 text-right">
                            <Diferencia antes={f.actual.comprometido} despues={f.nuevo.comprometido} />
                            {f.sobrepago > 0 && <span className="block text-[10px] text-red-700">sobrepago {COP.format(f.sobrepago)}</span>}
                          </td>
                        </>
                      )}
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={9} className="p-0"><Detalle f={f} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Pide la simulación al servidor para una fecha. */
export function useSimulacionRetroactiva(politicaId: string) {
  const [sim, setSim] = useState<SimulacionRetroactiva | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const simular = (fecha: string) => {
    setError(null);
    start(async () => {
      const r = await simularRetroactivo({ politicaId, fecha });
      if (r.ok) setSim(r.simulacion);
      else {
        setSim(null);
        setError(r.error);
      }
    });
  };
  return { sim, error, pendiente, simular };
}

/** Sección del borrador: elegir la fecha y ver cómo quedarían todos los referidos. */
export function SimuladorRetroactivo({ politicaId, version, minimo, hoy }: { politicaId: string; version: string; minimo: string | null; hoy: string }) {
  const [fecha, setFecha] = useState(hoy);
  const { sim, error, pendiente, simular } = useSimulacionRetroactiva(politicaId);
  return (
    <section className="mt-4 rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <History className="h-4 w-4 text-[#4F46E5]" /> Simulación con todos los referidos actuales
      </h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Qué pasaría con cada referido registrado si la {version} rigiera desde la fecha que elija, incluso una pasada: esquema, requisitos, hitos y pagos, antes y después. Los
        contratados que ingresaron desde esa fecha pasan a la {version} (lo ya pagado se respeta y se descuenta); los que siguen sin contratar se revalidan. No guarda nada.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-600">
          Rige desde
          <input type="date" min={minimo ?? undefined} value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${inputCls} mt-1 block`} />
        </label>
        <Button onClick={() => simular(fecha)} disabled={!fecha || pendiente} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
          {pendiente ? "Simulando…" : "Simular con los datos actuales"}
        </Button>
        {minimo && <p className="text-[11px] text-gray-400">Desde el {formatDateBogota(minimo)} (inicio de la versión vigente) en adelante.</p>}
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {sim && <div className={pendiente ? "opacity-50" : ""}><ResultadoRetroactivo sim={sim} /></div>}
    </section>
  );
}
