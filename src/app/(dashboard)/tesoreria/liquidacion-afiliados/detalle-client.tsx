"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import {
  ESTADO_PAGO_LABEL, fechaCorta, type EstadoPago, type FechaPago, type Periodo, type Plazo, type ReglaPago,
} from "@/lib/tesoreria/calendario-pago";
import {
  COLUMNAS_DIA, detalleObligaciones, etiquetaNeto, lineasDeducciones, prefijoCierre, valorNeto,
  type LiquidacionAfiliado, type ResumenDeducciones, type VehiculoLiquidado,
} from "@/lib/tesoreria/liquidacion-afiliados";
import type { PropietarioFicha } from "@/lib/tesoreria/liquidacion-afiliados-data";
import type { SoporteVista } from "@/lib/tesoreria/soportes-reglas";
import { SoportesVehiculo, type AnularSoporte } from "./soportes-vehiculo";
import { cifra, fechaConDia, pesos } from "@/lib/tesoreria/formato-liquidacion";
import { exportarLiquidacionPdf } from "@/lib/tesoreria/liquidacion-pdf";
import {
  AvisoObligaciones, AvisoSincronizacion, ESTADO_ESTILO, estadoObligaciones,
} from "@/components/tesoreria/avisos-liquidacion";

const RUTA = "/tesoreria/liquidacion-afiliados";
const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const botonCls =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";
const fmt = (n: number) => n.toLocaleString("es-CO");

type OpcionPeriodo = { periodo: Periodo; pago: FechaPago; estado: EstadoPago };

/**
 * Liquidación de un afiliado con la forma del GAF-R-12: una tarjeta por
 * vehículo con la tabla diaria y los recuadros de deducciones. El periodo por
 * defecto es el último cerrado de SU plazo (semana o quincena).
 */
export function DetalleAfiliadoClient(props: {
  hoy: string;
  /** Solo lo usa Tesorería (panel de cuentas); el portal no lo pasa. */
  urlPortal?: string;
  reglas: Record<Plazo, ReglaPago>;
  ultimoSincronizado: string | null;
  cedula: string;
  ficha: PropietarioFicha | null;
  desde: string;
  hasta: string;
  periodos: OpcionPeriodo[];
  periodoActual: { periodo: Periodo; pago: FechaPago } | null;
  liquidacion: LiquidacionAfiliado;
  volverA: "pagos" | "rango";
  /**
   * "portal": la ve el propio afiliado en /portal-afiliados. Sin enlace de
   * regreso ni cédula en la URL (el servidor la toma de la sesión).
   */
  modo?: "tesoreria" | "portal";
  /** Botones extra en la cabecera (p. ej. Salir en el portal). */
  acciones?: React.ReactNode;
  /** Bloque bajo los filtros (p. ej. las cuentas del portal en Tesorería). */
  anexo?: React.ReactNode;
  soportes: SoporteVista[];
  soportesDisponible: boolean;
  /** Tesorería con la sub-función liq_afiliados_soportes. */
  puedeSubirSoportes?: boolean;
  anularSoporte?: AnularSoporte;
}) {
  const { liquidacion: l, ficha, reglas, periodoActual } = props;
  const router = useRouter();
  const plazo = ficha?.plazo ?? "SEMANAL";
  const [libre, setLibre] = useState(!periodoActual);
  const [desde, setDesde] = useState(props.desde);
  const [hasta, setHasta] = useState(props.hasta);
  const [generando, setGenerando] = useState(false);
  const nombre = l.nombre ?? ficha?.nombre ?? props.cedula;

  const portal = props.modo === "portal";
  const ir = (d: string, h: string) =>
    router.push(portal
      ? `/portal-afiliados?desde=${d}&hasta=${h}`
      : `${RUTA}?cedula=${encodeURIComponent(props.cedula)}&desde=${d}&hasta=${h}&vista=${props.volverA}`);
  const rotuloPeriodo = periodoActual
    ? `${periodoActual.periodo.etiqueta} · pago ${fechaConDia(periodoActual.pago.fecha)}${periodoActual.pago.motivo ? ` (corrido: ${periodoActual.pago.motivo})` : ""}`
    : null;

  async function pdf() {
    setGenerando(true);
    try {
      await exportarLiquidacionPdf({
        liquidacion: l, codigo: ficha?.codigo ?? null, plazo: reglas[plazo].etiqueta,
        desde: props.desde, hasta: props.hasta, periodo: rotuloPeriodo,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setGenerando(false);
    }
  }
  const excel = portal
    ? `/portal-afiliados/exportar?${new URLSearchParams({ desde: props.desde, hasta: props.hasta }).toString()}`
    : `/api/tesoreria/liquidacion-afiliados/export?${new URLSearchParams({ cedula: props.cedula, desde: props.desde, hasta: props.hasta }).toString()}`;
  const vacio = l.vehiculos.length === 0;

  return (
    <>
      <PageHeader
        volver={portal ? undefined : { href: props.volverA === "rango" ? `${RUTA}?vista=rango` : RUTA, label: "Liquidación de afiliados" }}
        titulo={nombre}
        junto={
          <span className="text-xs text-gray-500">
            {ficha?.codigo ? `${ficha.codigo} · ` : ""}CC {props.cedula} · {reglas[plazo].etiqueta}
            {ficha && !ficha.plazoReconocido ? " (plazo sin dato en GEMA)" : ""}
          </span>
        }
      >
        <button type="button" onClick={pdf} disabled={generando || vacio} className={botonCls} title="Formato GAF-R-12, una página por vehículo">
          {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-[#DC2626]" />}
          PDF
        </button>
        <a href={vacio ? undefined : excel} className={`${botonCls} ${vacio ? "pointer-events-none opacity-50" : ""}`}>
          <FileSpreadsheet className="h-4 w-4 text-[#059669]" /> Excel
        </a>
        {/* Llega del servidor: envuelto con key para que React no lo trate como lista sin clave. */}
        {props.acciones && <span key="acciones" className="contents">{props.acciones}</span>}
      </PageHeader>

      <div className="mx-auto max-w-[96rem] space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
          <label className="flex w-full flex-col gap-1 text-sm text-gray-600 sm:w-auto">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Periodo ({reglas[plazo].etiqueta.toLowerCase()})</span>
            <select
              value={libre ? "libre" : `${props.desde}|${props.hasta}`}
              onChange={(e) => {
                if (e.target.value === "libre") { setLibre(true); return; }
                const [d, h] = e.target.value.split("|");
                ir(d, h);
              }}
              className={`${inputCls} w-full min-w-0 sm:w-auto sm:min-w-80`}
            >
              {props.periodos.map((o) => (
                <option key={o.periodo.clave} value={`${o.periodo.desde}|${o.periodo.hasta}`}>
                  {o.periodo.etiqueta} · pago {fechaConDia(o.pago.fecha)} · {ESTADO_PAGO_LABEL[o.estado].toLowerCase()}
                </option>
              ))}
              <option value="libre">Rango libre…</option>
            </select>
          </label>
          {libre && (
            <>
              <label className="flex flex-col gap-1 text-sm text-gray-600">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Desde</span>
                <input type="date" value={desde} max={props.hoy} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-600">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Hasta</span>
                <input type="date" value={hasta} min={desde} max={props.hoy} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
              </label>
              <button
                type="button"
                onClick={() => ir(desde, hasta)}
                disabled={!desde || !hasta || desde > hasta}
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
              >
                <Search className="h-4 w-4" /> Aplicar
              </button>
            </>
          )}
          {periodoActual && (
            <div className="text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Fecha de pago</p>
              <p className="mt-1 flex items-center gap-2 font-semibold text-gray-900">
                {fechaConDia(periodoActual.pago.fecha)}
                {(() => {
                  const o = props.periodos.find((x) => x.periodo.clave === periodoActual.periodo.clave);
                  return o ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_ESTILO[o.estado]}`}>{ESTADO_PAGO_LABEL[o.estado]}</span> : null;
                })()}
              </p>
              {periodoActual.pago.motivo && (
                <p className="text-xs text-gray-500">Corrido del {fechaCorta(periodoActual.pago.prevista)}: {periodoActual.pago.motivo}</p>
              )}
            </div>
          )}
        </div>

        {props.anexo}

        <AvisoSincronizacion ultimo={props.ultimoSincronizado} hasta={props.hasta} />
        <AvisoObligaciones estado={estadoObligaciones(l.vehiculos.map((v) => v.resumen))} />

        {l.vehiculos.length > 1 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Vehículos" valor={l.vehiculos.map((v) => v.codigo).join(", ")} />
            <Kpi label="Base liquidación" valor={pesos(l.resumen.base)} />
            <Kpi label="Deducciones" valor={pesos(l.resumen.totalDeducciones)} nota={notaDeducciones(l.resumen)} />
            <Kpi label={etiquetaNeto(l.resumen)} valor={pesos(valorNeto(l.resumen))} destacado />
          </div>
        )}

        {vacio && (
          <p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-gray-500">
            Sin cierres de afiliado para {nombre} entre el {fechaCorta(props.desde)} y el {fechaCorta(props.hasta)}.
          </p>
        )}
        {l.vehiculos.map((v) => (
          <TarjetaVehiculo key={v.codigo} v={v}>
            <SoportesVehiculo
              v={v}
              cedula={props.cedula}
              soportes={props.soportes.filter((s) => s.codigoVehiculo === v.codigo)}
              modo={portal ? "portal" : "tesoreria"}
              puedeSubir={!!props.puedeSubirSoportes}
              disponible={props.soportesDisponible}
              anular={props.anularSoporte}
            />
          </TarjetaVehiculo>
        ))}
      </div>
    </>
  );
}

function notaDeducciones(r: ResumenDeducciones): string {
  if (r.obligaciones === null) return "Sin pago de obligaciones (sin dato)";
  return r.obligacionesParciales ? "Pago de obligaciones incompleto" : "Incluye pago de obligaciones";
}

function Kpi({ label, valor, nota, destacado }: { label: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${destacado ? "border-[#C7D2FE] bg-[#EEF2FF]" : "border-[#E2E8F0] bg-white"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${destacado ? "text-[#3730A3]" : "text-gray-900"}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );
}

function TarjetaVehiculo({ v, children }: { v: VehiculoLiquidado; children?: React.ReactNode }) {
  const th = "px-1.5 py-1.5 text-right font-medium";
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#F1F5F9] px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">
          Vehículo {v.codigo}{v.placa && <span className="ml-2 text-sm font-normal text-gray-500">{v.placa}</span>}
        </h2>
        <p className="text-xs text-gray-500">{fmt(v.dias)} día{v.dias === 1 ? "" : "s"} · {fmt(v.filas.length)} cierre{v.filas.length === 1 ? "" : "s"}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-xs">
          <thead>
            <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-gray-500">
              <th className="px-1.5 py-1.5 text-left font-medium">Fecha</th>
              <th className="px-1.5 py-1.5 text-left font-medium">Conduc</th>
              {COLUMNAS_DIA.map((c) => <th key={c.campo} className={th}>{c.titulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {v.filas.map((f, i) => (
              <tr key={`${f.fecha}-${i}`} className="border-b border-[#F1F5F9]">
                <td className="px-1.5 py-1 text-gray-700" title={f.ruta ?? undefined}>{prefijoCierre(f.tipo_cierre)} - {f.fecha}</td>
                <td className="px-1.5 py-1 text-gray-700" title={f.conductor_nombre ?? undefined}>{f.codigo_conductor ?? "—"}</td>
                {COLUMNAS_DIA.map((c) => {
                  const n = Number(f[c.campo] ?? 0);
                  return (
                    <td key={c.campo} className={`px-1.5 py-1 text-right ${c.campo === "liquido" ? `font-semibold ${n < 0 ? "text-[#B91C1C]" : "text-gray-900"}` : "text-gray-700"}`}>
                      {cifra(n, c.formato)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#E2E8F0] font-semibold text-gray-900">
              <td className="px-1.5 py-1.5" />
              <td className="px-1.5 py-1.5">TOTAL:</td>
              {COLUMNAS_DIA.map((c) => <td key={c.campo} className="px-1.5 py-1.5 text-right">{cifra(v.total[c.campo], c.formato)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-1.5">Detalles deducciones</th>
              <th className="py-1.5 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {lineasDeducciones(v.resumen).map((x) => (
              <tr key={x.etiqueta} className="border-b border-[#F1F5F9]" title={x.nota}>
                <td className="py-1 text-gray-700">{x.etiqueta}</td>
                <td className="py-1 text-right text-gray-900">{pesos(x.valor)}</td>
              </tr>
            ))}
            <tr className={`border-b border-[#F1F5F9] ${v.resumen.obligaciones === null ? "text-gray-400" : ""}`}
              title="Campo «descuentos otros» de GEMA">
              <td className="py-1 text-gray-700">Pago obligaciones{v.resumen.obligacionesParciales ? " (incompleto)" : ""}</td>
              <td className="py-1 text-right text-gray-900">{v.resumen.obligaciones === null ? "sin dato" : pesos(v.resumen.obligaciones)}</td>
            </tr>
          </tbody>
        </table>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <Caja titulo="Base liquidación" valor={pesos(v.resumen.base)} />
          <Caja titulo="Total deducciones" valor={pesos(v.resumen.totalDeducciones)} nota={notaDeducciones(v.resumen)} />
          <Caja
            titulo={etiquetaNeto(v.resumen)}
            valor={pesos(valorNeto(v.resumen))}
            nota={v.resumen.producidoNeto === null
              ? "Producido neto = este valor − pago de obligaciones"
              : `Líquido de GEMA ${pesos(v.resumen.liquido)} − obligaciones ${pesos(v.resumen.obligaciones ?? 0)}`}
            destacado
            negativo={valorNeto(v.resumen) < 0}
          />
          <DetalleDescuentos v={v} />
        </div>
      </div>
      {children}
    </section>
  );
}

/** Recuadro "Detalle descuentos otros" del GAF-R-12: el pago de obligaciones por fecha. */
function DetalleDescuentos({ v }: { v: VehiculoLiquidado }) {
  const dias = detalleObligaciones(v.filas);
  if (!dias.length) return null;
  return (
    <div className="rounded-lg border border-[#E2E8F0] p-3 text-sm sm:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Detalle descuentos otros</p>
      <table className="mt-1 w-full">
        <tbody>
          {dias.map((d) => (
            <tr key={d.fecha} className="border-b border-[#F1F5F9] last:border-0">
              <td className="py-1 text-gray-700">{d.fecha}</td>
              <td className="py-1 text-right text-gray-900">{pesos(d.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-gray-500">GEMA entrega el total por día; el concepto de cada factura no llega a Gestivo.</p>
    </div>
  );
}

function Caja({ titulo, valor, nota, destacado, negativo }: { titulo: string; valor: string; nota?: string; destacado?: boolean; negativo?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${destacado ? "border-[#C7D2FE] bg-[#EEF2FF] sm:col-span-2" : "border-[#E2E8F0]"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className={`mt-1 text-xl font-semibold ${negativo ? "text-[#B91C1C]" : destacado ? "text-[#3730A3]" : "text-gray-900"}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-gray-500">{nota}</p>}
    </div>
  );
}
