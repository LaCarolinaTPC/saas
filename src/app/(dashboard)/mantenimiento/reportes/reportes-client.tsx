"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { ReporteDano } from "@/lib/mantenimiento/danos";
import { descargarCsv } from "@/lib/mantenimiento/csv";

const inputClass = "mt-1 w-full rounded-lg border border-[#E2E8F0] p-2 text-sm text-gray-900";
const fmt = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });

type Vehiculo = { codigo: string; placa: string | null };
type Concepto = { id: string; nombre: string };

function etiqueta(v: Vehiculo) {
  return v.placa ? `${v.codigo} — ${v.placa}` : v.codigo;
}

export function ReportesDanosClient({ reportes, vehiculos, conceptos, hoy, erroresCarga }: {
  reportes: ReporteDano[];
  vehiculos: Vehiculo[];
  conceptos: Concepto[];
  hoy: string;
  erroresCarga: string[];
}) {
  const [fVehiculo, setFVehiculo] = useState("");
  const [fConcepto, setFConcepto] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [soloRecurrentes, setSoloRecurrentes] = useState(false);

  const filtrado = useMemo(() => reportes.filter((r) => {
    // fecha_reporte es una marca de tiempo; se compara por el día que trae.
    const dia = r.fecha_reporte.slice(0, 10);
    return (!fVehiculo || r.codigo_vehiculo === fVehiculo)
      && (!fConcepto || r.mantenimiento_conceptos?.nombre === fConcepto)
      && (!fDesde || dia >= fDesde)
      && (!fHasta || dia <= fHasta)
      && (!soloRecurrentes || r.alerta_id !== null);
  }), [reportes, fVehiculo, fConcepto, fDesde, fHasta, soloRecurrentes]);

  function limpiar() {
    setFVehiculo(""); setFConcepto(""); setFDesde(""); setFHasta(""); setSoloRecurrentes(false);
  }

  function exportar() {
    descargarCsv(`reportes_danos_${hoy}.csv`, [
      ["Fecha", "Codigo", "Placa", "Cedula", "Conductor", "Concepto", "Descripcion", "Recurrente"],
      ...filtrado.map((r) => [
        r.fecha_reporte,
        r.codigo_vehiculo,
        r.vehiculos?.placa ?? "",
        r.cedula_conductor,
        r.conductores?.nombre ?? "",
        r.mantenimiento_conceptos?.nombre ?? "",
        r.descripcion ?? "",
        r.alerta_id ? "SI" : "NO",
      ]),
    ]);
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    {erroresCarga.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">No se pudieron cargar todos los datos.</p><p className="mt-1">Detalle: {erroresCarga[0]}</p></div>}

    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-gray-600">Vehículo
          <select value={fVehiculo} onChange={(e) => setFVehiculo(e.target.value)} className={inputClass}>
            <option value="">Todos</option>
            {vehiculos.map((v) => <option key={v.codigo} value={v.codigo}>{etiqueta(v)}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-600">Concepto
          <select value={fConcepto} onChange={(e) => setFConcepto(e.target.value)} className={inputClass}>
            <option value="">Todos</option>
            {conceptos.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-600">Desde<input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} className={inputClass} /></label>
        <label className="text-sm text-gray-600">Hasta<input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} className={inputClass} /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={soloRecurrentes} onChange={(e) => setSoloRecurrentes(e.target.checked)} className="h-4 w-4" />
          Solo los que generaron alerta
        </label>
        <button type="button" onClick={limpiar} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Limpiar</button>
        <button type="button" onClick={exportar} className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Download className="h-4 w-4" />Exportar CSV</button>
        <span className="text-sm text-gray-500">{filtrado.length} de {reportes.length} reportes</span>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
            <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Vehículo</th><th className="px-4 py-3">Conductor</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3">Estado</th></tr>
          </thead>
          <tbody>
            {filtrado.map((r) => <tr key={r.id} className="border-t border-[#F1F5F9]">
              <td className="px-4 py-3 whitespace-nowrap">{fmt.format(new Date(r.fecha_reporte))}</td>
              <td className="px-4 py-3 font-medium">{r.codigo_vehiculo}{r.vehiculos?.placa ? ` — ${r.vehiculos.placa}` : ""}</td>
              <td className="px-4 py-3">{r.conductores?.nombre ?? r.cedula_conductor}</td>
              <td className="px-4 py-3">{r.mantenimiento_conceptos?.nombre ?? "—"}</td>
              <td className="px-4 py-3">{r.descripcion ?? "—"}</td>
              <td className="px-4 py-3">{r.alerta_id ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Recurrente</span> : "—"}</td>
            </tr>)}
            {filtrado.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">
              {reportes.length === 0 ? "Aún no hay reportes de mantenimiento." : "Sin registros para los filtros seleccionados."}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
