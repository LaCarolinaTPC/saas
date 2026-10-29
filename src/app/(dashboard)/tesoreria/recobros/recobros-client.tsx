"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BotonesExportar } from "@/components/ui/botones-exportar";
import { ActualizarGemaRecobros } from "@/components/tesoreria/actualizar-gema-recobros";
import {
  ESTADO_LABEL, ESTADOS_CAJERO, ESTADOS_FLUJO, ordenUrgencia, ranking, resumen, RESULTADO_REVISION_LABEL,
  type EstadoRecobro, type PuestoRanking, type Semaforo,
} from "@/lib/tesoreria/recobros";
import {
  enRango, FILTRO_RAPIDO_LABEL, pasaBusqueda, pasaFiltroRapido, PERIODO_LABEL, rangoPeriodo,
  type FilaBandeja, type FiltroRapido, type FiltroTipo, type Periodo,
} from "@/lib/tesoreria/recobros-vista";
import { exportarRecobrosExcel } from "@/lib/tesoreria/recobros-export";
import type { EventoSolicitud } from "@/lib/tesoreria/recobros-camaras-data";
import { actualizarRecobrosPagina, obtenerEventosRecobro } from "./actions";

const nf = new Intl.NumberFormat("es-CO");
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$${nf.format(n)}`);
const cuando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—";
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

const BARRA: Record<Semaforo, string> = {
  verde: "bg-emerald-500", ambar: "bg-amber-500", rojo: "bg-red-500", gris: "bg-slate-300",
};
const CHIP: Record<EstadoRecobro, string> = {
  solicitud_creada: "bg-slate-100 text-slate-700",
  en_revision: "bg-sky-100 text-sky-800",
  decide_subgerencia: "bg-violet-100 text-violet-800",
  sin_gestionar: "bg-amber-100 text-amber-800",
  en_gestion: "bg-orange-100 text-orange-800",
  plazo_vencido: "bg-red-100 text-red-800",
  incobrable_por_autorizar: "bg-rose-100 text-rose-800",
  para_liquidacion: "bg-fuchsia-100 text-fuchsia-800",
  pagado: "bg-emerald-100 text-emerald-800",
  cerrado_sin_cobro: "bg-slate-100 text-slate-500",
  liquidado: "bg-slate-100 text-slate-500",
  anulada: "bg-slate-100 text-slate-400",
};
const TIPO_LABEL = { camara: "Cámara", cartulina: "Cartulina" } as const;
const FILTROS: FiltroRapido[] = ["todos", "por_revisar", "decide_subgerencia", "sin_gestionar", "en_gestion", "plazo_vencido", "pagados"];
const POR_PAGINA = 100;

export function RecobrosClient({
  filas, catalogo, hoy, disponible, soloCajero, actualizadoAt, errorGema,
}: {
  filas: FilaBandeja[];
  catalogo: { clave: string; nombre: string }[];
  hoy: string;
  disponible: boolean;
  soloCajero: boolean;
  actualizadoAt: string | null;
  errorGema: string | null;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [rapido, setRapido] = useState<FiltroRapido>(soloCajero ? "todos" : "todos");
  const [estadoSel, setEstadoSel] = useState<EstadoRecobro | null>(null);
  const [buscar, setBuscar] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sel, setSel] = useState<{ por: "conductor" | "buseta"; clave: string; nombre: string } | null>(null);
  // «Ver más» vuelve a 100 filas cuando cambia cualquier filtro.
  const [pagina, setPagina] = useState({ clave: "", n: POR_PAGINA });
  const [abierta, setAbierta] = useState<FilaBandeja | null>(null);

  const nombres = useMemo(() => new Map(catalogo.map((c) => [c.clave, c.nombre])), [catalogo]);
  const nombreResultado = (c: string) => nombres.get(c) ?? c;

  const deTipo = useMemo(() => filas.filter((f) => tipo === "todos" || f.tipo === tipo), [filas, tipo]);
  const rango = rangoPeriodo(periodo, hoy);
  const delPeriodo = useMemo(() => deTipo.filter((f) => enRango(f.fechaViaje, rango)), [deTipo, rango]);
  const r = resumen(delPeriodo);
  const sinGestionHoy = deTipo.filter((f) => f.sinGestionHoy).length;

  const conteoEstados = useMemo(() => {
    const m = new Map<EstadoRecobro, number>();
    for (const f of deTipo) m.set(f.estado.estado, (m.get(f.estado.estado) ?? 0) + 1);
    return m;
  }, [deTipo]);

  const visibles = useMemo(() => ordenUrgencia(deTipo.filter((f) =>
    (estadoSel ? f.estado.estado === estadoSel : pasaFiltroRapido(f, rapido))
    && pasaBusqueda(f, buscar)
    && (!desde || f.fechaViaje >= desde) && (!hasta || f.fechaViaje <= hasta)
    && (!sel || (sel.por === "conductor"
      ? (f.conductorCedula ?? f.conductorNombre ?? "sin dato") === sel.clave
      : (f.vehiculoCodigo ?? "sin dato") === sel.clave)),
  )), [deTipo, estadoSel, rapido, buscar, desde, hasta, sel]);

  const claveFiltros = JSON.stringify([estadoSel, rapido, buscar, desde, hasta, sel, tipo]);
  const mostrar = pagina.clave === claveFiltros ? pagina.n : POR_PAGINA;

  const elegirRanking = (por: "conductor" | "buseta", p: PuestoRanking) => {
    setSel({ por, clave: p.clave, nombre: p.nombre });
    setEstadoSel(null);
    setRapido("todos");
    document.getElementById("bandeja")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function exportar() {
    const contexto = [
      `Generado el ${cuando(new Date().toISOString())} · ${plural(visibles.length, "solicitud", "solicitudes")}`,
      `Filtro: ${estadoSel ? ESTADO_LABEL[estadoSel] : FILTRO_RAPIDO_LABEL[rapido]} · tipo ${tipo === "todos" ? "cámara y cartulina" : TIPO_LABEL[tipo]}`
        + (sel ? ` · ${sel.por} ${sel.nombre}` : "") + (buscar ? ` · búsqueda "${buscar}"` : "")
        + (desde || hasta ? ` · viajes ${desde || "…"} a ${hasta || "…"}` : ""),
    ];
    await exportarRecobrosExcel({
      filas: visibles,
      titulo: "Recobros · bandeja e historial de gestión",
      contexto,
      nombreArchivo: `recobros_${hoy}${sel ? `_${sel.clave}` : ""}.xlsx`,
      nombreResultado,
    });
  }

  if (!disponible) {
    return (
      <p className="mx-auto mt-6 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Falta aplicar la migración del módulo de Recobros (20261029184904).
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Periodo"
            className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5">
            {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)} aria-label="Tipo de solicitud"
            className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5">
            <option value="todos">Cámara y cartulina</option>
            <option value="camara">Revisión de cámara</option>
            <option value="cartulina">Revisión de cartulina</option>
          </select>
          {rango && <span className="text-xs text-gray-400">Viajes del {rango.desde} al {rango.hasta}</span>}
        </div>
        <ActualizarGemaRecobros accion={actualizarRecobrosPagina} actualizadoAt={actualizadoAt} error={errorGema} />
      </div>

      {soloCajero && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Ve los recobros por cobrar. La gestión diaria se registra por ahora en{" "}
          <Link href="/tesoreria/revision-cartulina/solicitudes-camaras" className="font-medium underline">Solicitudes a cámaras</Link>.
        </p>
      )}

      {/* 1 · Resumen */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" aria-label="Resumen">
        <Tarjeta titulo="Recobros habilitados" valor={nf.format(r.recobrosHabilitados)} />
        <Tarjeta titulo="Timbradas no registradas" valor={nf.format(r.timbradasNoRegistradas)} />
        <Tarjeta titulo="Valor que se habría dejado de cobrar" valor={pesos(r.valorDejadoDeCobrar)} destacada />
        <Tarjeta titulo="Por cobrar" valor={pesos(r.porCobrar)} />
        <Tarjeta titulo="Recaudado" valor={pesos(r.recaudado)} />
        <Tarjeta
          titulo="Días promedio de revisión"
          valor={r.diasPromedioRevision == null ? "—" : r.diasPromedioRevision.toLocaleString("es-CO", { maximumFractionDigits: 1 })}
          nota="meta: 1 día hábil"
          alerta={(r.diasPromedioRevision ?? 0) > 1}
        />
        <Tarjeta titulo="Sin gestión hoy" valor={nf.format(sinGestionHoy)} alerta={sinGestionHoy > 0} nota="recobros por cobrar" />
      </section>

      {/* 2 · Flujo */}
      {!soloCajero && (
        <section aria-label="Flujo" className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white p-3">
          <div className="flex min-w-max gap-1.5">
            {ESTADOS_FLUJO.map((e) => {
              const n = conteoEstados.get(e) ?? 0;
              const activo = estadoSel === e;
              return (
                <button key={e} type="button"
                  onClick={() => { setEstadoSel(activo ? null : e); setRapido("todos"); }}
                  className={`flex min-w-[104px] flex-col items-start rounded-lg border px-3 py-2 text-left ${activo ? "border-[#4F46E5] ring-2 ring-[#4F46E5]/30" : "border-[#E2E8F0]"} ${n ? "" : "opacity-50"}`}>
                  <span className="text-xl font-bold tabular-nums text-gray-900">{n}</span>
                  <span className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${CHIP[e]}`}>{ESTADO_LABEL[e]}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 3 · Bandeja */}
      <section id="bandeja" aria-label="Bandeja de recobros" className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => {
            const n = deTipo.filter((x) => pasaFiltroRapido(x, f)).length;
            const activo = !estadoSel && rapido === f;
            return (
              <button key={f} type="button" onClick={() => { setRapido(f); setEstadoSel(null); }}
                className={`rounded-full px-3 py-1 text-sm font-medium ${activo ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] text-gray-600"}`}>
                {FILTRO_RAPIDO_LABEL[f]} <span className={activo ? "text-white/80" : "text-gray-400"}>{n}</span>
              </button>
            );
          })}
          {estadoSel && (
            <Quitar onClick={() => setEstadoSel(null)}>Estado: {ESTADO_LABEL[estadoSel]}</Quitar>
          )}
          {sel && <Quitar onClick={() => setSel(null)}>{sel.por === "conductor" ? "Conductor" : "Buseta"}: {sel.nombre}</Quitar>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Conductor, buseta, placa o n.º de viaje"
              className="w-full rounded-lg border border-[#E2E8F0] py-1.5 pl-8 pr-2 text-sm" />
          </label>
          <label className="flex flex-col text-xs text-gray-500">Viajes desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm" />
          </label>
          <label className="flex flex-col text-xs text-gray-500">hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm" />
          </label>
          <BotonesExportar sinDatos={visibles.length === 0} formatos={["xlsx"]} onExportar={exportar} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="w-2 p-0" aria-label="Semáforo" />
                <th className="px-2 py-2">Viaje</th>
                <th className="px-2 py-2">Buseta</th>
                <th className="px-2 py-2">Conductor</th>
                <th className="px-2 py-2 text-right">Registradora</th>
                <th className="px-2 py-2 text-right">Cámara</th>
                <th className="px-2 py-2 text-right">Diferencia</th>
                <th className="px-2 py-2 text-right">Valor</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2 text-right">Días sin pagar</th>
                <th className="px-2 py-2">Última gestión</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, mostrar).map((f) => (
                <tr key={f.id} onClick={() => setAbierta(f)} className="cursor-pointer border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="p-0"><span className={`block h-12 w-1.5 ${BARRA[f.semaforo]}`} /></td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-gray-900">{f.numero}</div>
                    <div className="text-xs text-gray-500">{f.fechaViaje} · {TIPO_LABEL[f.tipo]}</div>
                  </td>
                  <td className="px-2 py-2">{f.vehiculoCodigo ?? "—"}</td>
                  <td className="max-w-[220px] truncate px-2 py-2" title={f.conductorNombre ?? ""}>{f.conductorNombre ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{f.registradora ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {f.tipo === "cartulina" ? "—" : f.conteo ?? <span className="text-xs text-gray-400">sin conteo</span>}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${(f.diferencia ?? 0) > 0 ? "font-semibold text-red-700" : ""}`}>{f.diferencia ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{f.valorRecobro ? pesos(f.valorRecobro) : "—"}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[f.estado.estado]}`}>{f.textoEstado}</span>
                    {f.correccionesPendientes > 0 && <span className="ml-1 text-[11px] text-violet-700">corrección por validar</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {f.diasSinPagar ?? "—"}
                    {f.diasSinRegistro.length > 0 && (
                      <div className="text-[11px] font-medium text-red-700">{plural(f.diasSinRegistro.length, "día", "días")} sin registro</div>
                    )}
                  </td>
                  <td className="max-w-[240px] px-2 py-2 text-xs text-gray-600">
                    {f.ultimaGestion ? (
                      <>
                        <div className="truncate font-medium text-gray-800">{f.ultimaGestion.resultado}</div>
                        <div className="truncate">{f.ultimaGestion.fecha} · {f.ultimaGestion.usuario ?? "—"}</div>
                        {f.ultimaGestion.compromiso && <div>Compromiso {f.ultimaGestion.compromiso}</div>}
                      </>
                    ) : f.sinGestionHoy ? <span className="font-medium text-red-700">Sin gestión</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length === 0 && <p className="py-10 text-center text-sm text-gray-400">No hay recobros con estos filtros.</p>}
          {visibles.length > mostrar && (
            <button type="button" onClick={() => setPagina({ clave: claveFiltros, n: mostrar + POR_PAGINA })}
              className="mx-auto mt-3 block rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm text-gray-700">
              Ver {Math.min(POR_PAGINA, visibles.length - mostrar)} más de {visibles.length - mostrar}
            </button>
          )}
        </div>
      </section>

      {/* 4 · Rankings */}
      {!soloCajero && (
        <section aria-label="Rankings" className="grid gap-4 lg:grid-cols-2">
          <Ranking titulo="Conductores con más timbradas no registradas" puestos={ranking(delPeriodo, "conductor")} onElegir={(p) => elegirRanking("conductor", p)} />
          <Ranking titulo="Busetas con más timbradas no registradas" puestos={ranking(delPeriodo, "buseta")} onElegir={(p) => elegirRanking("buseta", p)} prefijo="Buseta " />
        </section>
      )}

      <Sheet open={!!abierta} onOpenChange={(o) => { if (!o) setAbierta(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {abierta && <Detalle key={abierta.id} f={abierta} todas={filas} nombreResultado={nombreResultado} onElegir={setAbierta} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Tarjeta({ titulo, valor, nota, destacada, alerta }: { titulo: string; valor: string; nota?: string; destacada?: boolean; alerta?: boolean }) {
  const rojo = destacada || alerta;
  return (
    <div className={`rounded-xl border px-3 py-3 ${rojo ? "border-red-200 bg-red-50" : "border-[#E2E8F0] bg-white"}`}>
      <div className={`text-xl font-bold tabular-nums ${rojo ? "text-red-700" : "text-gray-900"} ${destacada ? "text-2xl" : ""}`}>{valor}</div>
      <div className="mt-0.5 text-xs font-medium text-gray-600">{titulo}</div>
      {nota && <div className="text-[11px] text-gray-400">{nota}</div>}
    </div>
  );
}

function Quitar({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4338CA]">
      {children} <X className="h-3.5 w-3.5" />
    </button>
  );
}

function Ranking({ titulo, puestos, onElegir, prefijo = "" }: {
  titulo: string; puestos: PuestoRanking[]; onElegir: (p: PuestoRanking) => void; prefijo?: string;
}) {
  const max = Math.max(1, ...puestos.map((p) => p.timbradas));
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-800">{titulo}</h2>
      {puestos.length === 0 ? <p className="text-sm text-gray-400">Sin recobros en el periodo.</p> : (
        <ul className="space-y-2">
          {puestos.map((p) => (
            <li key={p.clave}>
              <button type="button" onClick={() => onElegir(p)} className="w-full text-left">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-gray-800 hover:underline">{prefijo}{p.nombre}</span>
                  <span className="shrink-0 tabular-nums text-gray-500">
                    {p.timbradas} timbr. · {pesos(p.valor)} · {plural(p.viajes, "viaje", "viajes")}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-red-400" style={{ width: `${(p.timbradas / max) * 100}%` }} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Detalle (panel lateral) ──────────────────────────────────────────────────

const ACCION_EVENTO: Record<string, string> = {
  cobro_registrado: "Cobro registrado en caja",
  cobro_corregido: "Cobro corregido",
  migrado_a_seguimiento: "Pasó a seguimiento",
  incobrable_solicitado: "Incobrable solicitado",
  incobrable_autorizado: "Incobrable autorizado",
  incobrable_rechazado: "Incobrable rechazado",
  incobrable_reabierto: "Incobrable reabierto",
  correccion_solicitada: "Corrección solicitada",
  correccion_aprobada: "Corrección aprobada",
  correccion_rechazada: "Corrección rechazada",
  liquidacion_marcada: "Pasó a liquidación definitiva",
  liquidacion_cerrada: "Cerrado por liquidación definitiva",
  pago_registrado: "Pago registrado",
  rescate_migracion: "Recuperado en la migración",
};

interface ItemTiempo { orden: string; cuando: string; titulo: string; quien: string | null; detalle?: string | null; rojo?: boolean }

function lineaDeTiempo(f: FilaBandeja, eventos: EventoSolicitud[], nombreResultado: (c: string) => string): ItemTiempo[] {
  const s = f.solicitud;
  const items: ItemTiempo[] = [
    { orden: s.at, cuando: cuando(s.at), titulo: "Solicitud creada", quien: s.por, detalle: [s.motivo, s.nota].filter(Boolean).join(" · ") || null },
  ];
  if (s.tomadoAt && s.tomadoAt !== s.resueltoAt) items.push({ orden: s.tomadoAt, cuando: cuando(s.tomadoAt), titulo: "Revisión tomada", quien: s.tomadoPor });
  if (s.resueltoAt && f.resultado) {
    const cifras = f.tipo === "camara" && f.conteo != null
      ? `Cámara ${f.conteo}, registradora ${f.registradora ?? "—"}, diferencia ${f.diferencia ?? "—"}`
      : f.diferencia != null ? `Diferencia sin justificar ${f.diferencia}` : null;
    items.push({
      orden: s.resueltoAt, cuando: cuando(s.resueltoAt),
      titulo: `Revisión: ${f.tipo === "cartulina" ? "Recobro por cartulina" : RESULTADO_REVISION_LABEL[f.resultado]}`,
      quien: s.resueltoPor, detalle: [cifras, f.valorRecobro ? pesos(f.valorRecobro) : null, s.notaRevision].filter(Boolean).join(" · ") || null,
    });
  }
  if (s.subgerenciaAt) {
    items.push({
      orden: s.subgerenciaAt, cuando: cuando(s.subgerenciaAt),
      titulo: `Subgerencia: ${s.subgerenciaDecision === "cobrar" ? "Cobrar" : "No cobrar"}`, quien: s.subgerenciaPor, detalle: s.subgerenciaNota,
    });
  }
  if (s.anuladaAt) items.push({ orden: s.anuladaAt, cuando: cuando(s.anuladaAt), titulo: "Solicitud anulada", quien: null, rojo: true });
  for (const g of f.gestiones) {
    items.push({
      orden: g.createdAt, cuando: cuando(g.createdAt), titulo: nombreResultado(String(g.resultado)), quien: g.usuarioEmail,
      detalle: [
        g.compromisoFecha && `compromiso ${g.compromisoFecha}`,
        g.valorRecibido && `recibido ${pesos(g.valorRecibido)}`,
        g.autorizadoPor && `autorizó ${g.autorizadoPor}`,
        g.observacion,
      ].filter(Boolean).join(" · ") || null,
    });
  }
  for (const d of f.diasSinRegistro) {
    items.push({ orden: `${d}T23:59:59`, cuando: d, titulo: "Sin registro del cajero", quien: null, rojo: true });
  }
  for (const e of eventos) {
    const t = ACCION_EVENTO[e.accion];
    if (!t) continue;
    const d = e.despues ?? {};
    const detalle = [d.motivo, d.nota, d.valor != null ? pesos(Number(d.valor)) : null, d.soporte].filter(Boolean).map(String).join(" · ");
    items.push({ orden: e.createdAt, cuando: cuando(e.createdAt), titulo: t, quien: e.usuarioEmail, detalle: detalle || null });
  }
  return items.sort((a, b) => a.orden.localeCompare(b.orden));
}

function Detalle({ f, todas, nombreResultado, onElegir }: {
  f: FilaBandeja; todas: FilaBandeja[]; nombreResultado: (c: string) => string; onElegir: (f: FilaBandeja) => void;
}) {
  const [eventos, setEventos] = useState<EventoSolicitud[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El panel se monta de nuevo por recobro (key), así que empieza vacío.
  useEffect(() => {
    let vivo = true;
    obtenerEventosRecobro(f.id).then((r) => {
      if (!vivo) return;
      if (r.ok) setEventos(r.eventos ?? []);
      else setError(r.error ?? "No se pudo leer la línea de tiempo.");
    });
    return () => { vivo = false; };
  }, [f.id]);

  const otros = todas.filter((x) => x.id !== f.id && f.conductorCedula && x.conductorCedula === f.conductorCedula);
  const abiertos = [f, ...otros].filter((x) => ESTADOS_CAJERO.has(x.estado.estado) || x.estado.estado === "para_liquidacion");
  const adeudado = abiertos.reduce((t, x) => t + x.saldo, 0);
  const tiempo = lineaDeTiempo(f, eventos ?? [], nombreResultado);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Viaje {f.numero} · buseta {f.vehiculoCodigo ?? "—"}</SheetTitle>
        <SheetDescription>
          {f.conductorNombre ?? "Sin conductor"}{f.conductorCedula ? ` (${f.conductorCedula})` : ""} · {f.ruta ?? "Sin ruta"}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-6 text-sm">
        <div className={`rounded-lg px-3 py-2 ${CHIP[f.estado.estado]}`}>
          <div className="font-semibold">{f.textoEstado}</div>
          <div className="text-xs opacity-80">
            {plural(f.diasEnEstado, "día hábil", "días hábiles")} en el estado
            {f.estado.plazoHasta && ` · plazo de pago ${f.estado.plazoHasta}`}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <Dato t="Fecha" v={f.fechaViaje} />
          <Dato t="Tipo" v={TIPO_LABEL[f.tipo]} />
          <Dato t="Placa" v={f.placa ?? "—"} />
          <Dato t="Registradora" v={f.registradora ?? "—"} />
          <Dato t="Cámara" v={f.tipo === "cartulina" ? "—" : f.conteo ?? "sin conteo"} />
          <Dato t="Diferencia" v={f.diferencia ?? "—"} rojo={(f.diferencia ?? 0) > 0} />
          <Dato t="Valor" v={f.valorRecobro ? pesos(f.valorRecobro) : "—"} />
          <Dato t="Recibido" v={pesos(f.recibido)} />
          <Dato t="Saldo" v={pesos(f.saldo)} rojo={f.saldo > 0} />
        </dl>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Línea de tiempo</h3>
          {error && <p className="mb-2 text-xs text-red-700">{error}</p>}
          <ol className="relative space-y-3 border-l border-[#E2E8F0] pl-4">
            {tiempo.map((it, i) => (
              <li key={i} className="relative">
                <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${it.rojo ? "bg-red-500" : "bg-[#4F46E5]"}`} />
                <div className={`font-medium ${it.rojo ? "text-red-700" : "text-gray-900"}`}>{it.titulo}</div>
                <div className="text-xs text-gray-500">{it.cuando}{it.quien ? ` · ${it.quien}` : ""}</div>
                {it.detalle && <div className="mt-0.5 text-xs text-gray-700">{it.detalle}</div>}
              </li>
            ))}
            {eventos == null && !error && (
              <li className="flex items-center gap-1.5 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando eventos…</li>
            )}
          </ol>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Historial del conductor</h3>
          {!f.conductorCedula ? <p className="text-xs text-gray-400">Sin cédula del conductor.</p> : (
            <>
              <p className="mb-2 text-sm">
                Total adeudado: <span className={`font-semibold ${adeudado > 0 ? "text-red-700" : "text-gray-900"}`}>{pesos(adeudado)}</span>
                <span className="text-xs text-gray-400"> · {plural(abiertos.length, "recobro abierto", "recobros abiertos")}</span>
              </p>
              {otros.length === 0 ? <p className="text-xs text-gray-400">No tiene otros recobros.</p> : (
                <ul className="divide-y divide-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
                  {otros.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => onElegir(o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8FAFC]">
                        <span>{o.fechaViaje} · viaje {o.numero} · {TIPO_LABEL[o.tipo]}</span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{o.valorRecobro ? pesos(o.valorRecobro) : "—"}</span>
                          <span className={`rounded-full px-1.5 py-0.5 ${CHIP[o.estado.estado]}`}>{ESTADO_LABEL[o.estado.estado]}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Dato({ t, v, rojo }: { t: string; v: React.ReactNode; rojo?: boolean }) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
      <dt className="text-[11px] text-gray-400">{t}</dt>
      <dd className={`font-semibold tabular-nums ${rojo ? "text-red-700" : "text-gray-900"}`}>{v}</dd>
    </div>
  );
}
