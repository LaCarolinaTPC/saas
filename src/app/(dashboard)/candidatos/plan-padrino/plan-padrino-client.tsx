"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CircleAlert, CircleCheck, CircleX, HandCoins, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { formatDateBogota } from "@/lib/utils";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";
import { ESTADOS_REFERIDO, esRegistroTardio, estadoReferido, resumenValidacion } from "@/lib/padrino/reglas";
import type { ParametrosPolitica } from "@/lib/padrino/politica";
import {
  buscarPadrinos, buscarProcesos, prerregistrarReferido, registrarReferido, type PadrinoOpcion, type ProcesoOpcion,
} from "@/lib/padrino/actions";
import type { ReferidoFila, ProcesoResumen } from "@/lib/padrino/datos";
import { Buscador, Elegido, inputCls, useBusqueda } from "./buscadores";
import { PoliticaBorrador, TarjetasEsquemas, VersionesPolitica, type VersionFila } from "./politica-borrador";
import { HistoricoPagos } from "./historico-pagos";
import type { getResumenHistorico } from "@/lib/padrino/datos";


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
  borrador = null,
  puedeSimular = false,
  puedePublicar = false,
  hoy,
  versiones = [],
  catalogos = { areas: [], cargos: [] },
  historico = null,
  procesoInicial,
}: {
  filas: Fila[];
  error: string | null;
  filtros: { estado: string; q: string; anulados: boolean };
  puedeRegistrar: boolean;
  politica: { version: string; vigenteDesde: string | null; parametros: ParametrosPolitica } | null;
  /** Versión en borrador: se muestra aparte y no rige hasta publicarla. */
  borrador?: { id: string; version: string; parametros: ParametrosPolitica } | null;
  puedeSimular?: boolean;
  puedePublicar?: boolean;
  hoy: string;
  /** Historial de versiones de la política. */
  versiones?: VersionFila[];
  /** Áreas y cargos para el editor de la política (solo administradores). */
  catalogos?: { areas: string[]; cargos: string[] };
  /** Pagos del plan antes de Gestivo (solo administradores). */
  historico?: Awaited<ReturnType<typeof getResumenHistorico>> | null;
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TarjetasEsquemas parametros={politica.parametros} />
          <p className="text-xs text-gray-400 sm:col-span-2 lg:col-span-3">
            Política {politica.version}
            {politica.vigenteDesde ? `, vigente desde ${formatDateBogota(politica.vigenteDesde)}` : ""}. Montos brutos; el mes de permanencia se cuenta como mes calendario desde la fecha de ingreso.
          </p>
        </div>
      )}

      {borrador && (
        <PoliticaBorrador
          borrador={borrador}
          vigente={politica ? { version: politica.version, vigenteDesde: politica.vigenteDesde, parametros: politica.parametros } : null}
          referidos={filas.filter((f) => !f.anulado_at)}
          hoy={hoy}
          puedeSimular={puedeSimular}
          puedePublicar={puedePublicar}
          catalogos={catalogos}
        />
      )}
      {versiones.length > 0 && <VersionesPolitica versiones={versiones} hoy={hoy} puedeCrear={puedePublicar} />}
      {historico && <HistoricoPagos resumen={historico} />}

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
                      ) : !f.proceso_id ? (
                        <span className="inline-flex rounded-full bg-[#FEF3C7] px-2 py-0.5 font-medium text-[#92400E]" title="Se enlaza solo cuando Selección cree el proceso de contratación con esta cédula">
                          Prerregistro
                        </span>
                      ) : (
                        "—"
                      )}
                      {f.proceso?.vacante && <div className="mt-0.5 text-gray-400">{f.proceso.vacante}</div>}
                      {esRegistroTardio(f.validacion) && <div className="mt-0.5 text-[11px] text-red-600">Registro tardío</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {f.esquema}
                      {f.tipo_ingreso === "reintegro" && <span className="ml-1 text-[11px] text-gray-400">reintegro</span>}
                      {f.sin_bonificacion_motivo && <div className="text-[11px] text-red-600" title={f.sin_bonificacion_motivo}>Sin bonificación</div>}
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

function RegistroDialog({
  procesoInicial,
  onClose,
  onRegistrado,
}: {
  procesoInicial: ProcesoOpcion | null;
  onClose: () => void;
  onRegistrado: (id: string) => void;
}) {
  // Prerregistro (antes de la selección) es lo que pide la política v3; desde
  // un proceso existente queda para la transición (y sale como registro tardío).
  const [modo, setModo] = useState<"prerregistro" | "proceso">(procesoInicial ? "proceso" : "prerregistro");
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [proceso, setProceso] = useState<ProcesoOpcion | null>(procesoInicial);
  const [padrino, setPadrino] = useState<PadrinoOpcion | null>(null);
  const [qProceso, setQProceso] = useState("");
  const [qPadrino, setQPadrino] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const procesos = useBusqueda(buscarProcesos, qProceso);
  const padrinos = useBusqueda(buscarPadrinos, qPadrino);

  const listo = Boolean(padrino) && (modo === "proceso" ? Boolean(proceso) : cedula.replace(/\D/g, "").length >= 5 && nombre.trim().length >= 5);

  async function registrar() {
    if (!padrino || !listo) return;
    setGuardando(true);
    setError(null);
    const r =
      modo === "proceso"
        ? await registrarReferido({ procesoId: proceso!.id, cedulaPadrino: padrino.cedula })
        : await prerregistrarReferido({ cedula, nombre, cedulaPadrino: padrino.cedula });
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
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5 text-gray-700">
              <input type="radio" checked={modo === "prerregistro"} onChange={() => setModo("prerregistro")} className="accent-[#4F46E5]" />
              Antes de la selección (prerregistro)
            </label>
            <label className="flex items-center gap-1.5 text-gray-700">
              <input type="radio" checked={modo === "proceso"} onChange={() => setModo("proceso")} className="accent-[#4F46E5]" />
              Desde un proceso existente
            </label>
          </div>
          {modo === "prerregistro" ? (
          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">1. Candidato (hoja de vida que entrega el padrino en el formato oficial)</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" placeholder="Cédula" className={`${inputCls} w-full`} />
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" className={`${inputCls} w-full`} />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Cuando Selección cree el proceso de contratación con esta cédula, el registro se enlaza solo y se validan los requisitos.</p>
          </div>
          ) : (
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
            <p className="mt-1 text-[11px] text-amber-700">Si el proceso empezó antes de hoy, la política v3 lo marca como registro tardío (R13).</p>
          </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">2. Padrino</p>
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
            Al registrar, Gestivo valida los requisitos del padrino y del referido que pide la política vigente y guarda el resultado. El esquema arranca en B (o en C si es un reintegro que cumple las reglas); pasa a A cuando se adjunte el certificado de experiencia y la coordinadora lo valide. Al contratar se aplica la versión vigente en la fecha de ingreso.
          </p>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={registrar} disabled={guardando || !listo} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
            {guardando ? "Validando…" : modo === "prerregistro" ? "Prerregistrar" : "Registrar y validar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
