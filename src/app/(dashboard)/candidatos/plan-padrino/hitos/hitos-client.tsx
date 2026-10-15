"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileSpreadsheet, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { formatDateBogota } from "@/lib/utils";
import { VISTAS_HITOS, estadoHito, type FiltrosHitos, type HitoFila } from "@/lib/padrino/hitos";
import { decidirHito, evaluarHitosAhora, marcarPagados } from "@/lib/padrino/actions";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";
const areaCls =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

export function HitoBadge({ estado }: { estado: string }) {
  const e = estadoHito(estado);
  return (
    <span className="inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: e?.bg ?? "#F1F5F9", color: e?.color ?? "#64748B" }}>
      {e?.label ?? estado}
    </span>
  );
}

export function HitosClient({
  hitos, error, filtros, hoy, usuarioId, puedeAprobar, puedePagar, puedeExportar,
}: {
  hitos: HitoFila[];
  error: string | null;
  filtros: FiltrosHitos;
  hoy: string;
  usuarioId: string | null;
  puedeAprobar: boolean;
  puedePagar: boolean;
  puedeExportar: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, start] = useTransition();
  const [q, setQ] = useState(filtros.q);
  const [decidiendo, setDecidiendo] = useState<HitoFila | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [pagando, setPagando] = useState(false);
  const pag = usePaginacion(hitos, { reiniciar: `${filtros.vista}|${filtros.desde}|${filtros.hasta}|${filtros.q}` });
  const ancla = useRef<HTMLDivElement>(null);

  function aplicar(cambio: Partial<FiltrosHitos>) {
    const f = { ...filtros, ...cambio };
    const p = new URLSearchParams({ vista: f.vista });
    if (f.desde) p.set("desde", f.desde);
    if (f.hasta) p.set("hasta", f.hasta);
    if (f.q) p.set("q", f.q);
    setSeleccion(new Set());
    router.push(`${pathname}?${p}`);
  }

  const exportar = new URLSearchParams({ vista: filtros.vista });
  if (filtros.desde) exportar.set("desde", filtros.desde);
  if (filtros.hasta) exportar.set("hasta", filtros.hasta);
  if (filtros.q) exportar.set("q", filtros.q);

  const total = hitos.reduce((s, h) => s + h.valor, 0);
  const pagables = filtros.vista === "aprobado" && puedePagar;
  const seleccionados = hitos.filter((h) => seleccion.has(h.id));

  function alternar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#F1F5F9] bg-white p-1">
        {VISTAS_HITOS.map((v) => (
          <button
            key={v.value}
            onClick={() => aplicar({ vista: v.value })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${filtros.vista === v.value ? "bg-[#4F46E5] text-white" : "text-gray-500 hover:bg-gray-100"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={(e) => { e.preventDefault(); aplicar({ q: q.trim() }); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cédula o nombre del referido o del padrino" className={`${inputCls} w-full sm:w-80`} />
        </form>
        <label className="text-xs font-medium text-gray-500">
          Causación desde
          <input type="date" value={filtros.desde ?? ""} onChange={(e) => aplicar({ desde: e.target.value || null })} className={`${inputCls} mt-1 block`} />
        </label>
        <label className="text-xs font-medium text-gray-500">
          hasta
          <input type="date" value={filtros.hasta ?? ""} onChange={(e) => aplicar({ hasta: e.target.value || null })} className={`${inputCls} mt-1 block`} />
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          {puedeAprobar && (
            <Button
              variant="outline"
              disabled={pendiente}
              onClick={() =>
                start(async () => {
                  const r = await evaluarHitosAhora();
                  if (!r.ok) return void toast.error(r.error);
                  const s = r.resumen;
                  toast.success(`Evaluados ${s.evaluados}: ${s.porAprobar} por aprobar, ${s.noCausados} no causados, ${s.cancelados} cancelados, ${s.enEspera} en espera.`);
                  router.refresh();
                })
              }
            >
              <RefreshCw className="h-4 w-4" /> Evaluar ahora
            </Button>
          )}
          {puedeExportar && (
            <a href={`/api/candidatos/plan-padrino/hitos/export?${exportar}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:border-[#4F46E5] hover:text-[#4F46E5]">
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </a>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
        <span>
          {hitos.length} hito(s) · <strong className="text-gray-900">{COP.format(total)}</strong> brutos
        </span>
        {pagables && (
          <Button size="sm" disabled={!seleccionados.length} onClick={() => setPagando(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
            Marcar pagados ({seleccionados.length}) · {COP.format(seleccionados.reduce((s, h) => s + h.valor, 0))}
          </Button>
        )}
      </div>

      <section ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {pagables && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={hitos.length > 0 && seleccion.size === hitos.length}
                      onChange={(e) => setSeleccion(e.target.checked ? new Set(hitos.map((h) => h.id)) : new Set())}
                      className="h-4 w-4 accent-[#4F46E5]"
                      aria-label="Seleccionar todos"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Causación</th>
                <th className="px-4 py-3">Padrino</th>
                <th className="px-4 py-3">Referido</th>
                <th className="px-4 py-3">Hito</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Detalle</th>
                {puedeAprobar && filtros.vista === "por_aprobar" && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {pag.filas.map((h) => {
                const vencido = h.estado === "pendiente" && h.fecha_causacion <= hoy;
                const propio = Boolean(usuarioId && h.referido.created_by === usuarioId);
                return (
                  <tr key={h.id} className="hover:bg-[#F8FAFC]">
                    {pagables && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={seleccion.has(h.id)} onChange={() => alternar(h.id)} className="h-4 w-4 accent-[#4F46E5]" aria-label="Seleccionar hito" />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDateBogota(h.fecha_causacion)}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">{h.referido.nombre_padrino ?? "—"}</div>
                      <div className="text-xs text-gray-400">{h.referido.cedula_padrino}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/candidatos/plan-padrino/${h.referido_id}`} className="text-gray-800 hover:text-[#4F46E5]">{h.referido.nombre_referido ?? "—"}</Link>
                      <div className="text-xs text-gray-400">{h.referido.cedula_referido} · ingreso {formatDateBogota(h.referido.fecha_ingreso)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {h.referido.esquema}{h.numero} · {h.descripcion}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">{COP.format(h.valor)}</td>
                    <td className="px-4 py-3"><HitoBadge estado={h.estado} /></td>
                    <td className="max-w-[280px] px-4 py-3 text-xs text-gray-500">
                      {h.motivo && <span className={vencido ? "text-amber-700" : ""}>{h.motivo}</span>}
                      {h.aprobado_at && <span className="block">{h.estado === "rechazado" ? "Rechazó" : "Aprobó"} {h.aprobado_por_email} · {formatDateBogota(h.aprobado_at)}{h.observacion_aprobacion ? ` · ${h.observacion_aprobacion}` : ""}</span>}
                      {h.fecha_pago && <span className="block text-emerald-700">Pagado {formatDateBogota(h.fecha_pago)} · {h.referencia_pago}</span>}
                    </td>
                    {puedeAprobar && filtros.vista === "por_aprobar" && (
                      <td className="px-4 py-3 text-right">
                        {propio ? (
                          <span className="text-[11px] text-gray-400" title="Usted registró este referido">Aprueba otra persona</span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setDecidiendo(h)}>Decidir</Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hitos.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">No hay hitos en esta vista.</p>
        ) : (
          <Paginador p={pag} unidad="hitos" ancla={ancla} />
        )}
      </section>

      {decidiendo && (
        <DecidirDialog
          hito={decidiendo}
          onClose={() => setDecidiendo(null)}
          onListo={() => {
            setDecidiendo(null);
            router.refresh();
          }}
        />
      )}
      {pagando && (
        <PagoDialog
          hitos={seleccionados}
          hoy={hoy}
          onClose={() => setPagando(false)}
          onListo={(n) => {
            setPagando(false);
            setSeleccion(new Set());
            toast.success(`${n} hito(s) marcados como pagados`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DecidirDialog({ hito, onClose, onListo }: { hito: HitoFila; onClose: () => void; onListo: () => void }) {
  const [obs, setObs] = useState("");
  const [desempeno, setDesempeno] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  function decidir(aprobar: boolean) {
    setError(null);
    start(async () => {
      const r = await decidirHito({ id: hito.id, aprobar, observacion: obs, desempenoSatisfactorio: desempeno });
      if (r.ok) {
        toast.success(aprobar ? "Hito aprobado: queda para nómina" : "Hito rechazado");
        onListo();
      } else setError(r.error);
    });
  }

  return (
    <Modal titulo="Decidir hito" onClose={onClose}>
      <p className="mb-3 text-sm text-gray-600">
        <strong className="text-gray-800">{hito.descripcion}</strong> ({COP.format(hito.valor)}) para el padrino{" "}
        <strong className="text-gray-800">{hito.referido.nombre_padrino}</strong> por el referido{" "}
        <strong className="text-gray-800">{hito.referido.nombre_referido}</strong>, causado el {formatDateBogota(hito.fecha_causacion)}.
      </p>
      {hito.requiere_desempeno && (
        <label className="mb-3 flex items-start gap-2 rounded-lg bg-[#EEF2FF] px-3 py-2 text-sm text-[#3730A3]">
          <input type="checkbox" checked={desempeno} onChange={(e) => setDesempeno(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#4F46E5]" />
          El referido tuvo desempeño satisfactorio en sus tres meses (obligatorio para aprobar este hito).
        </label>
      )}
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} maxLength={2000} className={areaCls} placeholder="Observación (obligatoria al rechazar)" />
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" disabled={pendiente || !obs.trim()} onClick={() => decidir(false)}>Rechazar</Button>
        <Button disabled={pendiente || (hito.requiere_desempeno && !desempeno)} onClick={() => decidir(true)} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">Aprobar</Button>
      </div>
    </Modal>
  );
}

function PagoDialog({ hitos, hoy, onClose, onListo }: { hitos: HitoFila[]; hoy: string; onClose: () => void; onListo: (n: number) => void }) {
  const [fecha, setFecha] = useState(hoy);
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  return (
    <Modal titulo="Marcar como pagados" onClose={onClose}>
      <p className="mb-3 text-sm text-gray-600">
        {hitos.length} hito(s) por {COP.format(hitos.reduce((s, h) => s + h.valor, 0))} brutos. Un hito pagado ya no se puede editar.
      </p>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-gray-600">
          Fecha de pago
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={`${inputCls} mt-1 block w-full`} />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          Referencia (concepto de nómina, comprobante o planilla)
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} className={`${inputCls} mt-1 block w-full`} />
        </label>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button
          disabled={pendiente || !referencia.trim() || !fecha}
          onClick={() =>
            start(async () => {
              const r = await marcarPagados({ ids: hitos.map((h) => h.id), fechaPago: fecha, referencia });
              if (r.ok) onListo(r.pagados);
              else setError(r.error);
            })
          }
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Marcar pagados
        </Button>
      </div>
    </Modal>
  );
}
