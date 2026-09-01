"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import type { AlertaRecurrencia, ReporteDano } from "@/lib/mantenimiento/danos";
import { descargarCsv } from "@/lib/mantenimiento/csv";
import { cerrarAlertaMantenimiento } from "../actions";
import { verReportesDeAlerta } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-[#E2E8F0] p-2 text-sm text-gray-900";
const fmt = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });

type Cierre = { orden: string; notas: string };
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
  const [cierres, setCierres] = useState<Record<string, Cierre>>({});
  const [detalles, setDetalles] = useState<Record<string, Detalle>>({});
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [verCerradas, setVerCerradas] = useState(false);

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

  function cerrar(alertaId: string) {
    const cierre = cierres[alertaId] ?? { orden: "", notas: "" };
    setMensaje(null);
    startTransition(async () => {
      const res = await cerrarAlertaMantenimiento({
        alertaId, ordenTaller: cierre.orden, notasCierre: cierre.notas,
      });
      setMensaje(res.success
        ? { ok: true, texto: "Alerta cerrada y auditada." }
        : { ok: false, texto: res.error ?? "No se pudo cerrar la alerta." });
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
    const cierre = cierres[a.id] ?? { orden: "", notas: "" };
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

      {abierta && puedeEditar && <div className="mt-3 space-y-2">
        <input
          aria-label="Orden de taller"
          placeholder="Orden de taller (opcional)"
          value={cierre.orden}
          onChange={(e) => setCierres((v) => ({ ...v, [a.id]: { ...cierre, orden: e.target.value } }))}
          className={`${inputClass} bg-white`}
        />
        <textarea
          aria-label="Notas de cierre"
          placeholder="Notas de cierre (opcional)"
          value={cierre.notas}
          onChange={(e) => setCierres((v) => ({ ...v, [a.id]: { ...cierre, notas: e.target.value } }))}
          className={`${inputClass} min-h-16 bg-white`}
        />
        <button type="button" onClick={() => cerrar(a.id)} disabled={pending} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
          {pending ? "Cerrando…" : "Cerrar alerta"}
        </button>
      </div>}
    </article>;
  }

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
      {(verCerradas ? cerradas : abiertas).map(tarjeta)}
      {(verCerradas ? cerradas : abiertas).length === 0 && (
        <p className="text-sm text-gray-500">{verCerradas ? "Aún no se ha cerrado ninguna alerta." : "No hay alertas abiertas."}</p>
      )}
    </section>
  </div>;
}
