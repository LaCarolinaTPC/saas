"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Download, X } from "lucide-react";
import type { AlertaRecurrencia, ReporteDano } from "@/lib/mantenimiento/danos";
import { descargarCsv } from "@/lib/mantenimiento/csv";
import { cerrarAlertaMantenimiento } from "../actions";
import { verReportesDeAlerta } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-[#E2E8F0] p-2 text-sm text-gray-900";
const fmt = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });

type Cierre = { alerta: AlertaRecurrencia; reportes: ReporteDano[]; seleccion: Set<string> };
type Detalle = { cargando: boolean; reportes: ReporteDano[]; error?: string };

function vehiculo(a: AlertaRecurrencia) {
  return a.vehiculos?.placa ? `${a.codigo_vehiculo} — ${a.vehiculos.placa}` : a.codigo_vehiculo;
}

export function AlertasClient({ alertas, hoy, erroresCarga, puedeEditar }: {
  alertas: AlertaRecurrencia[];
  hoy: string;
  erroresCarga: string[];
  puedeEditar: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [detalles, setDetalles] = useState<Record<string, Detalle>>({});
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [verCerradas, setVerCerradas] = useState(false);

  // Cierre en dos tiempos, como en el sistema que este módulo reemplaza: se
  // abre un panel con el contexto de la alerta y sus reportes, y ahí se elige
  // cuáles se cierran.
  const [cierre, setCierre] = useState<Cierre | null>(null);
  const [orden, setOrden] = useState("");
  const [notas, setNotas] = useState("");
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [cargandoCierre, setCargandoCierre] = useState(false);

  const abiertas = useMemo(() => alertas.filter((a) => a.estado === "abierta"), [alertas]);
  const cerradas = useMemo(() => alertas.filter((a) => a.estado !== "abierta"), [alertas]);

  // El detalle se pide una sola vez al desplegarlo y se conserva mientras dure
  // la página: los reportes que originaron la alerta ya no cambian.
  function alternarDetalle(alertaId: string) {
    setExpandidas((prev) => {
      const s = new Set(prev);
      if (s.has(alertaId)) s.delete(alertaId); else s.add(alertaId);
      return s;
    });
    if (detalles[alertaId]) return;
    setDetalles((d) => ({ ...d, [alertaId]: { cargando: true, reportes: [] } }));
    verReportesDeAlerta(alertaId).then((res) => {
      setDetalles((d) => ({ ...d, [alertaId]: { cargando: false, reportes: res.reportes, error: res.error } }));
    });
  }

  async function abrirCierre(alerta: AlertaRecurrencia) {
    setMensaje(null);
    setErrorCierre(null);
    setOrden("");
    setNotas("");
    setCargandoCierre(true);
    setCierre({ alerta, reportes: [], seleccion: new Set() });
    const res = await verReportesDeAlerta(alerta.id);
    setCargandoCierre(false);
    if (res.error) return setErrorCierre(res.error);
    // Todos marcados por defecto: desmarcar es la excepción, no la norma.
    setCierre({ alerta, reportes: res.reportes, seleccion: new Set(res.reportes.map((r) => r.id)) });
  }

  function alternarSeleccion(id: string) {
    setCierre((c) => {
      if (!c) return c;
      const s = new Set(c.seleccion);
      if (s.has(id)) s.delete(id); else s.add(id);
      return { ...c, seleccion: s };
    });
  }

  function confirmarCierre() {
    if (!cierre) return;
    setErrorCierre(null);
    startTransition(async () => {
      const res = await cerrarAlertaMantenimiento({
        alertaId: cierre.alerta.id,
        ordenTaller: orden,
        notasCierre: notas,
        reportesCerrados: [...cierre.seleccion],
      });
      if (!res.success) return setErrorCierre(res.error ?? "No se pudo cerrar la alerta.");
      const sueltos = res.desvinculados ?? 0;
      setCierre(null);
      setMensaje({
        ok: true,
        texto: sueltos > 0
          ? `Alerta cerrada. ${sueltos} reporte${sueltos === 1 ? "" : "s"} quedaron desvinculados y podrán generar una alerta nueva.`
          : "Alerta cerrada y auditada.",
      });
    });
  }

  function exportar() {
    descargarCsv(`alertas_mantenimiento_${hoy}.csv`, [
      ["Estado", "Codigo", "Placa", "Concepto", "Reportes", "Abierta", "Cerrada", "Orden de taller", "Notas"],
      ...alertas.map((a) => [
        a.estado, a.codigo_vehiculo, a.vehiculos?.placa ?? "",
        a.mantenimiento_conceptos?.nombre ?? "", a.cantidad,
        a.created_at, a.cerrada_at ?? "", a.orden_taller ?? "", a.notas_cierre ?? "",
      ]),
    ]);
  }

  function tarjeta(a: AlertaRecurrencia) {
    const detalle = detalles[a.id];
    const expandida = expandidas.has(a.id);
    const abierta = a.estado === "abierta";

    return <article key={a.id} className={`rounded-xl border p-4 ${abierta ? "border-amber-200 bg-amber-50" : "border-[#E2E8F0] bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={`font-semibold ${abierta ? "text-amber-900" : "text-gray-900"}`}>
            {vehiculo(a)} · {a.mantenimiento_conceptos?.nombre ?? "Concepto"}
          </p>
          <p className={`mt-1 text-sm ${abierta ? "text-amber-800" : "text-gray-600"}`}>
            {a.cantidad} reportes recurrentes desde {fmt.format(new Date(a.created_at))}.
          </p>
        </div>
        {!abierta && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Cerrada</span>}
      </div>

      {!abierta && <dl className="mt-3 grid gap-1 text-sm text-gray-600 sm:grid-cols-3">
        <div><dt className="inline font-medium">Cerrada: </dt><dd className="inline">{a.cerrada_at ? fmt.format(new Date(a.cerrada_at)) : "—"}</dd></div>
        <div><dt className="inline font-medium">Orden: </dt><dd className="inline">{a.orden_taller ?? "—"}</dd></div>
        <div><dt className="inline font-medium">Notas: </dt><dd className="inline">{a.notas_cierre ?? "—"}</dd></div>
      </dl>}

      <button
        type="button"
        onClick={() => alternarDetalle(a.id)}
        aria-expanded={expandida}
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:underline"
      >
        {expandida ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Ver los reportes que la originaron
      </button>

      {expandida && <div className="mt-2 rounded-lg border border-[#E2E8F0] bg-white p-3 text-sm">
        {detalle?.cargando && <p className="text-gray-500">Cargando…</p>}
        {detalle?.error && <p className="text-red-600">{detalle.error}</p>}
        {detalle && !detalle.cargando && !detalle.error && (
          detalle.reportes.length === 0
            ? <p className="text-gray-500">Esta alerta no tiene reportes asociados.</p>
            : <ul className="space-y-2">
                {detalle.reportes.map((r) => <li key={r.id} className="border-b border-[#F1F5F9] pb-2 last:border-0 last:pb-0">
                  <span className="font-medium">{fmt.format(new Date(r.fecha_reporte))}</span>
                  {" · "}{r.conductores?.nombre ?? r.cedula_conductor}
                  {r.descripcion ? <span className="text-gray-600"> — {r.descripcion}</span> : null}
                </li>)}
              </ul>
        )}
      </div>}

      {abierta && puedeEditar && <button
        type="button"
        onClick={() => abrirCierre(a)}
        className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Cerrar alerta
      </button>}
    </article>;
  }

  const listado = verCerradas ? cerradas : abiertas;

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    {erroresCarga.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">No se pudieron cargar las alertas.</p><p className="mt-1">Detalle: {erroresCarga[0]}</p></div>}
    {mensaje && <p className={mensaje.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{mensaje.texto}</p>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setVerCerradas(false)} className={`rounded-lg px-3 py-2 text-sm font-medium ${!verCerradas ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] text-gray-700 hover:bg-gray-50"}`}>Abiertas ({abiertas.length})</button>
        <button type="button" onClick={() => setVerCerradas(true)} className={`rounded-lg px-3 py-2 text-sm font-medium ${verCerradas ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] text-gray-700 hover:bg-gray-50"}`}>Cerradas ({cerradas.length})</button>
      </div>
      <button type="button" onClick={exportar} className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Download className="h-4 w-4" />Exportar CSV</button>
    </div>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {listado.map(tarjeta)}
      {listado.length === 0 && (
        <p className="text-sm text-gray-500">{verCerradas ? "Aún no se ha cerrado ninguna alerta." : "No hay alertas abiertas."}</p>
      )}
    </section>

    {cierre && <PanelCierre
      cierre={cierre}
      orden={orden}
      notas={notas}
      error={errorCierre}
      cargando={cargandoCierre}
      pending={pending}
      onOrden={setOrden}
      onNotas={setNotas}
      onAlternar={alternarSeleccion}
      onCancelar={() => setCierre(null)}
      onConfirmar={confirmarCierre}
    />}
  </div>;
}

function PanelCierre({ cierre, orden, notas, error, cargando, pending, onOrden, onNotas, onAlternar, onCancelar, onConfirmar }: {
  cierre: Cierre;
  orden: string;
  notas: string;
  error: string | null;
  cargando: boolean;
  pending: boolean;
  onOrden: (v: string) => void;
  onNotas: (v: string) => void;
  onAlternar: (id: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const { alerta, reportes, seleccion } = cierre;
  const sueltos = reportes.length - seleccion.size;
  const ultimo = reportes[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-cierre" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-[#E2E8F0] px-5 py-4">
          <div>
            <h2 id="titulo-cierre" className="text-base font-semibold text-gray-900">Cerrar alerta</h2>
            <p className="mt-1 text-sm text-gray-600">{vehiculo(alerta)} · {alerta.mantenimiento_conceptos?.nombre ?? "Concepto"}</p>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Cancelar" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <dl className="grid gap-1 text-sm text-gray-600 sm:grid-cols-2">
            <div><dt className="inline font-medium">Reportes: </dt><dd className="inline">{cargando ? "…" : reportes.length}</dd></div>
            <div><dt className="inline font-medium">Último: </dt><dd className="inline">{ultimo ? fmt.format(new Date(ultimo.fecha_reporte)) : "—"}</dd></div>
          </dl>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900">¿Qué reportes cierra esta intervención?</legend>
            <p className="mt-1 text-sm text-gray-500">Los que desmarques quedan desvinculados: siguen en el historial pero sueltos, y podrán generar una alerta nueva.</p>
            <div className="mt-2 space-y-2">
              {cargando && <p className="text-sm text-gray-500">Cargando reportes…</p>}
              {reportes.map((r) => (
                <label key={r.id} className="flex items-start gap-2 rounded-lg border border-[#E2E8F0] p-2 text-sm">
                  <input type="checkbox" checked={seleccion.has(r.id)} onChange={() => onAlternar(r.id)} className="mt-1 h-4 w-4" />
                  <span>
                    <span className="font-medium">{fmt.format(new Date(r.fecha_reporte))}</span>
                    {" · "}{r.conductores?.nombre ?? r.cedula_conductor}
                    {r.descripcion ? <span className="block text-gray-600">{r.descripcion}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            {sueltos > 0 && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{sueltos} reporte{sueltos === 1 ? "" : "s"} quedarán desvinculados.</p>}
          </fieldset>

          <label className="block text-sm text-gray-600">
            Orden de taller <span className="text-red-600">*</span>
            <input value={orden} onChange={(e) => onOrden(e.target.value)} placeholder="OTD-2026060081" className={inputClass} />
          </label>

          <label className="block text-sm text-gray-600">
            Notas de cierre <span className="text-red-600">*</span>
            <textarea value={notas} onChange={(e) => onNotas(e.target.value)} rows={3} placeholder="Qué se hizo, o por qué no era reproceso" className={inputClass} />
          </label>

          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#E2E8F0] px-5 py-4">
          <button type="button" onClick={onCancelar} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={onConfirmar} disabled={pending || cargando} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
            {pending ? "Cerrando…" : "Confirmar cierre"}
          </button>
        </div>
      </div>
    </div>
  );
}
