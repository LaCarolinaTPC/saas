"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CircleAlert, CircleCheck, CircleX, HandCoins, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { formatDateBogota } from "@/lib/utils";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";
import {
  ESTADOS_REFERIDO, estadoReferido, resumenValidacion, totalEsquema, type EsquemasPolitica,
} from "@/lib/padrino/reglas";
import {
  buscarPadrinos, buscarProcesos, registrarReferido, type PadrinoOpcion, type ProcesoOpcion,
} from "@/lib/padrino/actions";
import type { ReferidoFila, ProcesoResumen } from "@/lib/padrino/datos";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

type Fila = ReferidoFila & { proceso: ProcesoResumen | null };

export function EstadoBadge({ estado }: { estado: string }) {
  const e = estadoReferido(estado);
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: e?.bg ?? "#F1F5F9", color: e?.color ?? "#64748B" }}>
      {e?.label ?? estado}
    </span>
  );
}

export function SemaforoResumen({ validacion }: { validacion: Fila["validacion"] }) {
  const r = resumenValidacion(validacion);
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums">
      <span className="inline-flex items-center gap-0.5 text-emerald-600" title="Cumple"><CircleCheck className="h-3.5 w-3.5" />{r.cumple}</span>
      <span className="inline-flex items-center gap-0.5 text-amber-600" title="Requiere revisión"><CircleAlert className="h-3.5 w-3.5" />{r.revisar}</span>
      <span className="inline-flex items-center gap-0.5 text-red-600" title="No cumple"><CircleX className="h-3.5 w-3.5" />{r.noCumple}</span>
    </span>
  );
}

export function PlanPadrinoClient({
  filas,
  error,
  filtros,
  puedeRegistrar,
  politica,
  procesoInicial,
}: {
  filas: Fila[];
  error: string | null;
  filtros: { estado: string; q: string; anulados: boolean };
  puedeRegistrar: boolean;
  politica: { version: string; vigenteDesde: string; esquemas: EsquemasPolitica } | null;
  procesoInicial: ProcesoOpcion | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [registrando, setRegistrando] = useState(Boolean(procesoInicial && puedeRegistrar));
  const [q, setQ] = useState(filtros.q);
  const pag = usePaginacion(filas, { reiniciar: `${filtros.estado}|${filtros.q}|${filtros.anulados}` });
  const ancla = useRef<HTMLDivElement>(null);

  function aplicar(cambio: Partial<typeof filtros>) {
    const f = { ...filtros, ...cambio };
    const p = new URLSearchParams();
    if (f.estado !== "todos") p.set("estado", f.estado);
    if (f.q) p.set("q", f.q);
    if (f.anulados) p.set("anulados", "1");
    router.push(`${pathname}${p.size ? `?${p}` : ""}`);
  }

  const conteo = new Map<string, number>();
  for (const f of filas) if (!f.anulado_at) conteo.set(f.estado, (conteo.get(f.estado) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6">
      {politica && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["A", "B"] as const).map((k) => (
            <div key={k} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  Esquema {k} · {politica.esquemas[k]?.nombre}
                </p>
                <p className="text-sm font-bold text-[#4F46E5]">{COP.format(totalEsquema(politica.esquemas[k]))}</p>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{politica.esquemas[k]?.condicion}</p>
              <p className="mt-2 text-xs text-gray-600">
                {politica.esquemas[k]?.hitos.map((h) => `${h.descripcion}: ${COP.format(h.valor)}`).join(" · ")}
              </p>
            </div>
          ))}
          <p className="text-xs text-gray-400 sm:col-span-2">
            Política {politica.version}, vigente desde {formatDateBogota(politica.vigenteDesde)}. Montos brutos; el mes de permanencia se cuenta como mes calendario desde la fecha de ingreso.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            aplicar({ q: q.trim() });
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cédula o nombre del referido o del padrino" className={`${inputCls} w-full pl-8 sm:w-96`} />
        </form>
        <select value={filtros.estado} onChange={(e) => aplicar({ estado: e.target.value })} className={inputCls}>
          <option value="todos">Todos los estados</option>
          {ESTADOS_REFERIDO.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
              {conteo.get(e.value) ? ` (${conteo.get(e.value)})` : ""}
            </option>
          ))}
        </select>
        <label className="flex h-9 items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={filtros.anulados} onChange={(e) => aplicar({ anulados: e.target.checked })} className="h-4 w-4 accent-[#4F46E5]" />
          Incluir anulados
        </label>
        <Link
          href="/candidatos/plan-padrino/tablero"
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:border-[#4F46E5] hover:text-[#4F46E5]"
        >
          <BarChart3 className="h-4 w-4" /> Tablero
        </Link>
        <Link
          href="/candidatos/plan-padrino/hitos"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:border-[#4F46E5] hover:text-[#4F46E5]"
        >
          <HandCoins className="h-4 w-4" /> Hitos y pagos
        </Link>
        {puedeRegistrar && (
          <Button onClick={() => setRegistrando(true)} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
            <Plus className="h-4 w-4" /> Registrar referido
          </Button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Referido</th>
                <th className="px-4 py-3">Padrino</th>
                <th className="px-4 py-3">Proceso</th>
                <th className="px-4 py-3">Esquema</th>
                <th className="px-4 py-3">Requisitos</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Ingreso</th>
                <th className="px-4 py-3">Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {pag.filas.map((f) => {
                const proc = PROCESO_ESTADOS.find((e) => e.value === f.proceso?.estado);
                return (
                  <tr key={f.id} className={`hover:bg-[#F8FAFC] ${f.anulado_at ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/candidatos/plan-padrino/${f.id}`} className="font-medium text-gray-900 hover:text-[#4F46E5]">
                        {f.nombre_referido ?? "—"}
                      </Link>
                      <div className="text-xs text-gray-400">{f.cedula_referido}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{f.nombre_padrino ?? "—"}</div>
                      <div className="text-xs text-gray-400">
                        {f.cedula_padrino} · {f.padrino_tipo === "conductor" ? "Conductor" : "Empleado"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {proc ? (
                        <span className="inline-flex rounded-full px-2 py-0.5 font-medium" style={{ backgroundColor: proc.bg, color: proc.color }}>
                          {proc.label}
                        </span>
                      ) : (
                        "—"
                      )}
                      {f.proceso?.vacante && <div className="mt-0.5 text-gray-400">{f.proceso.vacante}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {f.esquema}
                      {f.certificado_ruta && !f.certificado_validado_at && <div className="text-[11px] text-amber-600">Certificado por validar</div>}
                    </td>
                    <td className="px-4 py-3"><SemaforoResumen validacion={f.validacion} /></td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={f.estado} />
                      {f.anulado_at && <div className="mt-0.5 text-[11px] text-red-600">Anulado</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{f.fecha_ingreso ? formatDateBogota(f.fecha_ingreso) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div className="whitespace-nowrap">{formatDateBogota(f.created_at)}</div>
                      <div className="truncate" title={f.created_by_email ?? ""}>{f.created_by_email ?? ""}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filas.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            {filtros.q || filtros.estado !== "todos" ? "Ningún referido con estos filtros." : "Todavía no hay referidos registrados."}
          </p>
        ) : (
          <Paginador p={pag} unidad="referidos" ancla={ancla} />
        )}
      </section>

      {registrando && (
        <RegistroDialog
          procesoInicial={procesoInicial}
          onClose={() => setRegistrando(false)}
          onRegistrado={(id) => {
            setRegistrando(false);
            toast.success("Referido registrado. Revise el semáforo de requisitos.");
            router.push(`/candidatos/plan-padrino/${id}`);
          }}
        />
      )}
    </div>
  );
}

/** Búsqueda con espera corta mientras se escribe. */
function useBusqueda<T>(fn: (q: string) => Promise<T[]>, q: string) {
  const [res, setRes] = useState<{ q: string; items: T[] }>({ q: "", items: [] });
  useEffect(() => {
    if (q.trim().length < 3) return;
    let vivo = true;
    const t = setTimeout(() => {
      fn(q)
        .then((items) => vivo && setRes({ q, items }))
        .catch(() => vivo && setRes({ q, items: [] }));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [fn, q]);
  return q.trim().length < 3 ? [] : res.q === q ? res.items : null;
}

function RegistroDialog({
  procesoInicial,
  onClose,
  onRegistrado,
}: {
  procesoInicial: ProcesoOpcion | null;
  onClose: () => void;
  onRegistrado: (id: string) => void;
}) {
  const [proceso, setProceso] = useState<ProcesoOpcion | null>(procesoInicial);
  const [padrino, setPadrino] = useState<PadrinoOpcion | null>(null);
  const [qProceso, setQProceso] = useState("");
  const [qPadrino, setQPadrino] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const procesos = useBusqueda(buscarProcesos, qProceso);
  const padrinos = useBusqueda(buscarPadrinos, qPadrino);

  async function registrar() {
    if (!proceso || !padrino) return;
    setGuardando(true);
    setError(null);
    const r = await registrarReferido({ procesoId: proceso.id, cedulaPadrino: padrino.cedula });
    setGuardando(false);
    if (r.ok) onRegistrado(r.id);
    else setError(r.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onClick={() => !guardando && onClose()}>
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Registrar referido</h3>
          <button onClick={onClose} disabled={guardando} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">1. Referido (proceso de contratación)</p>
            {proceso ? (
              <Elegido
                titulo={proceso.nombre}
                detalle={`${proceso.cedula} · ${PROCESO_ESTADOS.find((e) => e.value === proceso.estado)?.label ?? proceso.estado}${proceso.vacante ? ` · ${proceso.vacante}` : ""} · creado ${formatDateBogota(proceso.fecha_creacion)}`}
                onCambiar={() => setProceso(null)}
              />
            ) : (
              <Buscador
                valor={qProceso}
                onValor={setQProceso}
                placeholder="Cédula o nombre del candidato"
                items={procesos}
                vacio="Ningún proceso de contratación con ese dato. Créelo primero en Candidatos → Procesos."
                render={(p) => ({ key: p.id, titulo: p.nombre, detalle: `${p.cedula} · ${PROCESO_ESTADOS.find((e) => e.value === p.estado)?.label ?? p.estado}${p.vacante ? ` · ${p.vacante}` : ""} · ${formatDateBogota(p.fecha_creacion)}` })}
                onElegir={setProceso}
              />
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">2. Padrino (conductor activo o empleado autorizado)</p>
            {padrino ? (
              <Elegido titulo={padrino.nombre} detalle={`${padrino.cedula} · ${padrino.tipo === "conductor" ? "Conductor" : "Empleado"}${padrino.detalle ? ` · ${padrino.detalle}` : ""}`} onCambiar={() => setPadrino(null)} />
            ) : (
              <Buscador
                valor={qPadrino}
                onValor={setQPadrino}
                placeholder="Cédula, nombre o código del conductor"
                items={padrinos}
                vacio="Ningún conductor activo ni empleado autorizado con ese dato."
                render={(p) => ({ key: `${p.tipo}-${p.cedula}`, titulo: p.nombre, detalle: `${p.cedula} · ${p.tipo === "conductor" ? "Conductor" : "Empleado"}${p.detalle ? ` · ${p.detalle}` : ""}` })}
                onElegir={setPadrino}
              />
            )}
          </div>

          <p className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs text-gray-500">
            Al registrar, Gestivo valida los requisitos del padrino (P1-P3) y del referido (R1-R5) y guarda el resultado. El esquema arranca en B; pasa a A cuando se adjunte el certificado de experiencia y la coordinadora lo valide.
          </p>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={registrar} disabled={guardando || !proceso || !padrino} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
            {guardando ? "Validando…" : "Registrar y validar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Elegido({ titulo, detalle, onCambiar }: { titulo: string; detalle: string; onCambiar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{titulo}</p>
        <p className="truncate text-xs text-gray-500">{detalle}</p>
      </div>
      <button onClick={onCambiar} className="shrink-0 text-xs font-medium text-[#4F46E5] hover:underline">Cambiar</button>
    </div>
  );
}

function Buscador<T>({
  valor, onValor, placeholder, items, vacio, render, onElegir,
}: {
  valor: string;
  onValor: (v: string) => void;
  placeholder: string;
  items: T[] | null;
  vacio: string;
  render: (t: T) => { key: string; titulo: string; detalle: string };
  onElegir: (t: T) => void;
}) {
  return (
    <div>
      <input value={valor} onChange={(e) => onValor(e.target.value)} placeholder={placeholder} className={`${inputCls} w-full`} />
      {valor.trim().length >= 3 && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#E2E8F0]">
          {items === null ? (
            <p className="px-3 py-2 text-xs text-gray-400">Buscando…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">{vacio}</p>
          ) : (
            items.map((t) => {
              const r = render(t);
              return (
                <button key={r.key} onClick={() => onElegir(t)} className="block w-full border-b border-[#F1F5F9] px-3 py-2 text-left last:border-0 hover:bg-[#F8FAFC]">
                  <span className="block text-sm text-gray-900">{r.titulo}</span>
                  <span className="block text-xs text-gray-500">{r.detalle}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
