"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileSpreadsheet,
  Loader2,
  Printer,
  Search,
  TriangleAlert,
} from "lucide-react";
import { registrarEventoReporte } from "@/lib/devengados/actions";
import type { FilaAnalisis } from "@/lib/devengados/data";
import type { quincenaDe } from "@/lib/devengados/engine";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

type Quincena = ReturnType<typeof quincenaDe>;

/**
 * Estado alineado con la Caja: lo que manda es la situación de HOY.
 * "Entrega autorizada" si hay disponible aunque días anteriores hayan
 * retenido excedente (antes se mostraba "Retenidos" y no coincidía con
 * la caja); "Retenido – déficit" solo si el acumulado sigue negativo.
 */
function estadoFila(f: FilaAnalisis): { key: string; label: string; bg: string; color: string } {
  if (f.resumen.saldoAcumulado < 0)
    return { key: "retenido", label: "Retenido – déficit", bg: "#FEE2E2", color: "#EF4444" };
  if (f.resumen.disponible > 0)
    return { key: "autorizada", label: "Entrega autorizada", bg: "#D1FAE5", color: "#059669" };
  if (f.resumen.entregado > 0)
    return { key: "entregado", label: "Entregado", bg: "#DBEAFE", color: "#2563EB" };
  return { key: "al_dia", label: "Al día", bg: "#F1F5F9", color: "#64748B" };
}

const ESTADO_OPCIONES = [
  { value: "todos", label: "Todos los estados" },
  { value: "autorizada", label: "Entrega autorizada" },
  { value: "retenido", label: "Retenido – déficit" },
  { value: "entregado", label: "Entregado" },
  { value: "al_dia", label: "Al día" },
];

type OrdenCampo =
  | "nombre"
  | "codigo"
  | "dias"
  | "produccion"
  | "base"
  | "saldo"
  | "entregado"
  | "disponible";

function valorOrden(f: FilaAnalisis, campo: OrdenCampo): string | number {
  switch (campo) {
    case "nombre": return f.nombre ?? "";
    case "codigo": return f.codigo ?? "";
    case "dias": return f.resumen.diasConProduccion;
    case "produccion": return f.resumen.produccionAcum;
    case "base": return f.resumen.baseAcum;
    case "saldo": return f.resumen.saldoAcumulado;
    case "entregado": return f.resumen.entregado;
    case "disponible": return f.resumen.disponible;
  }
}

export function AnalisisClient({
  filas,
  baseDiaria,
  quincena,
  fechaCorte,
}: {
  filas: FilaAnalisis[];
  baseDiaria: number;
  quincena: Quincena;
  fechaCorte: string;
}) {
  const [query, setQuery] = useState("");
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [orden, setOrden] = useState<{ campo: OrdenCampo; asc: boolean }>({
    campo: "nombre",
    asc: true,
  });
  const [abierta, setAbierta] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exportando, setExportando] = useState(false);
  const [impresoEn, setImpresoEn] = useState("");

  function ordenarPor(campo: OrdenCampo) {
    setOrden((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }));
    setPage(1);
  }

  const filtradas = useMemo(() => {
    const q = query.toLowerCase().trim();
    const lista = filas.filter((f) => {
      const matches =
        !q ||
        f.nombre?.toLowerCase().includes(q) ||
        f.cedula.includes(q) ||
        f.codigo?.toLowerCase().includes(q);
      if (!matches) return false;
      if (soloAlertas && !(f.resumen.enAlerta || f.resumen.saldoAcumulado < 0)) return false;
      if (estadoFiltro !== "todos" && estadoFila(f).key !== estadoFiltro) return false;
      return true;
    });
    const dir = orden.asc ? 1 : -1;
    return [...lista].sort((a, b) => {
      const va = valorOrden(a, orden.campo);
      const vb = valorOrden(b, orden.campo);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }, [filas, query, soloAlertas, estadoFiltro, orden]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginadas = filtradas.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totales = useMemo(
    () =>
      filas.reduce(
        (t, f) => ({
          produccion: t.produccion + f.resumen.produccionAcum,
          base: t.base + f.resumen.baseAcum,
          entregado: t.entregado + f.resumen.entregado,
          disponible: t.disponible + f.resumen.disponible,
          alertas: t.alertas + (f.resumen.enAlerta || f.resumen.saldoAcumulado < 0 ? 1 : 0),
        }),
        { produccion: 0, base: 0, entregado: 0, disponible: 0, alertas: 0 }
      ),
    [filas]
  );

  /** Reporte de entrega (Código, Cédula, Nombre, Disponible, Entregado en
   *  blanco para diligenciar a mano, Firma) con el filtro de la pantalla. */
  function imprimirReporte() {
    setImpresoEn(
      new Date().toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        dateStyle: "short",
        timeStyle: "short",
      })
    );
    void registrarEventoReporte("analisis_entrega", "pdf", fechaCorte);
    // Deja repintar el encabezado con la fecha antes de abrir el diálogo.
    setTimeout(() => window.print(), 50);
  }

  async function exportarExcel() {
    setExportando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Entrega", { views: [{ state: "frozen", ySplit: 3 }] });
      const HEADERS = ["Código", "Cédula", "Nombre conductor", "Disponible", "Entregado", "Firma de quien recibe"];
      ws.columns = [12, 14, 34, 14, 16, 26].map((w) => ({ width: w }));

      ws.mergeCells(1, 1, 1, HEADERS.length);
      const t = ws.getCell(1, 1);
      t.value = `GESTIVO · Tesorería — Relación de entrega Otros Devengados · ${quincena.periodo} Q${quincena.quincena} · corte ${fechaCorte}`;
      t.font = { bold: true, size: 13, color: { argb: "FF312E81" } };
      ws.getRow(1).height = 22;
      ws.mergeCells(2, 1, 2, HEADERS.length);
      const s = ws.getCell(2, 1);
      s.value = `${filtradas.length} conductores (filtro en pantalla) · disponible total ${cop.format(
        filtradas.reduce((sum, f) => sum + f.resumen.disponible, 0)
      )}`;
      s.font = { size: 9, color: { argb: "FF64748B" } };

      const hr = ws.getRow(3);
      HEADERS.forEach((h, i) => {
        const c = hr.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      });
      hr.height = 18;

      filtradas.forEach((f, idx) => {
        const row = ws.getRow(idx + 4);
        const vals = [f.codigo ?? "", f.cedula, f.nombre ?? "", f.resumen.disponible, "", ""];
        vals.forEach((v, i) => {
          const c = row.getCell(i + 1);
          c.value = v as string | number;
          c.font = { size: 10 };
          if (idx % 2 === 1) {
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
          }
          c.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
          if (i === 3) c.numFmt = '"$"#,##0';
        });
        row.height = 22; // espacio para diligenciar Entregado y Firma a mano
      });
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: HEADERS.length } };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `entrega_devengados_${fechaCorte}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      void registrarEventoReporte("analisis_entrega", "excel", fechaCorte);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Al imprimir solo se muestra el reporte de entrega (#reporte-entrega) */}
      <style>{`
        @page { margin: 8mm; }
        @media print {
          body * { visibility: hidden; }
          #reporte-entrega, #reporte-entrega * { visibility: visible; }
          #reporte-entrega { position: absolute; left: 0; top: 0; width: 100%; display: block !important; padding: 0 !important; }
          #reporte-entrega thead { display: table-header-group; }
          #reporte-entrega tr { break-inside: avoid; }
        }
      `}</style>

      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Devengados · Análisis quincenal</h1>
            <span className="inline-flex items-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
              {quincena.periodo} · Q{quincena.quincena} · corte {fechaCorte}
            </span>
            <span className="text-xs text-gray-500">Base diaria: {cop.format(baseDiaria)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={estadoFiltro}
              onChange={(e) => {
                setEstadoFiltro(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm font-medium text-gray-700 outline-none focus:border-[#4F46E5]"
            >
              {ESTADO_OPCIONES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={soloAlertas}
                onChange={(e) => {
                  setSoloAlertas(e.target.checked);
                  setPage(1);
                }}
              />
              Solo alertas ({totales.alertas})
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar conductor..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="w-56 rounded-lg border border-[#E2E8F0] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4F46E5]"
              />
            </div>
            <button
              onClick={imprimirReporte}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]"
              title="Reporte de entrega con el filtro en pantalla (Entregado en blanco para diligenciar)"
            >
              <Printer className="h-4 w-4" /> Reporte (PDF)
            </button>
            <button
              onClick={exportarExcel}
              disabled={exportando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#4F46E5] bg-[#EEF2FF] px-3 py-2 text-sm font-medium text-[#4F46E5] hover:bg-[#E0E7FF] disabled:opacity-50"
            >
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Excel
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-4 p-6 print:hidden">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Producción acumulada", value: cop.format(totales.produccion) },
            { label: "Base exigida acumulada", value: cop.format(totales.base) },
            { label: "Entregado en la quincena", value: cop.format(totales.entregado) },
            { label: "Excedente disponible", value: cop.format(totales.disponible) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                  {(
                    [
                      { campo: "nombre" as OrdenCampo, label: "Conductor", right: false },
                      { campo: "dias" as OrdenCampo, label: "Días", right: true },
                      { campo: "produccion" as OrdenCampo, label: "Producción", right: true },
                      { campo: "base" as OrdenCampo, label: "Base exigida", right: true },
                      { campo: "saldo" as OrdenCampo, label: "Saldo", right: true },
                      { campo: "entregado" as OrdenCampo, label: "Entregado", right: true },
                      { campo: "disponible" as OrdenCampo, label: "Disponible", right: true },
                    ]
                  ).map((col) => (
                    <th key={col.campo} className={`px-4 py-2 ${col.right ? "text-right" : ""}`}>
                      <button
                        onClick={() => ordenarPor(col.campo)}
                        className={`inline-flex items-center gap-1 uppercase hover:text-gray-800 ${
                          orden.campo === col.campo ? "text-[#4F46E5]" : ""
                        }`}
                      >
                        {col.label}
                        {orden.campo === col.campo ? (
                          orden.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginadas.map((f) => {
                  const est = estadoFila(f);
                  const abiertaEsta = abierta === f.cedula;
                  return (
                    <Fragment key={f.cedula}>
                      <tr
                        onClick={() => setAbierta(abiertaEsta ? null : f.cedula)}
                        className="cursor-pointer border-b border-[#F1F5F9] hover:bg-[#F8FAFC]"
                      >
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900">{f.nombre ?? "—"}</p>
                          <p className="text-xs text-gray-500">
                            CC {f.cedula} {f.codigo ? `· Cód. ${f.codigo}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-right">{f.resumen.diasConProduccion}</td>
                        <td className="px-4 py-2 text-right">{cop.format(f.resumen.produccionAcum)}</td>
                        <td className="px-4 py-2 text-right">{cop.format(f.resumen.baseAcum)}</td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${
                            f.resumen.saldoAcumulado < 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {cop.format(f.resumen.saldoAcumulado)}
                        </td>
                        <td className="px-4 py-2 text-right">{cop.format(f.resumen.entregado)}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {cop.format(f.resumen.disponible)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: est.bg, color: est.color }}
                          >
                            {f.resumen.saldoAcumulado < 0 && <TriangleAlert className="h-3 w-3" />}
                            {est.label}
                          </span>
                        </td>
                      </tr>
                      {abiertaEsta && (
                        <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                          <td colSpan={8} className="px-6 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left uppercase tracking-wide text-gray-400">
                                  <th className="py-1">Fecha</th>
                                  <th className="py-1 text-right">Producción</th>
                                  <th className="py-1 text-right">Base</th>
                                  <th className="py-1 text-right">Excedente día</th>
                                  <th className="py-1 text-right">Saldo acumulado</th>
                                  <th className="py-1">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {f.resumen.dias.map((d) => (
                                  <tr key={d.fecha} className="border-t border-[#E2E8F0]">
                                    <td className="py-1">{d.fecha}</td>
                                    <td className="py-1 text-right">{cop.format(d.produccion)}</td>
                                    <td className="py-1 text-right">{cop.format(d.baseExigida)}</td>
                                    <td className="py-1 text-right">{cop.format(d.excedenteDia)}</td>
                                    <td
                                      className={`py-1 text-right ${
                                        d.saldoAcumulado < 0 ? "text-red-600" : "text-emerald-600"
                                      }`}
                                    >
                                      {cop.format(d.saldoAcumulado)}
                                    </td>
                                    <td className="py-1 capitalize">{d.estado.replace("_", " ")}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                      Sin conductores con viajes en la quincena (GEMA puede reportar con atraso).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F1F5F9] px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <span>
                Mostrando {filtradas.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                –{Math.min(currentPage * pageSize, filtradas.length)} de {filtradas.length}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm outline-none focus:border-[#4F46E5]"
              >
                {[20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 font-medium text-gray-700 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-gray-500">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 font-medium text-gray-700 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reporte de entrega imprimible: refleja el filtro y el orden de la
          pantalla; "Entregado" y "Firma" van en blanco para diligenciar.
          El título + fecha de impresión se repiten en cada página (thead). */}
      <div id="reporte-entrega" className="hidden bg-white p-8 text-[10px] leading-tight text-gray-900">
        <p className="mb-2 text-[10px] text-gray-600">
          {quincena.periodo} Q{quincena.quincena} · corte {fechaCorte} · {filtradas.length}{" "}
          conductores · disponible total{" "}
          {cop.format(filtradas.reduce((s, f) => s + f.resumen.disponible, 0))}
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th colSpan={6} className="border-0 p-0">
                <div className="mb-1 flex items-end justify-between border-b-2 border-gray-800 pb-1">
                  <span className="text-[11px] font-bold text-gray-900">
                    GESTIVO · Tesorería — Relación de entrega Otros Devengados
                  </span>
                  <span className="text-[9px] font-normal text-gray-500">
                    Corte: {fechaCorte} · Impreso: {impresoEn}
                  </span>
                </div>
              </th>
            </tr>
            <tr>
              {["Código", "Cédula", "Nombre conductor", "Disponible", "Entregado", "Firma de quien recibe"].map((h) => (
                <th
                  key={h}
                  className="border border-gray-300 px-1.5 py-0.5 text-left text-[9px] uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => (
              <tr key={f.cedula} className="h-6">
                <td className="border border-gray-300 px-1.5 py-0.5">{f.codigo ?? "—"}</td>
                <td className="border border-gray-300 px-1.5 py-0.5">{f.cedula}</td>
                <td className="border border-gray-300 px-1.5 py-0.5">{f.nombre ?? "—"}</td>
                <td className="border border-gray-300 px-1.5 py-0.5 text-right">
                  {cop.format(f.resumen.disponible)}
                </td>
                <td className="w-24 border border-gray-300 px-1.5 py-0.5"></td>
                <td className="w-40 border border-gray-300 px-1.5 py-0.5"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
