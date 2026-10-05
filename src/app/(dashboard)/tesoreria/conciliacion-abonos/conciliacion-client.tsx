"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Download, Info, Search } from "lucide-react";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { pesos } from "@/lib/tesoreria/formato-liquidacion";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";
import {
  ESTADO_AYUDA, ESTADO_COLOR, ESTADO_GEMA_COLOR, ESTADO_LABEL, ESTADOS_CONCILIACION, FECHA_RE, HORAS_PENDIENTE_ATRASADO, TOLERANCIA_PESOS,
  coincide, conciliacionCsv, resumirPor, totales,
  type EstadoConciliacion, type FilaConciliacion, type ResumenConcepto,
} from "@/lib/tesoreria/conciliacion-abonos-reglas";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";
const btnCls = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium disabled:opacity-50";
const PERIODOS = [
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días" },
  { dias: 365, label: "12 meses" },
] as const;
const AGRUPACIONES = {
  concepto: { label: "Concepto", clave: (f: FilaConciliacion) => f.concepto },
  registro: { label: "Quién registró el abono", clave: (f: FilaConciliacion) => f.abonos.find((a) => !a.anulado)?.usuario ?? null },
  cajero: { label: "Cajero del recaudo", clave: (f: FilaConciliacion) => f.cajero },
  vehiculo: { label: "Vehículo", clave: (f: FilaConciliacion) => f.codigoVehiculo },
} as const;
type Agrupacion = keyof typeof AGRUPACIONES;

const fechaHora = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : "—");
const horasTexto = (h: number | null) => (h == null ? "—" : h < 24 ? `${Math.round(h)} h` : `${Math.round((h / 24) * 10) / 10} d`);
const signo = (n: number) => (n > 0 ? `+${pesos(n)}` : pesos(n));

/** Estado del abono tal como lo escribe GEMA (GESTIONADO, POR GESTIONAR, ANULADO). */
function ChipGema({ texto }: { texto: string }) {
  const c = ESTADO_GEMA_COLOR[texto] ?? { suave: "#ede9fe", texto: "#5b21b6" };
  return (
    <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: c.suave, color: c.texto }}>
      {texto}
    </span>
  );
}

function ChipsGema({ estados }: { estados: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {estados.map((e) => <ChipGema key={e} texto={e} />)}
    </span>
  );
}

/** Días (o horas) entre dos fechas locales "AAAA-MM-DDTHH:MM:SS". */
function antiguedad(desde: string, hasta: string): string {
  const h = (Date.parse(`${hasta}Z`) - Date.parse(`${desde.slice(0, 19)}Z`)) / 36e5;
  return h < 0 ? "—" : h < 24 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
}

function ChipEstado({ estado }: { estado: EstadoConciliacion }) {
  const c = ESTADO_COLOR[estado];
  return (
    <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: c.suave, color: c.texto }} title={ESTADO_AYUDA[estado]}>
      {ESTADO_LABEL[estado]}
    </span>
  );
}

export function ConciliacionAbonosClient({
  hoy, desde, hasta, aviso, filas, pendientes, porGestionar, desdePendientes, corteRecaudo, rangoDatos, estadoInicial, queryInicial, error,
}: {
  hoy: string;
  desde: string;
  hasta: string;
  aviso: string | null;
  filas: FilaConciliacion[];
  pendientes: FilaConciliacion[];
  /** Viajes con algún abono POR GESTIONAR en GEMA, de cualquier fecha. */
  porGestionar: FilaConciliacion[];
  desdePendientes: string;
  /** Hasta cuándo está sincronizado el recaudo (hora local). */
  corteRecaudo: string;
  rangoDatos: { desde: string | null; hasta: string | null };
  estadoInicial: EstadoConciliacion | null;
  queryInicial: string;
  error: string | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoConciliacion | null>(estadoInicial);
  const [query, setQuery] = useState(queryInicial);
  const [concepto, setConcepto] = useState<string>("");
  const [estadoGema, setEstadoGema] = useState<string>("");
  const [agrupar, setAgrupar] = useState<Agrupacion>("concepto");
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [desdeEdit, setDesdeEdit] = useState(desde);
  const [hastaEdit, setHastaEdit] = useState(hasta);
  const rangoValido = FECHA_RE.test(desdeEdit) && FECHA_RE.test(hastaEdit) && desdeEdit <= hastaEdit;

  const t = useMemo(() => totales(filas), [filas]);
  const conceptos = useMemo(() => [...new Set(filas.flatMap((f) => f.conceptos))].sort(), [filas]);
  const estadosGema = useMemo(() => [...new Set(filas.flatMap((f) => f.estadosGema))].sort(), [filas]);
  const resumen = useMemo(() => resumirPor(filas, AGRUPACIONES[agrupar].clave), [filas, agrupar]);
  const visibles = useMemo(() => {
    const q = query.trim();
    return filas
      .filter(
        (f) =>
          (!estado || f.estado === estado) &&
          (!concepto || f.conceptos.includes(concepto)) &&
          (!estadoGema || f.estadosGema.includes(estadoGema)) &&
          coincide(f, q)
      )
      .sort((a, b) => {
        // Primero lo que pide acción: pendientes, luego las diferencias más grandes.
        if ((a.estado === "pendiente") !== (b.estado === "pendiente")) return a.estado === "pendiente" ? -1 : 1;
        return Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0) || b.primerAbono.localeCompare(a.primerAbono);
      });
  }, [filas, estado, concepto, estadoGema, query]);
  // Se pagina el detalle ya filtrado y ordenado; el CSV sigue bajando todos los `visibles`.
  const pagina = usePaginacion(visibles, { reiniciar: `${estado}|${concepto}|${estadoGema}|${query.trim()}` });
  const anclaDetalle = useRef<HTMLDivElement>(null);
  const pendientesAtrasados = pendientes.filter((p) => (p.horas ?? 0) >= HORAS_PENDIENTE_ATRASADO);
  // Abonos posteriores al corte: su recaudo todavía no se sincroniza, no son un pendiente real.
  const posterioresAlCorte = pendientes.filter((p) => p.primerAbono > corteRecaudo).length;
  const montoPendiente = pendientes.reduce((s, p) => s + p.abonado, 0);
  const conRecaudo = t.viajes - t.porEstado.pendiente.viajes - t.porEstado.anulado.viajes;

  function irAPeriodo(d: string, h: string) {
    const sp = new URLSearchParams({ desde: d, hasta: h });
    if (estado) sp.set("estado", estado);
    if (query.trim()) sp.set("q", query.trim());
    router.push(`/tesoreria/conciliacion-abonos?${sp.toString()}`);
  }
  function filtrarEstado(e: EstadoConciliacion | null) {
    setEstado(e);
    const sp = new URLSearchParams(window.location.search);
    if (e) sp.set("estado", e);
    else sp.delete("estado");
    window.history.replaceState(null, "", `/tesoreria/conciliacion-abonos?${sp.toString()}`);
  }
  function alternar(id: number) {
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function descargar() {
    const blob = new Blob(["﻿" + conciliacionCsv(visibles)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conciliacion_abonos_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      {/* Filtros de periodo */}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div>
          <span className={labelCls}>Periodo rápido (día del abono)</span>
          <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
            {PERIODOS.map((p) => {
              const d = sumarDias(hoy, -(p.dias - 1));
              const activo = hasta === hoy && desde === d;
              return (
                <button key={p.dias} type="button" onClick={() => irAPeriodo(d, hoy)}
                  className={`px-3 py-2 text-sm font-medium ${activo ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (rangoValido) irAPeriodo(desdeEdit, hastaEdit); }}>
          <label>
            <span className={labelCls}>Desde</span>
            <input type="date" className={inputCls} value={desdeEdit} min={rangoDatos.desde ?? undefined} max={hoy} onChange={(e) => setDesdeEdit(e.target.value)} />
          </label>
          <label>
            <span className={labelCls}>Hasta</span>
            <input type="date" className={inputCls} value={hastaEdit} min={rangoDatos.desde ?? undefined} max={hoy} onChange={(e) => setHastaEdit(e.target.value)} />
          </label>
          <button type="submit" disabled={!rangoValido || (desdeEdit === desde && hastaEdit === hasta)}
            className={`${btnCls} border-[#4F46E5] bg-[#4F46E5] text-white hover:bg-[#4338CA]`}>
            Aplicar
          </button>
        </form>
        <p className="ml-auto max-w-md text-xs text-gray-500">
          Abonos de GEMA disponibles del {rangoDatos.desde ?? "—"} al {rangoDatos.hasta ?? "—"}. Se sincronizan cada noche; lo de hoy
          aparece mañana. Diferencias menores a {pesos(TOLERANCIA_PESOS)} cuentan como cuadradas.
        </p>
      </section>

      {aviso && <Aviso texto={aviso} />}
      {error && <Aviso texto={`No se pudo armar la conciliación: ${error}`} />}

      {/* Abonos que GEMA tiene POR GESTIONAR: de cualquier fecha */}
      <section className={`rounded-xl border p-4 ${porGestionar.length ? "border-orange-300 bg-orange-50" : "border-[#E2E8F0] bg-white"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            Abonos POR GESTIONAR en GEMA: {porGestionar.reduce((s, f) => s + f.porGestionar, 0)} en {porGestionar.length}{" "}
            {porGestionar.length === 1 ? "viaje" : "viajes"} ·{" "}
            {pesos(porGestionar.reduce((s, f) => s + f.abonos.filter((a) => a.porGestionar && !a.anulado).reduce((x, a) => x + a.valor, 0), 0))}
          </h2>
          <span className="text-xs text-gray-600">Estado del abono en GEMA, sin importar la fecha. Se gestionan en GEMA; aquí se ven al día siguiente.</span>
        </div>
        {porGestionar.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">GEMA no tiene abonos por gestionar.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-orange-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-orange-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Abono</th>
                  <th className="px-3 py-2 text-left font-medium">Viaje</th>
                  <th className="px-3 py-2 text-left font-medium">Vehículo</th>
                  <th className="px-3 py-2 text-left font-medium">Conductor</th>
                  <th className="px-3 py-2 text-left font-medium">Concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-left font-medium">Registró</th>
                  <th className="px-3 py-2 text-left font-medium">Recaudo</th>
                  <th className="px-3 py-2 text-right font-medium" title="Desde el abono hasta el corte del recaudo">Antigüedad</th>
                </tr>
              </thead>
              <tbody>
                {porGestionar.flatMap((f) =>
                  f.abonos
                    .filter((a) => a.porGestionar && !a.anulado)
                    .map((a) => (
                      <tr key={a.id} className="border-t border-orange-100">
                        <td className="px-3 py-2 tabular-nums">#{a.id} <span className="text-gray-400">· {a.fecha.slice(0, 10)} {a.fecha.slice(11, 16)}</span></td>
                        <td className="px-3 py-2 tabular-nums">{f.idViaje} <span className="text-gray-400">· v{f.numViaje ?? "?"} · {f.fechaViaje}</span></td>
                        <td className="px-3 py-2">{f.codigoVehiculo} <span className="text-gray-400">{f.placa}</span></td>
                        <td className="px-3 py-2">{f.conductor ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{a.concepto}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{pesos(a.valor)}</td>
                        <td className="px-3 py-2 text-xs">{a.usuario ?? "—"}</td>
                        <td className="px-3 py-2">
                          {f.recaudoNeto == null ? <ChipEstado estado="pendiente" /> : <span className="tabular-nums">{pesos(f.recaudoNeto)}</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-orange-800">{antiguedad(a.fecha, corteRecaudo)}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pendientes de recaudo: siempre visibles, sea cual sea el periodo */}
      <section className={`rounded-xl border p-4 ${pendientes.length ? "border-amber-300 bg-amber-50" : "border-[#E2E8F0] bg-white"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Clock className="h-4 w-4 text-amber-600" />
            Abonos sin recaudo: {pendientes.length} {pendientes.length === 1 ? "viaje" : "viajes"} · {pesos(montoPendiente)}
          </h2>
          <span className="text-xs text-gray-600">
            Abonos vigentes desde el {desdePendientes} cuyo viaje no tiene recaudo con el corte del {fechaHora(corteRecaudo)}.
            {pendientesAtrasados.length > 0 && <strong className="ml-1 text-amber-800">{pendientesAtrasados.length} con más de {HORAS_PENDIENTE_ATRASADO} h.</strong>}
          </span>
        </div>
        {posterioresAlCorte > 0 && (
          <p className="mt-1 text-xs text-gray-600">
            {posterioresAlCorte} se registraron después de ese corte: su recaudo llega con la próxima sincronización y es normal que aún no aparezca.
          </p>
        )}
        {pendientes.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No hay abonos esperando recaudo.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Abono</th>
                  <th className="px-3 py-2 text-left font-medium">Viaje</th>
                  <th className="px-3 py-2 text-left font-medium">Vehículo</th>
                  <th className="px-3 py-2 text-left font-medium">Conductor</th>
                  <th className="px-3 py-2 text-left font-medium">Concepto</th>
                  <th className="px-3 py-2 text-left font-medium">Estado en GEMA</th>
                  <th className="px-3 py-2 text-right font-medium">Abonado</th>
                  <th className="px-3 py-2 text-left font-medium">Despacho</th>
                  <th className="px-3 py-2 text-right font-medium" title="Desde el abono hasta el corte del recaudo">Esperando</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.idViaje} className="border-t border-amber-100">
                    <td className="px-3 py-2 tabular-nums">{fechaHora(p.primerAbono)}</td>
                    <td className="px-3 py-2 tabular-nums">{p.idViaje} <span className="text-gray-400">· v{p.numViaje ?? "?"} · {p.fechaViaje}</span></td>
                    <td className="px-3 py-2">{p.codigoVehiculo} <span className="text-gray-400">{p.placa}</span></td>
                    <td className="px-3 py-2">{p.conductor ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{p.conceptos.join(" / ")}</td>
                    <td className="px-3 py-2"><ChipsGema estados={p.estadosGema} /></td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{pesos(p.abonado)}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{p.estadoDespacho ?? "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${(p.horas ?? 0) >= HORAS_PENDIENTE_ATRASADO ? "font-semibold text-amber-800" : ""}`}>
                      {horasTexto(p.horas)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Indicadores del periodo */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tarjeta titulo="Abonado en el periodo" valor={pesos(t.abonado)} detalle={`${t.abonos.toLocaleString("es-CO")} abonos en ${(t.viajes - t.porEstado.anulado.viajes).toLocaleString("es-CO")} viajes`} />
        <Tarjeta titulo="Recaudo neto de esos viajes" valor={pesos(t.recaudado)} detalle={`${conRecaudo.toLocaleString("es-CO")} viajes ya recaudados`} />
        <Tarjeta titulo="Diferencia neta" valor={signo(t.diferenciaNeta)} detalle="Recaudo − abonado en los viajes recaudados" />
        <Tarjeta
          titulo="Viajes cuadrados"
          valor={conRecaudo > 0 ? `${Math.round((t.porEstado.cuadrado.viajes / conRecaudo) * 100)}%` : "—"}
          detalle={`${t.porEstado.cuadrado.viajes.toLocaleString("es-CO")} de ${conRecaudo.toLocaleString("es-CO")}`}
        />
        <Tarjeta
          titulo="Sobrantes por aclarar"
          valor={pesos(Math.abs(t.porEstado.recaudo_menor.diferencia))}
          detalle={`${t.porEstado.recaudo_menor.viajes} viajes con recaudo menor que lo abonado`}
          alerta={t.porEstado.recaudo_menor.viajes > 0}
        />
      </section>

      {/* Filtro por estado */}
      <section className="flex flex-wrap gap-2">
        <button type="button" onClick={() => filtrarEstado(null)}
          className={`rounded-full border px-3 py-1 text-sm font-medium ${estado == null ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4338CA]" : "border-[#E2E8F0] bg-white text-gray-600"}`}>
          Todos · {t.viajes.toLocaleString("es-CO")}
        </button>
        {ESTADOS_CONCILIACION.map((e) => {
          const c = ESTADO_COLOR[e];
          const n = t.porEstado[e];
          if (n.viajes === 0 && e === "anulado") return null;
          const activo = estado === e;
          return (
            <button key={e} type="button" onClick={() => filtrarEstado(activo ? null : e)} title={ESTADO_AYUDA[e]}
              className="rounded-full border px-3 py-1 text-sm font-medium"
              style={activo ? { borderColor: c.fuerte, backgroundColor: c.suave, color: c.texto } : { borderColor: "#E2E8F0", backgroundColor: "white", color: "#4b5563" }}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.fuerte }} />
              {ESTADO_LABEL[e]} · {n.viajes.toLocaleString("es-CO")}
              {e !== "cuadrado" && e !== "anulado" && n.viajes > 0 && (
                <span className="ml-1 text-gray-500">({e === "pendiente" ? pesos(n.abonado) : signo(n.diferencia)})</span>
              )}
            </button>
          );
        })}
      </section>

      {/* Resumen agrupado */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">Resumen por {AGRUPACIONES[agrupar].label.toLowerCase()}</h2>
          <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
            {(Object.keys(AGRUPACIONES) as Agrupacion[]).map((k) => (
              <button key={k} type="button" onClick={() => setAgrupar(k)}
                className={`px-3 py-1.5 text-xs font-medium ${agrupar === k ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}>
                {AGRUPACIONES[k].label}
              </button>
            ))}
          </div>
        </div>
        <TablaResumen filas={resumen.slice(0, 25)} onElegir={agrupar === "concepto" ? setConcepto : agrupar === "vehiculo" ? (v) => setQuery(v) : undefined} />
        {resumen.length > 25 && <p className="mt-2 text-xs text-gray-500">Se muestran los 25 de mayor valor abonado de {resumen.length}.</p>}
      </section>

      {/* Detalle por viaje */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="flex flex-wrap items-end gap-3 border-b border-[#E2E8F0] p-4">
          <label className="relative">
            <span className={labelCls}>Buscar</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-2 h-4 w-4 text-gray-400" />
            <input className={`${inputCls} w-64 pl-8`} placeholder="Viaje, bus, placa, conductor, cajero…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            <span className={labelCls}>Concepto</span>
            <select className={inputCls} value={concepto} onChange={(e) => setConcepto(e.target.value)}>
              <option value="">Todos</option>
              {conceptos.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span className={labelCls}>Estado en GEMA</span>
            <select className={inputCls} value={estadoGema} onChange={(e) => setEstadoGema(e.target.value)}>
              <option value="">Todos</option>
              {estadosGema.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <span className="text-sm text-gray-600">{visibles.length.toLocaleString("es-CO")} viajes</span>
          <button type="button" onClick={descargar} disabled={!visibles.length}
            className={`${btnCls} ml-auto border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]`}>
            <Download className="h-4 w-4" /> Descargar CSV
          </button>
        </div>
        <div ref={anclaDetalle} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-xs text-gray-600">
              <tr>
                <th className="w-8" />
                <th className="px-3 py-2 text-left font-medium">Primer abono</th>
                <th className="px-3 py-2 text-left font-medium">Viaje</th>
                <th className="px-3 py-2 text-left font-medium">Vehículo</th>
                <th className="px-3 py-2 text-left font-medium">Conductor</th>
                <th className="px-3 py-2 text-left font-medium">Concepto</th>
                <th className="px-3 py-2 text-left font-medium">Estado en GEMA</th>
                <th className="px-3 py-2 text-right font-medium">Abonado</th>
                <th className="px-3 py-2 text-right font-medium">Recaudo neto</th>
                <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                <th className="px-3 py-2 text-right font-medium">Tardó</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pagina.filas.map((f) => {
                const abierto = abiertos.has(f.idViaje);
                return (
                  <Fragment key={f.idViaje}>
                    <tr className="cursor-pointer border-t border-[#E2E8F0] hover:bg-[#F8FAFC]" onClick={() => alternar(f.idViaje)}>
                      <td className="pl-3 text-gray-400">{abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="px-3 py-2 tabular-nums">{fechaHora(f.primerAbono)}</td>
                      <td className="px-3 py-2 tabular-nums">{f.idViaje} <span className="text-xs text-gray-400">v{f.numViaje ?? "?"}</span></td>
                      <td className="px-3 py-2">{f.codigoVehiculo}</td>
                      <td className="max-w-[220px] truncate px-3 py-2" title={f.conductor ?? ""}>{f.conductor ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {f.conceptos.join(" / ")}
                        {f.abonos.length > 1 && <span className="ml-1 text-gray-400">({f.abonos.length} abonos)</span>}
                      </td>
                      <td className="px-3 py-2"><ChipsGema estados={f.estadosGema} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{pesos(f.abonado)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.recaudoNeto == null ? "—" : pesos(f.recaudoNeto)}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${f.estado === "recaudo_menor" ? "text-red-700" : f.estado === "recaudo_mayor" ? "text-blue-700" : "text-gray-500"}`}>
                        {f.diferencia == null ? "—" : signo(f.diferencia)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{horasTexto(f.horas)}</td>
                      <td className="px-3 py-2"><ChipEstado estado={f.estado} /></td>
                    </tr>
                    {abierto && (
                      <tr className="bg-[#F8FAFC]">
                        <td />
                        <td colSpan={11} className="px-3 pb-3 pt-1">
                          <div className="grid gap-3 text-xs text-gray-700 md:grid-cols-2">
                            <div>
                              <p className="mb-1 font-semibold text-gray-900">Abonos del viaje</p>
                              <ul className="space-y-0.5">
                                {f.abonos.map((a) => (
                                  <li key={a.id} className="flex flex-wrap items-center gap-1.5">
                                    <span className={a.anulado ? "text-gray-400 line-through" : ""}>
                                      #{a.id} · {fechaHora(a.fecha)} · {a.concepto} · <strong>{pesos(a.valor)}</strong> · {a.usuario ?? "—"}
                                    </span>
                                    <ChipGema texto={a.estadoTexto} />
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="mb-1 font-semibold text-gray-900">Recaudo</p>
                              {f.recaudoNeto == null ? (
                                <p>Sin recaudo en GEMA{f.estadoDespacho ? ` (despacho: ${f.estadoDespacho})` : ""}.</p>
                              ) : (
                                <p>
                                  {fechaHora(f.fechaRecaudo)} · neto <strong>{pesos(f.recaudoNeto)}</strong>
                                  {f.recaudoBruto != null && f.recaudoBruto !== f.recaudoNeto && ` (bruto ${pesos(f.recaudoBruto)})`} · cajero {f.cajero ?? "—"}
                                </p>
                              )}
                              <p className="mt-1">Fecha del viaje {f.fechaViaje ?? "—"} · ruta {f.ruta ?? "—"} · placa {f.placa ?? "—"} · cédula {f.cedula ?? "—"}</p>
                              <p className="mt-1 text-gray-500">{ESTADO_AYUDA[f.estado]}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {visibles.length === 0 && <p className="p-4 text-sm text-gray-500">No hay viajes con esos filtros.</p>}
        </div>
        <Paginador p={pagina} unidad="viajes" ancla={anclaDetalle} />
      </section>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{texto}</span>
    </div>
  );
}

function Tarjeta({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${alerta ? "border-red-200" : "border-[#E2E8F0]"}`}>
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
        {alerta && <Info className="h-4 w-4 text-red-600" />}
        {titulo}
      </div>
      <div className={`mt-2 text-2xl font-bold ${alerta ? "text-red-700" : "text-gray-900"}`}>{valor}</div>
      {detalle && <div className="mt-0.5 text-xs text-gray-500">{detalle}</div>}
    </div>
  );
}

function TablaResumen({ filas, onElegir }: { filas: ResumenConcepto[]; onElegir?: (v: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-600">
          <tr className="border-b border-[#E2E8F0]">
            <th className="py-2 pr-3 text-left font-medium">Grupo</th>
            <th className="px-3 py-2 text-right font-medium">Viajes</th>
            <th className="px-3 py-2 text-right font-medium">Abonado</th>
            <th className="px-3 py-2 text-right font-medium">Recaudo neto</th>
            <th className="px-3 py-2 text-right font-medium">Diferencia</th>
            <th className="px-3 py-2 text-right font-medium">Cuadrados</th>
            <th className="px-3 py-2 text-right font-medium">Sin recaudo</th>
            <th className="px-3 py-2 text-right font-medium">Tarda (mediana)</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => {
            const recaudados = r.viajes - r.pendientes;
            return (
              <tr key={r.concepto} className="border-b border-[#F1F5F9]">
                <td className="py-2 pr-3 font-medium text-gray-900">
                  {onElegir ? (
                    <button type="button" className="text-left hover:text-[#4F46E5] hover:underline" onClick={() => onElegir(r.concepto)}>{r.concepto}</button>
                  ) : r.concepto}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.viajes.toLocaleString("es-CO")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pesos(r.abonado)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pesos(r.recaudado)}</td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.diferencia < 0 ? "text-red-700" : r.diferencia > 0 ? "text-blue-700" : "text-gray-500"}`}>{signo(r.diferencia)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{recaudados > 0 ? `${Math.round((r.cuadrados / recaudados) * 100)}%` : "—"}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.pendientes ? "font-semibold text-amber-700" : "text-gray-400"}`}>{r.pendientes || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{horasTexto(r.horasMediana)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
