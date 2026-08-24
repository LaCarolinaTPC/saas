"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays, ChevronDown, ChevronRight, Download, HandCoins, RotateCcw, Search,
  TrendingUp,
} from "lucide-react";
import type { LiquidacionConductor, MovDia } from "@/lib/devengados/liquidacion";
import { registrarEventoReporte } from "@/lib/devengados/actions";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** YYYY-MM-DD → DD/MM/YYYY. */
function fechaCorta(f: string): string {
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
}

/** Saldo con signo: verde disponible, rojo deuda. */
function claseSaldo(v: number): string {
  return v < 0 ? "text-red-600" : "text-emerald-600";
}

/**
 * Liquidación consolidada: una línea por día (expandible al detalle por
 * ruta/vehículo), los retiros como filas propias resaltadas y el saldo
 * corriente encadenado — la explicación que Nestor hoy arma a mano en Excel.
 *
 * El mismo componente sirve a /produccion-conductor con `mostrarSaldos=false`:
 * ahí el reporte muestra SOLO lo producido, sin base, saldos, retiros ni deuda
 * (módulo de permiso aparte, para poder entregarlo a quien no debe ver el
 * saldo del conductor).
 */
export function LiquidacionClient({
  codigo,
  fecha,
  fechaFin,
  hoy,
  liquidacion,
  mostrarSaldos = true,
  mostrarResumen = true,
  ruta = "/liquidacion",
  descripcionReporte = "producción",
  tituloExcel = mostrarSaldos ? "Liquidación" : "Producción",
  tipoAuditoria = mostrarSaldos ? "liquidacion_conductor" : "produccion_conductor",
  mensajeTotalNeto,
}: {
  codigo: string | null;
  fecha: string;
  fechaFin: string;
  hoy: string;
  liquidacion: LiquidacionConductor | null;
  /** `false` oculta base, saldo día, saldo corriente, retiros y disponible. */
  mostrarSaldos?: boolean;
  /** `false` oculta por completo las tarjetas de resumen. */
  mostrarResumen?: boolean;
  /** Ruta base sobre la que navegan "Consultar" y "Limpiar". */
  ruta?: string;
  /** Nombre mostrado cuando aún no se ha hecho una consulta. */
  descripcionReporte?: string;
  /** Nombre usado en la pestaña y archivo de Excel. */
  tituloExcel?: string;
  /** Identificador del reporte para la auditoría de exportaciones. */
  tipoAuditoria?: string;
  /** Mensaje asociado al valor destacado del total de neto día. */
  mensajeTotalNeto?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(codigo ?? "");
  const [desde, setDesde] = useState(fecha);
  const [hasta, setHasta] = useState(fechaFin);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);

  function consultar() {
    const cod = q.trim();
    if (!/^\d{1,6}$/.test(cod) || !desde) return;
    const h = hasta && hasta >= desde ? (hasta > hoy ? hoy : hasta) : desde;
    router.push(`${ruta}?codigo=${cod}&fecha=${desde}&hasta=${h}`);
  }

  /** Borra la consulta en pantalla para el siguiente conductor (pedido de
   *  Nestor, 05-ago-2026): la página remonta limpia vía el key del server. */
  function limpiar() {
    router.push(ruta);
  }

  function alternar(fechaDia: string) {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(fechaDia)) s.delete(fechaDia);
      else s.add(fechaDia);
      return s;
    });
  }

  return (
    <div className="space-y-4">
      {/* Consulta: solo código exacto + rango de fechas */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Código del conductor
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && consultar()}
                placeholder="Ej: 2584"
                inputMode="numeric"
                className="w-28 bg-transparent text-sm outline-none"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Desde</span>
            <span className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
              <input
                type="date"
                value={desde}
                max={hoy}
                onChange={(e) => setDesde(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Hasta</span>
            <span className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
              <input
                type="date"
                value={hasta}
                min={desde}
                max={hoy}
                onChange={(e) => setHasta(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
            </span>
          </label>
          <button
            onClick={consultar}
            className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]"
          >
            Consultar
          </button>
          {(codigo || q) && (
            <button
              onClick={limpiar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Limpiar
            </button>
          )}
          {liquidacion && (
            <button
              onClick={() => exportarExcel(liquidacion, mostrarSaldos, tituloExcel, tipoAuditoria, setExportando)}
              disabled={exportando}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exportando ? "Generando…" : "Excel"}
            </button>
          )}
        </div>
      </div>

      {!codigo ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-gray-500">
          Digite el código del conductor y el rango de fechas para ver su{" "}
          {mostrarSaldos ? "liquidación consolidada" : descripcionReporte}.
        </div>
      ) : !liquidacion ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-gray-500">
          Sin movimientos para el código <b>{codigo}</b> entre{" "}
          {fechaCorta(fecha)} y {fechaCorta(fechaFin)}.
        </div>
      ) : (
        <Resultado
          liq={liquidacion}
          abiertos={abiertos}
          alternar={alternar}
          mostrarSaldos={mostrarSaldos}
          mostrarResumen={mostrarResumen}
          mensajeTotalNeto={mensajeTotalNeto}
        />
      )}
    </div>
  );
}

function Resultado({
  liq,
  abiertos,
  alternar,
  mostrarSaldos,
  mostrarResumen,
  mensajeTotalNeto,
}: {
  liq: LiquidacionConductor;
  abiertos: Set<string>;
  alternar: (f: string) => void;
  mostrarSaldos: boolean;
  mostrarResumen: boolean;
  mensajeTotalNeto?: string;
}) {
  const t = liq.totales;
  const esDeuda = t.saldoFinal < 0;
  const thCls = "px-3 py-2 text-right font-semibold";
  const subViajes = `${num.format(t.viajes)} viajes · ${t.dias} día${t.dias === 1 ? "" : "s"}`;

  return (
    <>
      {/* El "grueso": disponible del rango destacado (pedido de Nestor) */}
      {mostrarResumen && (mostrarSaldos ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            className={`rounded-xl border-2 p-4 lg:order-last ${
              esDeuda ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <HandCoins className="h-4 w-4" />
              {esDeuda ? "Saldo pendiente (deuda)" : "Disponible"}
            </div>
            <div className={`mt-1 text-3xl font-bold ${claseSaldo(t.saldoFinal)}`}>
              {cop.format(t.saldoFinal)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Cód. {liq.codigo} · {fechaCorta(liq.ini)} – {fechaCorta(liq.fin)}
            </div>
          </div>
          <Tarjeta titulo="Producción neta" valor={cop.format(t.netoDia)} sub={subViajes} />
          <Tarjeta titulo="Base del período" valor={cop.format(t.baseAcum)} sub={`${cop.format(liq.baseDiaria)} por día trabajado`} />
          <Tarjeta titulo="Retiros" valor={t.retiros > 0 ? `− ${cop.format(t.retiros)}` : cop.format(0)} sub="Pagos ya reclamados en el rango" rojo={t.retiros > 0} />
        </div>
      ) : (
        /* Sin saldos la producción neta es la única cifra del reporte. */
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <TrendingUp className="h-4 w-4" />
            Producción neta
          </div>
          <div className="mt-1 text-3xl font-bold text-emerald-600">
            {cop.format(t.netoDia)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Cód. {liq.codigo} · {fechaCorta(liq.ini)} – {fechaCorta(liq.fin)} · {subViajes}
          </div>
        </div>
      ))}

      {/* Una línea por día + retiros intercalados */}
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
        <table className={`w-full text-sm ${mostrarSaldos ? "min-w-[860px]" : "min-w-[640px]"}`}>
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-semibold">Fecha</th>
              <th className="px-3 py-2 text-left font-semibold">Tipo cierre</th>
              <th className={thCls}>Viajes</th>
              <th className={thCls}>Timb. CU</th>
              <th className={thCls}>Bruto día</th>
              <th className={thCls}>Ahorro</th>
              <th className={thCls}>Neto día</th>
              {mostrarSaldos && (
                <>
                  <th className={thCls}>Base</th>
                  <th className={thCls}>Saldo día</th>
                  <th className={thCls}>Saldo</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {liq.movimientos.map((m, i) =>
              m.tipo === "retiro" ? (
                // Sin columna de saldo un retiro queda como un "− $X" suelto
                // que no cuadra con el total: en producción no se muestra.
                !mostrarSaldos ? null : (
                  <tr key={`r-${i}`} className="border-b border-[#FDE68A] bg-[#FFFBEB]">
                    <td className="px-3 py-2 text-gray-700">{fechaCorta(m.fecha)}</td>
                    <td className="px-3 py-2" colSpan={5}>
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase text-amber-800">
                        Retiro
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600">
                      − {cop.format(m.valor)}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className={`px-3 py-2 text-right font-semibold ${claseSaldo(m.saldoCorriente)}`}>
                      {cop.format(m.saldoCorriente)}
                    </td>
                  </tr>
                )
              ) : (
                <FilaDia
                  key={m.fecha}
                  dia={m}
                  abierto={abiertos.has(m.fecha)}
                  alternar={alternar}
                  mostrarSaldos={mostrarSaldos}
                />
              )
            )}
            <tr className="border-t-2 border-[#E2E8F0] bg-[#F8FAFC] font-semibold text-gray-900">
              <td className="px-3 py-2" colSpan={2}>Total del rango</td>
              <td className="px-3 py-2 text-right">{num.format(t.viajes)}</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right">{cop.format(t.brutoDia)}</td>
              <td className="px-3 py-2 text-right">{cop.format(t.ahorro)}</td>
              <td className="px-3 py-2 text-right">
                {mensajeTotalNeto && (
                  <span className="mt-2 inline-block rounded-lg border-2 border-amber-500 bg-amber-200 px-3 py-2 text-left text-base font-extrabold leading-snug text-amber-950 shadow-md animate-pulse motion-reduce:animate-none">
                    Este valor {mensajeTotalNeto} {cop.format(t.netoDia)}
                  </span>
                )}
                {!mensajeTotalNeto && <div>{cop.format(t.netoDia)}</div>}
              </td>
              {mostrarSaldos && (
                <>
                  <td className="px-3 py-2 text-right">{cop.format(t.baseAcum)}</td>
                  <td className="px-3 py-2 text-right text-red-600">
                    {t.retiros > 0 ? `Retiros − ${cop.format(t.retiros)}` : ""}
                  </td>
                  <td className={`px-3 py-2 text-right text-base ${claseSaldo(t.saldoFinal)}`}>
                    {cop.format(t.saldoFinal)}
                  </td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Cada fila consolida todas las rutas y vehículos del día (mismo
        porcentaje de pago). Toque una fila para ver el detalle.
        {mostrarSaldos
          ? " Los retiros restan del saldo en la fecha en que se reclamaron."
          : " El total corresponde a lo producido en el rango."}
      </p>
    </>
  );
}

function Tarjeta({
  titulo,
  valor,
  sub,
  rojo = false,
}: {
  titulo: string;
  valor: string;
  sub: string;
  rojo?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className={`mt-1 text-2xl font-bold ${rojo ? "text-red-600" : "text-gray-900"}`}>{valor}</div>
      <div className="mt-1 text-xs text-gray-500">{sub}</div>
    </div>
  );
}

function FilaDia({
  dia,
  abierto,
  alternar,
  mostrarSaldos,
}: {
  dia: MovDia;
  abierto: boolean;
  alternar: (f: string) => void;
  mostrarSaldos: boolean;
}) {
  const tdNum = "px-3 py-2 text-right tabular-nums";
  return (
    <>
      <tr
        onClick={() => alternar(dia.fecha)}
        className="cursor-pointer border-b border-[#F1F5F9] hover:bg-[#F8FAFC]"
      >
        <td className="px-3 py-2 font-medium text-gray-900">
          <span className="inline-flex items-center gap-1">
            {abierto ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            )}
            {fechaCorta(dia.fecha)}
          </span>
        </td>
        <td className="px-3 py-2 text-gray-600">{dia.tiposCierre.join(" · ")}</td>
        <td className={tdNum}>{num.format(dia.viajes)}</td>
        <td className={tdNum}>{num.format(dia.timbCu)}</td>
        <td className={tdNum}>{cop.format(dia.brutoDia)}</td>
        <td className={tdNum}>{cop.format(dia.ahorro)}</td>
        <td className={`${tdNum} font-medium`}>{cop.format(dia.netoDia)}</td>
        {mostrarSaldos && (
          <>
            <td className={tdNum}>{cop.format(dia.base)}</td>
            <td className={`${tdNum} ${claseSaldo(dia.saldoDia)}`}>{cop.format(dia.saldoDia)}</td>
            <td className={`${tdNum} font-semibold ${claseSaldo(dia.saldoCorriente)}`}>
              {cop.format(dia.saldoCorriente)}
            </td>
          </>
        )}
      </tr>
      {abierto && (
        <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
          <td colSpan={mostrarSaldos ? 10 : 7} className="px-6 py-2">
            <table className="w-full text-xs text-gray-600">
              <thead>
                <tr className="text-left uppercase tracking-wide text-gray-400">
                  <th className="py-1 pr-3 font-medium">Ruta</th>
                  <th className="py-1 pr-3 font-medium">Vehículo</th>
                  <th className="py-1 pr-3 font-medium">Tipo cierre</th>
                  <th className="py-1 pr-3 text-right font-medium">Viajes</th>
                  <th className="py-1 pr-3 text-right font-medium">Timb. CU</th>
                  <th className="py-1 pr-3 text-right font-medium">Bruto</th>
                  <th className="py-1 text-right font-medium">Neto</th>
                </tr>
              </thead>
              <tbody>
                {dia.detalle.map((d, i) => (
                  <tr key={i} className="border-t border-[#E2E8F0]">
                    <td className="py-1 pr-3">{d.ruta ?? "—"}</td>
                    <td className="py-1 pr-3">{d.vehiculo ?? "—"}</td>
                    <td className="py-1 pr-3">{d.tipoCierre}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{num.format(d.viajes)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{num.format(d.timbCu)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{cop.format(d.brutoDia)}</td>
                    <td className="py-1 text-right tabular-nums">{cop.format(d.netoDia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/** Exportación con el layout del mockup de Nestor (una hoja, filas de retiro
 *  intercaladas y saldo final resaltado). Con `mostrarSaldos=false` sale la
 *  misma hoja que ve el usuario en pantalla: 7 columnas y sin retiros — si el
 *  Excel llevara los saldos, quien tenga el reporte de producción vería la
 *  deuda con solo descargarlo. */
async function exportarExcel(
  liq: LiquidacionConductor,
  mostrarSaldos: boolean,
  titulo: string,
  tipoAuditoria: string,
  setExportando: (v: boolean) => void
) {
  setExportando(true);
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(titulo);

    ws.mergeCells(mostrarSaldos ? "A1:J1" : "A1:G1");
    ws.getCell("A1").value =
      `${titulo} conductor ${liq.codigo} (${liq.ini} – ${liq.fin})`;
    ws.getCell("A1").font = { bold: true, size: 14 };

    const header = [
      "Fecha", "Tipo cierre", "Viajes", "Timb. CU", "Bruto día",
      "Ahorro", "Neto día",
      ...(mostrarSaldos ? ["Base", "Saldo día", "Saldo"] : []),
    ];
    const hRow = ws.addRow(header);
    hRow.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    });

    for (const m of liq.movimientos) {
      if (m.tipo === "retiro") {
        if (!mostrarSaldos) continue; // igual que en pantalla
        const r = ws.addRow([
          m.fecha, "RETIRO", null, null, null, null, -m.valor, null, null, m.saldoCorriente,
        ]);
        r.eachCell((c) => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
        });
        r.getCell(7).font = { bold: true, color: { argb: "FFDC2626" } };
      } else {
        ws.addRow([
          m.fecha, m.tiposCierre.join(" · "), m.viajes, m.timbCu, m.brutoDia,
          m.ahorro, m.netoDia,
          ...(mostrarSaldos ? [m.base, m.saldoDia, m.saldoCorriente] : []),
        ]);
      }
    }

    const t = liq.totales;
    const total = ws.addRow([
      "Total", "", t.viajes, null, t.brutoDia, t.ahorro, t.netoDia,
      ...(mostrarSaldos
        ? [t.baseAcum, t.retiros > 0 ? -t.retiros : null, t.saldoFinal]
        : []),
    ]);
    total.font = { bold: true };
    total.getCell(mostrarSaldos ? 10 : 7).font = {
      bold: true,
      color: {
        argb: mostrarSaldos && t.saldoFinal < 0 ? "FFDC2626" : "FF059669",
      },
    };

    ws.columns.forEach((c, i) => {
      c.width = i === 1 ? 24 : 13;
      if (i >= 4) c.numFmt = "#,##0";
    });
    ws.views = [{ state: "frozen", ySplit: 2 }];

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf]));
    const a = document.createElement("a");
    a.href = url;
    const archivo = titulo.toLowerCase().replaceAll(" ", "-");
    a.download = `${archivo}-${liq.codigo}-${liq.ini}-${liq.fin}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    void registrarEventoReporte(
      tipoAuditoria,
      "excel",
      `${liq.ini} a ${liq.fin}`
    );
  } finally {
    setExportando(false);
  }
}
