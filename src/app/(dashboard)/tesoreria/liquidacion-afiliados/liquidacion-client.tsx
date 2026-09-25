"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock, CalendarRange, FileSpreadsheet, FileText, Info, Loader2, ReceiptText, Search, Settings2, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import {
  DIAS_SEMANA, ESTADO_PAGO_LABEL, PLAZOS, fechaCorta, type EstadoPago, type PagoProgramado, type Plazo, type ReglaPago,
} from "@/lib/tesoreria/calendario-pago";
import type { FilaResumenAfiliado } from "@/lib/tesoreria/liquidacion-afiliados";
import type { FilaPago } from "@/lib/tesoreria/pagos-afiliados";
import { fechaConDia, pesos } from "@/lib/tesoreria/formato-liquidacion";
import { descargarPdfTabla } from "@/lib/exportar/pdf-tabla";
import { guardarReglaPago } from "./actions";

export type FilaRango = FilaResumenAfiliado & { codigo: string | null; plazo: Plazo };

interface Comun {
  hoy: string;
  reglas: Record<Plazo, ReglaPago>;
  reglasDesdeTabla: boolean;
  ultimoSincronizado: string | null;
  puedeConfigurar: boolean;
}

const RUTA = "/tesoreria/liquidacion-afiliados";
const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const botonCls =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";
const fmt = (n: number) => n.toLocaleString("es-CO");

export const ESTADO_ESTILO: Record<EstadoPago, string> = {
  en_curso: "bg-[#F1F5F9] text-[#475569]",
  por_pagar: "bg-[#FEF3C7] text-[#92400E]",
  pagadero_hoy: "bg-[#DBEAFE] text-[#1D4ED8]",
  fecha_cumplida: "bg-[#D1FAE5] text-[#047857]",
};

/** Aviso fijo: lo que el reporte de GEMA tiene y Gestivo todavía no. */
export function AvisoObligaciones() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-xs text-[#1E40AF]">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        El <strong>pago de obligaciones</strong> («descuentos otros» del GAF-R-12: facturas de parqueadero, repuestos,
        cuotas…) aún no llega de GEMA a Gestivo. Por eso las deducciones no lo incluyen y el valor final es el
        <strong> líquido antes de obligaciones</strong>; el producido neto de GEMA es ese líquido menos las obligaciones.
      </p>
    </div>
  );
}

export function AvisoSincronizacion({ ultimo, hasta }: { ultimo: string | null; hasta: string }) {
  if (ultimo && ultimo >= hasta) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        GEMA está sincronizado hasta el <strong>{ultimo ? fechaCorta(ultimo) : "—"}</strong>: los días posteriores del
        periodo todavía no están y las cifras pueden cambiar.
      </p>
    </div>
  );
}

export function LiquidacionAfiliadosClient(props: Comun & {
  vista: "pagos" | "rango";
  desde: string;
  hasta: string;
  filasRango: FilaRango[];
  opcionesPago: string[];
  fechaPago: string | null;
  periodosPago: Partial<Record<Plazo, PagoProgramado>>;
  filasPago: FilaPago[];
  sinPlazo?: string[];
}) {
  const { vista, reglas, hoy } = props;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [plazo, setPlazo] = useState<"" | Plazo>("");
  const [desde, setDesde] = useState(props.desde);
  const [hasta, setHasta] = useState(props.hasta);
  const [generando, setGenerando] = useState(false);

  const filas: (FilaRango | FilaPago)[] = vista === "pagos" ? props.filasPago : props.filasRango;
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter((f) =>
      (!plazo || f.plazo === plazo) &&
      (!t || f.cedula.includes(t) || (f.nombre ?? "").toLowerCase().includes(t) || (f.codigo ?? "").toLowerCase() === t ||
        f.vehiculos.some((v) => v === t))
    );
  }, [filas, q, plazo]);
  const tot = useMemo(() => visibles.reduce(
    (a, f) => ({
      viajes: a.viajes + f.viajes, bruto: a.bruto + f.resumen.base,
      deducciones: a.deducciones + f.resumen.totalDeducciones, liquido: a.liquido + f.resumen.liquido,
    }),
    { viajes: 0, bruto: 0, deducciones: 0, liquido: 0 },
  ), [visibles]);

  const hrefDetalle = (f: FilaRango | FilaPago) => {
    const sp = new URLSearchParams({ cedula: f.cedula, vista });
    if ("pago" in f) { sp.set("desde", f.pago.periodo.desde); sp.set("hasta", f.pago.periodo.hasta); }
    else { sp.set("desde", props.desde); sp.set("hasta", props.hasta); }
    return `${RUTA}?${sp.toString()}`;
  };

  const excelParams = new URLSearchParams(
    vista === "pagos" ? { vista, pago: props.fechaPago ?? "" } : { vista, desde: props.desde, hasta: props.hasta },
  );
  const titulo = vista === "pagos" && props.fechaPago
    ? `Pagos del ${fechaConDia(props.fechaPago)}`
    : `Rango del ${fechaCorta(props.desde)} al ${fechaCorta(props.hasta)}`;

  async function pdf() {
    setGenerando(true);
    try {
      await descargarPdfTabla({
        archivo: `liquidacion_afiliados_${vista === "pagos" ? props.fechaPago : `${props.desde}_a_${props.hasta}`}`,
        modulo: "Tesorería · Liquidación de afiliados",
        titulo,
        contexto: [
          ...(vista === "pagos"
            ? Object.values(props.periodosPago).map((p) => `${reglas[p.periodo.plazo].etiqueta}: ${p.periodo.etiqueta}`)
            : []),
          "Líquido antes de obligaciones: el pago de obligaciones de GEMA no está en Gestivo.",
        ],
        resumen: [`${visibles.length} afiliados`, `Bruto ${pesos(tot.bruto)}`, `Líquido ${pesos(tot.liquido)}`],
        orientacion: "landscape",
        columnas: [
          { titulo: "Código", ancho: 16 }, { titulo: "Afiliado" }, { titulo: "Cédula", ancho: 24 },
          { titulo: "Plazo", ancho: 20 }, { titulo: "Vehículos", ancho: 30 }, { titulo: "Viajes", ancho: 16, alinear: "right" },
          { titulo: "Bruto", ancho: 28, alinear: "right" }, { titulo: "Deducciones", ancho: 28, alinear: "right" },
          { titulo: "Líquido", ancho: 28, alinear: "right" },
        ],
        filas: [
          ...visibles.map((f) => [
            f.codigo ?? "", f.nombre ?? "", f.cedula, reglas[f.plazo].etiqueta, f.vehiculos.join(", "), fmt(f.viajes),
            pesos(f.resumen.base), pesos(f.resumen.totalDeducciones), pesos(f.resumen.liquido),
          ]),
          ["", { texto: "TOTAL", negrita: true }, "", "", "", { texto: fmt(tot.viajes), negrita: true },
            { texto: pesos(tot.bruto), negrita: true }, { texto: pesos(tot.deducciones), negrita: true },
            { texto: pesos(tot.liquido), negrita: true }],
        ],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Liquidación de afiliados"
        icono={ReceiptText}
        junto={
          <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0] text-xs">
            {([["pagos", "Calendario de pagos", CalendarClock], ["rango", "Rango libre", CalendarRange]] as const).map(([v, label, Icono]) => (
              <Link
                key={v}
                href={`${RUTA}${v === "rango" ? "?vista=rango" : ""}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-medium ${vista === v ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}
              >
                <Icono className="h-3.5 w-3.5" /> {label}
              </Link>
            ))}
          </div>
        }
      >
        <button type="button" onClick={pdf} disabled={generando || visibles.length === 0} className={botonCls}>
          {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-[#DC2626]" />}
          PDF
        </button>
        <a
          href={visibles.length === 0 ? undefined : `/api/tesoreria/liquidacion-afiliados/export?${excelParams.toString()}`}
          className={`${botonCls} ${visibles.length === 0 ? "pointer-events-none opacity-50" : ""}`}
          title="Resumen por afiliado y detalle diario de cada vehículo"
        >
          <FileSpreadsheet className="h-4 w-4 text-[#059669]" /> Excel
        </a>
      </PageHeader>

      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        {!props.reglasDesdeTabla && (
          <div className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Falta aplicar la migración <code>20260925194027</code>: el calendario usa la regla acordada (martes; miércoles
              si el lunes o el martes es festivo) y todavía no se puede cambiar desde aquí.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
          {vista === "pagos" ? (
            <label className="flex flex-col gap-1 text-sm text-gray-600">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Fecha de pago</span>
              <select
                value={props.fechaPago ?? ""}
                onChange={(e) => router.push(`${RUTA}?pago=${e.target.value}`)}
                className={`${inputCls} min-w-56`}
              >
                {props.opcionesPago.map((f) => (
                  <option key={f} value={f}>
                    {fechaConDia(f)}{f === hoy ? " · hoy" : f > hoy ? " · próxima" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm text-gray-600">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Desde</span>
                <input type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-600">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Hasta</span>
                <input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
              </label>
              <button
                type="button"
                onClick={() => router.push(`${RUTA}?vista=rango&desde=${desde}&hasta=${hasta}`)}
                disabled={!desde || !hasta || desde > hasta}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
              >
                <Search className="h-4 w-4" /> Aplicar
              </button>
            </>
          )}
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Plazo</span>
            <select value={plazo} onChange={(e) => setPlazo(e.target.value as "" | Plazo)} className={inputCls}>
              <option value="">Todos</option>
              {PLAZOS.map((p) => <option key={p} value={p}>{reglas[p].etiqueta}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Buscar</span>
            <span className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, cédula, código o vehículo"
                className={`${inputCls} w-64 pl-8`}
              />
            </span>
          </label>
        </div>

        {vista === "pagos" && <PeriodosDelPago {...props} />}

        <AvisoObligaciones />

        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
            <p className="text-xs text-gray-500">
              {fmt(visibles.length)} afiliado{visibles.length === 1 ? "" : "s"} · solo cierres de afiliado en vehículos de
              afiliado en la operación
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Afiliado</th>
                  <th className="px-3 py-2">Plazo</th>
                  <th className="px-3 py-2">Vehículos</th>
                  <th className="px-3 py-2 text-right">Días</th>
                  <th className="px-3 py-2 text-right">Viajes</th>
                  <th className="px-3 py-2 text-right">Bruto</th>
                  <th className="px-3 py-2 text-right" title="Sin el pago de obligaciones">Deducciones</th>
                  <th className="px-3 py-2 text-right" title="Líquido de GEMA antes de obligaciones">Líquido</th>
                  {vista === "pagos" && <th className="px-3 py-2">Pago</th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={`${f.cedula}-${f.plazo}`} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-3 py-2">
                      <Link href={hrefDetalle(f)} className="font-medium text-[#4338CA] hover:underline">
                        {f.nombre ?? f.cedula}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {f.codigo ? `${f.codigo} · ` : ""}CC {f.cedula}
                        {props.sinPlazo?.includes(f.cedula) ? " · plazo sin dato en GEMA, se toma semanal" : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{reglas[f.plazo].etiqueta}</td>
                    <td className="px-3 py-2 text-gray-700">{f.vehiculos.join(", ")}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmt(f.dias)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmt(f.viajes)}</td>
                    <td className="px-3 py-2 text-right">{pesos(f.resumen.base)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{pesos(f.resumen.totalDeducciones)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${f.resumen.liquido < 0 ? "text-[#B91C1C]" : "text-gray-900"}`}>
                      {pesos(f.resumen.liquido)}
                    </td>
                    {"pago" in f && (
                      <td className="px-3 py-2">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_ESTILO[f.estado]}`}>
                          {ESTADO_PAGO_LABEL[f.estado]}
                        </span>
                        {/* En un periodo en curso ya se sabe que faltan días; el aviso importa en uno cerrado. */}
                        {f.incompleto && f.estado !== "en_curso" && (
                          <p className="mt-0.5 text-[11px] text-[#92400E]">GEMA sin sincronizar todo el periodo</p>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">
                      {filas.length === 0
                        ? "Ningún afiliado operó en el periodo que se paga en esta fecha."
                        : "Ningún afiliado coincide con el filtro."}
                    </td>
                  </tr>
                ) : (
                  <tr className="bg-[#F8FAFC] font-semibold text-gray-900">
                    <td className="px-3 py-2" colSpan={4}>TOTAL</td>
                    <td className="px-3 py-2 text-right">{fmt(tot.viajes)}</td>
                    <td className="px-3 py-2 text-right">{pesos(tot.bruto)}</td>
                    <td className="px-3 py-2 text-right">{pesos(tot.deducciones)}</td>
                    <td className="px-3 py-2 text-right">{pesos(tot.liquido)}</td>
                    {vista === "pagos" && <td />}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <ConfigCalendario reglas={reglas} puedeConfigurar={props.puedeConfigurar && props.reglasDesdeTabla} />
      </div>
    </>
  );
}

function PeriodosDelPago({ periodosPago, reglas, hoy, ultimoSincronizado, fechaPago }: {
  periodosPago: Partial<Record<Plazo, PagoProgramado>>;
  reglas: Record<Plazo, ReglaPago>;
  hoy: string;
  ultimoSincronizado: string | null;
  fechaPago: string | null;
}) {
  const lista = PLAZOS.map((p) => periodosPago[p]).filter((x): x is PagoProgramado => !!x);
  const hastaMax = lista.map((x) => x.periodo.hasta).sort().reverse()[0];
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        {PLAZOS.map((p) => {
          const x = periodosPago[p];
          return (
            <div key={p} className="rounded-xl border border-[#E2E8F0] bg-white p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{reglas[p].etiqueta}</p>
              {x ? (
                <>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">{x.periodo.etiqueta}</p>
                  <p className="text-xs text-gray-600">
                    Corte {fechaConDia(x.periodo.hasta)} · pago {fechaConDia(x.pago.fecha)}
                    {x.pago.motivo ? ` (corrido: ${x.pago.motivo})` : ""}
                    {x.periodo.hasta >= hoy ? " · periodo en curso" : ""}
                  </p>
                </>
              ) : (
                <p className="mt-0.5 text-sm text-gray-500">
                  Ningún periodo {reglas[p].etiqueta.toLowerCase()} se paga el {fechaPago ? fechaConDia(fechaPago) : "—"}.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {hastaMax && <AvisoSincronizacion ultimo={ultimoSincronizado} hasta={hastaMax} />}
    </div>
  );
}

function ConfigCalendario({ reglas, puedeConfigurar }: { reglas: Record<Plazo, ReglaPago>; puedeConfigurar: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Settings2 className="h-4 w-4 text-gray-500" /> Calendario de pago
        </span>
        <span className="text-xs text-gray-500">
          {PLAZOS.map((p) => `${reglas[p].etiqueta}: ${DIAS_SEMANA[reglas[p].diaPago - 1]}`).join(" · ")}
          {abierto ? " ▲" : " ▼"}
        </span>
      </button>
      {abierto && (
        <div className="grid gap-4 border-t border-[#F1F5F9] p-4 md:grid-cols-2">
          {PLAZOS.map((p) => <ReglaEditor key={p} regla={reglas[p]} editable={puedeConfigurar} />)}
          {!puedeConfigurar && (
            <p className="text-xs text-gray-500 md:col-span-2">
              Solo quien tiene Parámetros de Tesorería puede cambiar el calendario (y requiere la migración aplicada).
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ReglaEditor({ regla, editable }: { regla: ReglaPago; editable: boolean }) {
  const router = useRouter();
  const [r, setR] = useState(regla);
  const [guardando, startGuardar] = useTransition();
  const cambiado = JSON.stringify(r) !== JSON.stringify(regla);
  const corte = regla.plazo === "SEMANAL"
    ? `De lunes a ${DIAS_SEMANA[regla.diaCorte - 1]}`
    : `Del 1 al ${regla.diaCorte} y del ${regla.diaCorte + 1} al fin de mes`;
  const dia = (valor: number, onChange: (n: number) => void) => (
    <select value={valor} disabled={!editable} onChange={(e) => onChange(Number(e.target.value))} className={inputCls}>
      {DIAS_SEMANA.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
    </select>
  );
  function guardar() {
    startGuardar(async () => {
      const res = await guardarReglaPago({
        plazo: r.plazo, diaPago: r.diaPago, diaPagoAlterno: r.diaPagoAlterno,
        correrSiLunesFestivo: r.correrSiLunesFestivo, correrSiDiaPagoFestivo: r.correrSiDiaPagoFestivo,
      });
      if (res.ok) { toast.success(`Calendario ${regla.etiqueta.toLowerCase()} guardado`); router.refresh(); }
      else toast.error(res.error);
    });
  }
  return (
    <div className="space-y-2 rounded-lg border border-[#F1F5F9] p-3 text-sm">
      <p className="font-semibold text-gray-900">{regla.etiqueta}</p>
      <p className="text-xs text-gray-500">Periodo: {corte}{regla.plazo === "DECADA" ? " (en GEMA figura como «DECADA»)" : ""}.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Día de pago {dia(r.diaPago, (n) => setR({ ...r, diaPago: n }))}
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Si hay festivo, se paga el {dia(r.diaPagoAlterno, (n) => setR({ ...r, diaPagoAlterno: n }))}
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" disabled={!editable} checked={r.correrSiLunesFestivo}
          onChange={(e) => setR({ ...r, correrSiLunesFestivo: e.target.checked })} />
        Correr el pago si el lunes de esa semana es festivo
      </label>
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" disabled={!editable} checked={r.correrSiDiaPagoFestivo}
          onChange={(e) => setR({ ...r, correrSiDiaPagoFestivo: e.target.checked })} />
        Correr el pago si el propio día de pago es festivo
      </label>
      {editable && (
        <button
          type="button"
          onClick={guardar}
          disabled={!cambiado || guardando}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#4F46E5] px-3 text-xs font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
        </button>
      )}
    </div>
  );
}
