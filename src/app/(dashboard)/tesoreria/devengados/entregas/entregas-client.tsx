"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  Clock,
  Loader2,
  Undo2,
  X,
  FileSpreadsheet,
  Printer,
  ShieldAlert,
} from "lucide-react";
import { marcarTrasladada, registrarDevolucion, registrarEventoReporte } from "@/lib/devengados/actions";
import type { CajeroInfo, EntregaRow } from "@/lib/devengados/data";
import { formatDateTimeBogota } from "@/lib/utils";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface HojaExcel {
  nombre: string;
  titulo: string;
  subtitulo?: string;
  headers: string[];
  widths: number[];
  rows: (string | number)[][];
  /** Índices (base 0) de columnas con formato de moneda. */
  moneyCols?: number[];
}

/**
 * Genera y descarga un .xlsx con formato usando ExcelJS. Los encabezados se
 * escriben SIEMPRE (aunque no haya filas), a diferencia de xlsx.json_to_sheet
 * que con una lista vacía produce una hoja sin columnas.
 */
async function descargarHojasExcel(nombreArchivo: string, hojas: HojaExcel[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  for (const h of hojas) {
    const filaHeader = h.subtitulo ? 3 : 2;
    const ws = wb.addWorksheet(h.nombre, {
      views: [{ state: "frozen", ySplit: filaHeader }],
    });
    ws.columns = h.widths.map((w) => ({ width: w }));

    ws.mergeCells(1, 1, 1, h.headers.length);
    const t = ws.getCell(1, 1);
    t.value = h.titulo;
    t.font = { bold: true, size: 13, color: { argb: "FF312E81" } };
    ws.getRow(1).height = 20;

    if (h.subtitulo) {
      ws.mergeCells(2, 1, 2, h.headers.length);
      const s = ws.getCell(2, 1);
      s.value = h.subtitulo;
      s.font = { size: 9, color: { argb: "FF64748B" } };
    }

    const hr = ws.getRow(filaHeader);
    h.headers.forEach((hd, i) => {
      const c = hr.getCell(i + 1);
      c.value = hd;
      c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      c.alignment = { vertical: "middle", wrapText: true };
    });
    hr.height = 18;

    h.rows.forEach((fila, idx) => {
      const row = ws.getRow(filaHeader + 1 + idx);
      fila.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font = { size: 10 };
        if (idx % 2 === 1) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
        c.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
        if (h.moneyCols?.includes(i) && typeof v === "number") c.numFmt = '"$"#,##0';
      });
    });

    ws.autoFilter = {
      from: { row: filaHeader, column: 1 },
      to: { row: filaHeader, column: h.headers.length },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

function horaBogota(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ESTADO_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  activa: { label: "Pagado", bg: "#D1FAE5", color: "#059669" },
  devuelta: { label: "Devuelto", bg: "#FEE2E2", color: "#DC2626" },
  reverso: { label: "Reverso (crédito)", bg: "#FEF3C7", color: "#B45309" },
};

export function EntregasClient({
  entregas,
  cajeros,
  acumQuincena,
  fecha,
}: {
  entregas: EntregaRow[];
  cajeros: Record<string, CajeroInfo>;
  acumQuincena: Record<string, number>;
  fecha: string;
}) {
  const router = useRouter();
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [devolucion, setDevolucion] = useState<EntregaRow | null>(null);
  const [motivoDevolucion, setMotivoDevolucion] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const nombreCajero = (id: string | null): string => {
    if (!id) return "—";
    const c = cajeros[id];
    return c?.nombre || c?.email || "—";
  };

  const { pagos, reversos, totalPagado, totalDevoluciones, pendientes } = useMemo(() => {
    const pagos = entregas.filter((e) => e.movimiento === "DEBITO");
    const reversos = entregas.filter((e) => e.movimiento === "CREDITO");
    return {
      pagos,
      reversos,
      totalPagado: pagos.reduce((s, e) => s + e.valor_entregado, 0),
      totalDevoluciones: reversos.reduce((s, e) => s + e.valor_entregado, 0),
      pendientes: entregas.filter((e) => !e.trasladada_gema && e.estado !== "devuelta"),
    };
  }, [entregas]);
  const valorNeto = totalPagado - totalDevoluciones;

  function toggle(e: EntregaRow) {
    setPendienteId(e.id);
    startTransition(async () => {
      await marcarTrasladada(e.id, !e.trasladada_gema);
      setPendienteId(null);
      router.refresh();
    });
  }

  function confirmarDevolucion() {
    if (!devolucion) return;
    startTransition(async () => {
      const res = await registrarDevolucion(devolucion.id, motivoDevolucion);
      setDevolucion(null);
      setMotivoDevolucion("");
      setMsg(
        res.success
          ? { ok: true, texto: "Devolución registrada: se generó el reverso contable (crédito) automáticamente." }
          : { ok: false, texto: res.error ?? "No se pudo registrar la devolución." }
      );
      router.refresh();
    });
  }

  /** Consolidado del día por cajero (reporte 5.3 y cierre de caja 5.1). */
  const consolidado = useMemo(() => {
    type Fila = {
      cajero: string;
      pagos: number;
      valorTotal: number;
      devoluciones: number;
      conductores: Set<string>;
      horaInicio: string | null;
      horaFin: string | null;
    };
    const porCajero = new Map<string, Fila>();
    for (const e of entregas) {
      const id = e.aprobada_por ?? "—";
      let f = porCajero.get(id);
      if (!f) {
        f = {
          cajero: nombreCajero(e.aprobada_por),
          pagos: 0,
          valorTotal: 0,
          devoluciones: 0,
          conductores: new Set(),
          horaInicio: null,
          horaFin: null,
        };
        porCajero.set(id, f);
      }
      if (e.movimiento === "DEBITO") {
        f.pagos += 1;
        f.valorTotal += e.valor_entregado;
        f.conductores.add(e.cedula_conductor);
      } else {
        f.devoluciones += e.valor_entregado;
      }
      if (!f.horaInicio || e.created_at < f.horaInicio) f.horaInicio = e.created_at;
      if (!f.horaFin || e.created_at > f.horaFin) f.horaFin = e.created_at;
    }
    return [...porCajero.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregas, cajeros]);

  async function exportarExcel(tipo: "detallado" | "consolidado" | "contabilidad" | "cierre") {
    const enc = `Entregas del día ${fecha}`;

    if (tipo === "detallado") {
      await descargarHojasExcel(`devengados_detallado_${fecha}.xlsx`, [
        {
          nombre: "Entregado detallado",
          titulo: `GESTIVO · Tesorería — Entregado del día (detallado) · ${fecha}`,
          subtitulo: `${entregas.length} movimientos · pagado ${cop.format(totalPagado)} · devoluciones ${cop.format(totalDevoluciones)}`,
          headers: ["Fecha", "Hora", "Código", "Cédula", "Nombre", "Cajero", "Valor entregado", "Comprobante", "Estado", "Observaciones", "Motivo devolución", "Autorizó 2.º pago"],
          widths: [11, 8, 10, 13, 26, 22, 15, 22, 14, 28, 24, 22],
          moneyCols: [6],
          rows: entregas.map((e) => [
            e.fecha, horaBogota(e.created_at), e.codigo_conductor ?? "", e.cedula_conductor,
            e.conductor_nombre ?? "", nombreCajero(e.aprobada_por), e.valor_entregado, e.id,
            ESTADO_CHIP[e.estado]?.label ?? e.estado, e.observacion ?? "",
            e.devolucion_motivo ?? "", e.autorizado_por ?? "",
          ]),
        },
      ]);
    } else if (tipo === "consolidado") {
      await descargarHojasExcel(`devengados_consolidado_${fecha}.xlsx`, [
        {
          nombre: "Consolidado",
          titulo: `GESTIVO · Tesorería — Entregado del día (consolidado) · ${fecha}`,
          headers: ["Cajero", "Cantidad pagos", "Valor total", "Total devoluciones", "Valor neto", "Conductores atendidos", "Hora apertura", "Hora cierre", "Observaciones", "Firma cajero", "Firma supervisor"],
          widths: [24, 14, 15, 16, 15, 18, 14, 14, 20, 20, 20],
          moneyCols: [2, 3, 4],
          rows: [
            ...consolidado.map((f) => [
              f.cajero, f.pagos, f.valorTotal, f.devoluciones, f.valorTotal - f.devoluciones,
              f.conductores.size, horaBogota(f.horaInicio), horaBogota(f.horaFin), "", "", "",
            ]),
            ["TOTAL GENERAL", pagos.length, totalPagado, totalDevoluciones, valorNeto,
              new Set(pagos.map((p) => p.cedula_conductor)).size, "", "", "", "", ""],
          ],
        },
      ]);
    } else if (tipo === "contabilidad") {
      await descargarHojasExcel(`devengados_contabilidad_${fecha}.xlsx`, [
        {
          nombre: "Contabilidad",
          titulo: `GESTIVO · Tesorería — Exportación Contabilidad · ${fecha}`,
          subtitulo: enc,
          headers: ["Fecha", "Código", "Cédula", "Nombre", "Valor entregado", "Cuenta contable", "Tipo movimiento", "Cajero", "Estado", "Trasladado a GEMA", "Acumulado quincena", "Observaciones", "Comprobante"],
          widths: [11, 10, 13, 26, 15, 15, 14, 22, 14, 15, 16, 28, 22],
          moneyCols: [4, 10],
          rows: entregas.map((e) => [
            e.fecha, e.codigo_conductor ?? "", e.cedula_conductor, e.conductor_nombre ?? "",
            e.valor_entregado, e.cuenta_contable, e.movimiento, nombreCajero(e.aprobada_por),
            ESTADO_CHIP[e.estado]?.label ?? e.estado, e.trasladada_gema ? "Sí" : "No",
            acumQuincena[e.cedula_conductor] ?? 0, e.observacion ?? "", e.id,
          ]),
        },
        {
          nombre: "Acumulados",
          titulo: "Acumulado por conductor (quincena)",
          headers: ["Cédula", "Nombre", "Acumulado quincena"],
          widths: [14, 28, 18],
          moneyCols: [2],
          rows: [
            ...Object.entries(acumQuincena).map(([cedula, valor]) => {
              const e = entregas.find((x) => x.cedula_conductor === cedula);
              return [cedula, e?.conductor_nombre ?? "", valor];
            }),
            ["TOTAL PERÍODO", "", Object.values(acumQuincena).reduce((s, v) => s + v, 0)],
          ],
        },
      ]);
    } else {
      await descargarHojasExcel(`devengados_cierre_${fecha}.xlsx`, [
        {
          nombre: "Cierre de caja",
          titulo: `GESTIVO · Tesorería — Cierre de caja · ${fecha}`,
          subtitulo: `Pagado ${cop.format(totalPagado)} · devoluciones ${cop.format(totalDevoluciones)} · neto ${cop.format(valorNeto)}`,
          headers: ["Cajero", "Fecha", "Hora inicio", "Hora fin", "Cantidad de pagos", "Valor total pagado", "Total devoluciones", "Valor neto"],
          widths: [26, 12, 12, 12, 16, 17, 17, 15],
          moneyCols: [5, 6, 7],
          rows: consolidado.map((f) => [
            f.cajero, fecha, horaBogota(f.horaInicio), horaBogota(f.horaFin),
            f.pagos, f.valorTotal, f.devoluciones, f.valorTotal - f.devoluciones,
          ]),
        },
      ]);
    }

    void registrarEventoReporte(tipo, "excel", fecha);
  }

  // Enlaces directos (no window.open): el bloqueador de popups del
  // navegador impedía abrir la vista de impresión.
  const urlImprimir = (tipo: string) =>
    `/tesoreria/devengados/entregas/imprimir?tipo=${tipo}&fecha=${fecha}`;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Devengados · Entregas del día</h1>
            <span className="inline-flex items-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
              {entregas.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              type="date"
              value={fecha}
              onChange={(e) => router.push(`/tesoreria/devengados/entregas?fecha=${e.target.value}`)}
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
            />
            <span className="text-gray-500">
              Pagado: <strong className="text-gray-900">{cop.format(totalPagado)}</strong>
            </span>
            <span className="text-gray-500">
              Devoluciones: <strong className="text-red-600">{cop.format(totalDevoluciones)}</strong>
            </span>
            <span className="text-gray-500">
              Neto: <strong className="text-gray-900">{cop.format(valorNeto)}</strong>
            </span>
            <span className="text-gray-500">
              Pendientes GEMA:{" "}
              <strong className={pendientes.length ? "text-amber-600" : "text-emerald-600"}>
                {pendientes.length}
              </strong>
            </span>
          </div>
        </div>

        {/* Reportes y exportaciones del día */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium uppercase tracking-wide text-gray-400">Reportes:</span>
          <a href={urlImprimir("cierre")} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-[#F8FAFC]">
            <Printer className="h-3.5 w-3.5" /> Cierre de caja (PDF)
          </a>
          <button onClick={() => exportarExcel("cierre")} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-[#F8FAFC]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Cierre de caja (Excel)
          </button>
          <a href={urlImprimir("diario")} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-[#F8FAFC]">
            <Printer className="h-3.5 w-3.5" /> Reporte diario con firma (PDF)
          </a>
          <a href={urlImprimir("entregado")} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-[#F8FAFC]">
            <Printer className="h-3.5 w-3.5" /> Entregado del día (PDF)
          </a>
          <button onClick={() => exportarExcel("detallado")} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-[#F8FAFC]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Entregado detallado (Excel)
          </button>
          <button onClick={() => exportarExcel("consolidado")} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-[#F8FAFC]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Entregado consolidado (Excel)
          </button>
          <button onClick={() => exportarExcel("contabilidad")} className="inline-flex items-center gap-1.5 rounded-lg border border-[#4F46E5] bg-[#EEF2FF] px-2.5 py-1.5 font-medium text-[#4F46E5] hover:bg-[#E0E7FF]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportación Contabilidad (Excel)
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6">
        {msg && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-xl border p-4 text-sm ${
              msg.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {msg.ok ? <CircleCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            {msg.texto}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-4 py-3 text-xs text-gray-500">
            Cada entrega debe registrarse manualmente en GEMA — cuenta contable{" "}
            <strong>281505010</strong> (movimiento débito; las devoluciones generan el crédito de
            reverso), en el cierre del día de la transacción. Marca la casilla cuando quede digitada.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Trasladada</th>
                  <th className="px-4 py-2">Conductor</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2">Movimiento</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Cajero</th>
                  <th className="px-4 py-2">Registrada</th>
                  <th className="px-4 py-2">Observación</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entregas.map((e) => {
                  const chip = ESTADO_CHIP[e.estado] ?? ESTADO_CHIP.activa;
                  return (
                    <tr key={e.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                      <td className="px-4 py-2">
                        <button
                          onClick={() => toggle(e)}
                          disabled={pending && pendienteId === e.id}
                          className="inline-flex items-center gap-1.5 text-xs font-medium"
                          title={
                            e.trasladada_gema
                              ? `Trasladada ${formatDateTimeBogota(e.trasladada_at)}`
                              : "Marcar como trasladada a GEMA"
                          }
                        >
                          {pending && pendienteId === e.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          ) : e.trasladada_gema ? (
                            <CircleCheck className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-500" />
                          )}
                          <span className={e.trasladada_gema ? "text-emerald-700" : "text-amber-600"}>
                            {e.trasladada_gema ? "Sí" : "Pendiente"}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-900">{e.conductor_nombre ?? "—"}</p>
                        <p className="text-xs text-gray-500">
                          CC {e.cedula_conductor}
                          {e.codigo_conductor ? ` · Cód. ${e.codigo_conductor}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {e.movimiento === "CREDITO" ? "−" : ""}
                        {cop.format(e.valor_entregado)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {e.cuenta_contable} · {e.movimiento}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: chip.bg, color: chip.color }}
                        >
                          {chip.label}
                        </span>
                        {e.segundo_pago && (
                          <span
                            className="ml-1 inline-flex whitespace-nowrap rounded-full bg-[#EEF2FF] px-2 py-0.5 text-xs font-medium text-[#4F46E5]"
                            title={`Autorizado por ${e.autorizado_por ?? "—"} · ${e.autorizacion_motivo ?? ""}`}
                          >
                            2.º pago
                          </span>
                        )}
                        {e.devolucion_motivo && (
                          <p className="mt-0.5 text-xs text-gray-400">Motivo: {e.devolucion_motivo}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {nombreCajero(e.aprobada_por)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {formatDateTimeBogota(e.created_at)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{e.observacion ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        {e.movimiento === "DEBITO" && e.estado === "activa" && (
                          <button
                            onClick={() => {
                              setMotivoDevolucion("");
                              setDevolucion(e);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-700"
                            title="Devolución total con reverso contable"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Devolver
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {entregas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                      Sin entregas registradas el {fecha}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirmación de devolución (motivo obligatorio) */}
      {devolucion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-base font-semibold text-gray-900">Confirmar devolución total</h3>
              <button onClick={() => setDevolucion(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1 rounded-lg bg-[#F8FAFC] p-3 text-sm text-gray-700">
              <p>
                Conductor: <strong>{devolucion.conductor_nombre ?? devolucion.cedula_conductor}</strong>
              </p>
              <p>
                Valor a devolver: <strong>{cop.format(devolucion.valor_entregado)}</strong> (total)
              </p>
              <p className="text-xs text-gray-500">
                Se genera automáticamente el reverso contable (crédito 281505010) y el cupo de la
                quincena queda disponible de nuevo.
              </p>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Motivo de la devolución (obligatorio)
              </label>
              <input
                type="text"
                value={motivoDevolucion}
                onChange={(e) => setMotivoDevolucion(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDevolucion(null)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-gray-600 hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarDevolucion}
                disabled={pending || !motivoDevolucion.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar devolución
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
