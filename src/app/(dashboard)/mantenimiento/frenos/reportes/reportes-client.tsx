"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, CircleCheck, Download, FileDown, Gauge, Wrench } from "lucide-react";
import {
  diasOInfinito,
  type IndicadoresFrenos,
  type RegistroFrenos,
  type ResumenFrenos,
  type VehiculoFrenos,
} from "@/lib/mantenimiento/frenos";
import { generarPdfCpaR31 } from "@/lib/mantenimiento/cpa-r-31";
import { descargarCsv } from "@/lib/mantenimiento/csv";
import { useColapsables } from "@/lib/mantenimiento/colapsables";

const inputClass = "mt-1 w-full rounded-lg border border-[#E2E8F0] p-2 text-sm text-gray-900";
const fmtFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

function fecha(iso: string) {
  return fmtFecha.format(new Date(`${iso}T00:00:00Z`));
}

function etiqueta(v: { codigo: string; placa: string | null }) {
  return v.placa ? `${v.codigo} — ${v.placa}` : v.codigo;
}

type ColumnaResumen = "codigo" | "total_registros" | "total_graduaciones" | "ultima_graduacion" | "dias_desde_ultima";

const COLUMNAS_RESUMEN: { col: ColumnaResumen; etiqueta: string }[] = [
  { col: "codigo", etiqueta: "Vehículo" },
  { col: "total_registros", etiqueta: "Registros" },
  { col: "total_graduaciones", etiqueta: "Graduaciones" },
  { col: "ultima_graduacion", etiqueta: "Última" },
  { col: "dias_desde_ultima", etiqueta: "Días" },
];

function ordenarResumen(filas: ResumenFrenos[], orden: { col: ColumnaResumen; asc: boolean }) {
  const dir = orden.asc ? 1 : -1;
  return [...filas].sort((a, b) => {
    if (orden.col === "codigo") {
      return etiqueta(a).localeCompare(etiqueta(b), "es", { numeric: true }) * dir;
    }
    if (orden.col === "ultima_graduacion") {
      // Nunca graduado va al final en ascendente.
      return (a.ultima_graduacion ?? "").localeCompare(b.ultima_graduacion ?? "") * dir;
    }
    if (orden.col === "dias_desde_ultima") {
      return (diasOInfinito(a.dias_desde_ultima) - diasOInfinito(b.dias_desde_ultima)) * dir;
    }
    return ((a[orden.col] ?? 0) - (b[orden.col] ?? 0)) * dir;
  });
}

/** Cabecera de sección que pliega su contenido. */
function Cabecera({ titulo, abierta, onAlternar, children }: {
  titulo: string;
  abierta: boolean;
  onAlternar: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3">
      {/* Solo el título pliega: así los controles de la derecha se pueden usar
          sin cerrar la sección. */}
      <button type="button" onClick={onAlternar} aria-expanded={abierta} className="inline-flex items-center gap-1 font-semibold text-gray-900">
        {abierta ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        {titulo}
      </button>
      {children}
    </div>
  );
}

export function FrenosReportesClient({ vehiculos, resumen, historial, indicadores, hoy, usuario, erroresCarga }: {
  vehiculos: VehiculoFrenos[];
  resumen: ResumenFrenos[];
  historial: RegistroFrenos[];
  indicadores: IndicadoresFrenos;
  hoy: string;
  usuario: string | null;
  erroresCarga: string[];
}) {
  const [umbral, setUmbral] = useState(30);
  const [fVehiculo, setFVehiculo] = useState("");
  const [fDesde, setFDesde] = useState(`${hoy.slice(0, 8)}01`);
  const [fHasta, setFHasta] = useState(hoy);
  const [pdfEstado, setPdfEstado] = useState<string | null>(null);
  // El resumen y el historial son largos; arrancan cerrados y cada quien deja
  // su preferencia guardada en este navegador.
  const secciones = useColapsables("mantenimiento-frenos-reportes", { vencidos: true, historial: false, resumen: false });
  const [orden, setOrden] = useState<{ col: ColumnaResumen; asc: boolean }>({ col: "codigo", asc: true });

  // Un vehículo nunca graduado entra siempre: es el caso más grave, no el más
  // leve. Por eso el null se trata como infinito y no como cero.
  const vencidos = useMemo(
    () => resumen
      .filter((v) => diasOInfinito(v.dias_desde_ultima) > umbral)
      .sort((a, b) => diasOInfinito(b.dias_desde_ultima) - diasOInfinito(a.dias_desde_ultima)),
    [resumen, umbral]
  );

  const filtrado = useMemo(
    () => historial.filter((r) =>
      (!fVehiculo || r.codigo_vehiculo === fVehiculo) &&
      (!fDesde || r.fecha >= fDesde) &&
      (!fHasta || r.fecha <= fHasta)
    ),
    [historial, fVehiculo, fDesde, fHasta]
  );

  function exportarHistorial() {
    descargarCsv(`frenos_${fDesde}_a_${fHasta}.csv`, [
      ["Fecha", "Codigo", "Placa", "Graduacion", "Observacion", "Registro"],
      ...filtrado.map((r) => [
        r.fecha, r.codigo_vehiculo, r.vehiculos?.placa ?? "",
        r.graduacion ? "SI" : "NO", r.observacion ?? "", r.registrado_por_email ?? "",
      ]),
    ]);
  }

  const resumenOrdenado = useMemo(() => ordenarResumen(resumen, orden), [resumen, orden]);

  function ordenarPor(col: ColumnaResumen) {
    setOrden((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: true }));
  }

  function exportarResumen() {
    descargarCsv(`frenos_resumen_${hoy}.csv`, [
      ["Codigo", "Placa", "Registros", "Graduaciones", "Ultima graduacion", "Dias desde la ultima", "Con observacion"],
      ...resumen.map((v) => [
        v.codigo, v.placa ?? "", v.total_registros, v.total_graduaciones,
        v.ultima_graduacion ?? "Nunca",
        v.dias_desde_ultima ?? "Nunca", v.con_observacion,
      ]),
    ]);
  }

  async function generarPdf() {
    setPdfEstado("Generando…");
    try {
      const filas = await generarPdfCpaR31({
        flota: vehiculos,
        registros: filtrado.map((r) => ({
          fecha: r.fecha, codigo_vehiculo: r.codigo_vehiculo,
          graduacion: r.graduacion, observacion: r.observacion,
        })),
        desde: fDesde,
        hasta: fHasta,
        usuario,
      });
      setPdfEstado(`Formato generado con ${filas} filas.`);
    } catch (error) {
      setPdfEstado(error instanceof Error ? error.message : "No se pudo generar el PDF.");
    }
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    {erroresCarga.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">No se pudieron cargar todos los datos.</p><p className="mt-1">Detalle: {erroresCarga[0]}</p></div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Indicador icon={<Wrench className="h-5 w-5" />} label="Graduaciones del mes" valor={indicadores.graduacionesDelMes} color="text-[#4F46E5]" />
      <Indicador icon={<CircleCheck className="h-5 w-5" />} label="Vehículos atendidos" valor={indicadores.vehiculosAtendidos} color="text-emerald-600" />
      <Indicador icon={<Gauge className="h-5 w-5" />} label="Con observación" valor={indicadores.conObservacion} color="text-sky-600" />
      <Indicador icon={<AlertTriangle className="h-5 w-5" />} label={`Vencidos (+${umbral} días)`} valor={vencidos.length} color="text-amber-600" />
    </section>

    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <Cabecera titulo="Sin graduación reciente" abierta={secciones.estaAbierta("vencidos")} onAlternar={() => secciones.alternar("vencidos")}>
        <label className="text-sm text-gray-600">Umbral en días
          <select value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} className="ml-2 rounded-lg border border-[#E2E8F0] p-1.5 text-sm">
            {[15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </Cabecera>
      {secciones.estaAbierta("vencidos") && <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
            <tr><th className="px-4 py-3">Vehículo</th><th className="px-4 py-3">Última graduación</th><th className="px-4 py-3">Días</th><th className="px-4 py-3">Total graduaciones</th></tr>
          </thead>
          <tbody>
            {vencidos.map((v) => <tr key={v.codigo} className="border-t border-[#F1F5F9] bg-amber-50/40">
              <td className="px-4 py-3 font-medium">{etiqueta(v)}</td>
              <td className="px-4 py-3">{v.ultima_graduacion ? fecha(v.ultima_graduacion) : <span className="text-gray-500">Nunca</span>}</td>
              <td className="px-4 py-3">{v.dias_desde_ultima === null
                ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">Nunca graduado</span>
                : <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{v.dias_desde_ultima} días</span>}</td>
              <td className="px-4 py-3">{v.total_graduaciones}</td>
            </tr>)}
            {vencidos.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">Todos los vehículos activos tienen graduación en los últimos {umbral} días.</td></tr>}
          </tbody>
        </table>
      </div>}
    </section>

    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <Cabecera titulo={`Historial (${filtrado.length})`} abierta={secciones.estaAbierta("historial")} onAlternar={() => secciones.alternar("historial")}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-600">Vehículo
            <select value={fVehiculo} onChange={(e) => setFVehiculo(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {vehiculos.map((v) => <option key={v.codigo} value={v.codigo}>{etiqueta(v)}</option>)}
            </select>
          </label>
          <label className="text-sm text-gray-600">Desde<input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} className={inputClass} /></label>
          <label className="text-sm text-gray-600">Hasta<input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} className={inputClass} /></label>
          <button type="button" onClick={exportarHistorial} className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Download className="h-4 w-4" />CSV</button>
          <button type="button" onClick={generarPdf} className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]"><FileDown className="h-4 w-4" />Formato CPA-R-31</button>
        </div>
      </Cabecera>
      {pdfEstado && <p className="px-4 pt-3 text-sm text-gray-600">{pdfEstado}</p>}
      {secciones.estaAbierta("historial") && <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
            <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Vehículo</th><th className="px-4 py-3">Graduación</th><th className="px-4 py-3">Observación</th><th className="px-4 py-3">Registró</th></tr>
          </thead>
          <tbody>
            {filtrado.map((r) => <tr key={r.id} className="border-t border-[#F1F5F9]">
              <td className="px-4 py-3">{fecha(r.fecha)}</td>
              <td className="px-4 py-3 font-medium">{r.codigo_vehiculo}{r.vehiculos?.placa ? ` — ${r.vehiculos.placa}` : ""}</td>
              <td className="px-4 py-3">{r.graduacion ? <span className="text-emerald-700">Sí</span> : <span className="text-amber-700">No</span>}</td>
              <td className="px-4 py-3">{r.observacion ?? "—"}</td>
              <td className="px-4 py-3 text-gray-500">{r.registrado_por_email ?? "—"}</td>
            </tr>)}
            {filtrado.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Sin registros para los filtros seleccionados.</td></tr>}
          </tbody>
        </table>
      </div>}
    </section>

    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <Cabecera titulo="Resumen por vehículo" abierta={secciones.estaAbierta("resumen")} onAlternar={() => secciones.alternar("resumen")}>
        <span className="text-sm text-gray-500">{resumen.length} vehículos activos</span>
        <button type="button" onClick={exportarResumen} className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Download className="h-4 w-4" />CSV</button>
      </Cabecera>
      {secciones.estaAbierta("resumen") && <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="sticky top-0 bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>{COLUMNAS_RESUMEN.map(({ col, etiqueta: titulo }) => (
              <th key={col} className="px-4 py-3" aria-sort={orden.col === col ? (orden.asc ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => ordenarPor(col)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800">
                  {titulo}
                  <span aria-hidden className={orden.col === col ? "text-gray-800" : "text-gray-300"}>{orden.col === col && !orden.asc ? "↓" : "↑"}</span>
                </button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {resumenOrdenado.map((v) => <tr key={v.codigo} className="border-t border-[#F1F5F9]">
              <td className="px-4 py-3 font-medium">{etiqueta(v)}</td>
              <td className="px-4 py-3">{v.total_registros}</td>
              <td className="px-4 py-3">{v.total_graduaciones}</td>
              <td className="px-4 py-3">{v.ultima_graduacion ? fecha(v.ultima_graduacion) : "—"}</td>
              <td className="px-4 py-3">{v.dias_desde_ultima ?? "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
  </div>;
}

function Indicador({ icon, label, valor, color }: { icon: React.ReactNode; label: string; valor: number; color: string }) {
  return <div className="rounded-xl border border-[#E2E8F0] bg-white p-4"><div className={`flex items-center gap-2 text-sm font-medium ${color}`}>{icon}{label}</div><div className="mt-2 text-3xl font-bold text-gray-900">{valor}</div></div>;
}
