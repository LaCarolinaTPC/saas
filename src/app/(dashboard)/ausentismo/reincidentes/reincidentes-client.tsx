"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Phone, Search, ShieldAlert, TriangleAlert } from "lucide-react";
import {
  CRITERIOS_REINCIDENCIA, MINIMOS_REINCIDENCIA, VENTANAS_REINCIDENCIA,
  NIVEL_ALERTA_LABEL, SOPORTE_LABEL, etiquetaVehiculo,
  type Concepto, type NivelAlerta,
} from "@/lib/ausentismo/constants";
import type { Reincidente } from "@/lib/ausentismo/data";
import { exportarReincidentes, filtrarReincidentes, type FiltrosReincidentesUI } from "@/lib/ausentismo/exportar";
import { BotonesExportar } from "../botones-exportar";

export type { FiltrosReincidentesUI };

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

const ESTILO_NIVEL: Record<NivelAlerta, { fila: string; chip: string }> = {
  critica: { fila: "bg-[#FEF2F2]", chip: "bg-[#DC2626] text-white" },
  alta: { fila: "bg-[#FFFBEB]", chip: "bg-[#F59E0B] text-white" },
};

export function ChipNivel({ nivel }: { nivel: NivelAlerta | null }) {
  if (!nivel) return <span className="text-xs text-gray-400">Sin alerta</span>;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_NIVEL[nivel].chip}`}>
      {nivel === "critica" ? <ShieldAlert className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
      {NIVEL_ALERTA_LABEL[nivel]}
    </span>
  );
}

/**
 * Reincidentes con alerta de no justificados: la regla base (N+ ausencias en
 * la ventana o soportes pendientes, sin los conceptos programados) más un
 * nivel de alerta cuando hay faltas sin justificar. La ventana, el mínimo y el
 * corte vienen del servidor; el criterio y la búsqueda se aplican aquí.
 */
export function ReincidentesClient({ hoy, filtros, reincidentes, labels, conceptos, onAplicar }: {
  hoy: string;
  filtros: FiltrosReincidentesUI;
  reincidentes: Reincidente[];
  labels: Record<string, string>;
  conceptos: Concepto[];
  onAplicar: (f: Record<string, string>) => void;
}) {
  const [f, setF] = useState(filtros);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const set = (k: keyof FiltrosReincidentesUI) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const visibles = useMemo(() => filtrarReincidentes(reincidentes, filtros), [reincidentes, filtros]);
  const resumen = useMemo(() => ({
    criticas: reincidentes.filter((r) => r.alerta === "critica").length,
    altas: reincidentes.filter((r) => r.alerta === "alta").length,
    soportes: reincidentes.filter((r) => r.soportesPendientes > 0).length,
  }), [reincidentes]);
  const noCuentan = conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.nombre.toLowerCase()).join(", ") || "ninguno";

  function alternar(cedula: string) {
    setAbiertos((p) => {
      const s = new Set(p);
      if (s.has(cedula)) s.delete(cedula); else s.add(cedula);
      return s;
    });
  }

  const campo = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm text-gray-600">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {el}
    </label>
  );

  return (
    <>
      <p className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2 text-xs text-[#92400E]">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Conductores con {filtros.minimo}+ ausencias en los {filtros.ventana} días anteriores al {filtros.corte} o con
          soportes pendientes por entregar. No cuentan los conceptos programados del catálogo ({noCuentan}). Se calcula
          del propio registro. <strong>Alerta alta</strong>: una falta no justificada o soportes pendientes.{" "}
          <strong>Alerta crítica</strong>: dos o más faltas no justificadas.
        </span>
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        {campo("Corte", <input type="date" value={f.corte} max={hoy} onChange={(e) => set("corte")(e.target.value)} className={inputCls} />)}
        {campo("Ventana", (
          <select value={f.ventana} onChange={(e) => set("ventana")(e.target.value)} className={inputCls}>
            {VENTANAS_REINCIDENCIA.map((v) => <option key={v} value={String(v)}>{v} días</option>)}
          </select>
        ))}
        {campo("Mínimo de ausencias", (
          <select value={f.minimo} onChange={(e) => set("minimo")(e.target.value)} className={inputCls}>
            {MINIMOS_REINCIDENCIA.map((m) => <option key={m} value={String(m)}>{m} o más</option>)}
          </select>
        ))}
        {campo("Criterio", (
          <select value={f.criterio} onChange={(e) => set("criterio")(e.target.value)} className={inputCls}>
            {CRITERIOS_REINCIDENCIA.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        ))}
        {campo("Conductor", (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={f.q}
              onChange={(e) => set("q")(e.target.value)}
              placeholder="Nombre, cédula o código"
              className={`${inputCls} w-52 pl-8`}
            />
          </div>
        ))}
        <button
          onClick={() => onAplicar({ tab: "reincidentes", corte: f.corte, ventana: f.ventana, minimo: f.minimo, criterio: f.criterio, q: f.q })}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
        >
          <Search className="h-4 w-4" /> Aplicar
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>{visibles.length} de {reincidentes.length} reincidente{reincidentes.length === 1 ? "" : "s"}</span>
          <button onClick={() => onAplicar({ ...filtros, tab: "reincidentes", criterio: "critica" })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${resumen.criticas > 0 ? "bg-[#DC2626] text-white" : "bg-[#F1F5F9] text-gray-500"}`}>
            {resumen.criticas} crítica{resumen.criticas === 1 ? "" : "s"}
          </button>
          <button onClick={() => onAplicar({ ...filtros, tab: "reincidentes", criterio: "alerta" })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${resumen.altas > 0 ? "bg-[#F59E0B] text-white" : "bg-[#F1F5F9] text-gray-500"}`}>
            {resumen.altas} alta{resumen.altas === 1 ? "" : "s"}
          </button>
          <button onClick={() => onAplicar({ ...filtros, tab: "reincidentes", criterio: "soportes" })} className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-gray-600">
            {resumen.soportes} con soporte pendiente
          </button>
        </div>
        <BotonesExportar
          formatos={["pdf", "xlsx", "csv"]}
          sinDatos={visibles.length === 0}
          onExportar={(formato) => exportarReincidentes({ formato, filtros, reincidentes: visibles, labels, conceptos })}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2">Alerta</th>
                <th className="px-3 py-2">Conductor</th>
                <th className="px-3 py-2">Teléfono</th>
                <th className="px-3 py-2 text-right">Ausencias ({filtros.ventana} d)</th>
                <th className="px-3 py-2 text-right">No justificadas</th>
                <th className="px-3 py-2 text-right">Soportes pendientes</th>
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2">Última</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const abierto = abiertos.has(r.cedula);
                return (
                  <Fragment key={r.cedula}>
                    <tr className={`border-b border-[#F1F5F9] ${r.alerta ? ESTILO_NIVEL[r.alerta].fila : ""}`}>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => alternar(r.cedula)}
                          aria-expanded={abierto}
                          title={abierto ? "Ocultar ausencias" : "Ver ausencias"}
                          className="rounded p-1 text-gray-500 hover:bg-white"
                        >
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2"><ChipNivel nivel={r.alerta} /></td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{r.codigo ? `${r.codigo} · ` : ""}{r.nombre}</p>
                        <p className="text-xs text-gray-500">CC {r.cedula}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {r.telefono ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {r.telefono}</span> : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{r.total}</td>
                      <td className={`px-3 py-2 text-right ${r.noJustificadas > 0 ? "font-semibold text-red-700" : ""}`}>{r.noJustificadas}</td>
                      <td className={`px-3 py-2 text-right ${r.soportesPendientes > 0 ? "font-semibold text-amber-700" : ""}`}>{r.soportesPendientes}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {Object.entries(r.tipos).map(([t, n]) => `${labels[t] ?? t}: ${n}`).join(" · ")}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.ultimaFecha}</td>
                    </tr>
                    {abierto && (
                      <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                        <td />
                        <td colSpan={8} className="px-3 py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left uppercase tracking-wide text-gray-400">
                                <th className="py-1 pr-3">Fecha</th>
                                <th className="py-1 pr-3">Concepto</th>
                                <th className="py-1 pr-3">Periodo</th>
                                <th className="py-1 pr-3">Vehículo</th>
                                <th className="py-1 pr-3">Soporte</th>
                                <th className="py-1">Justificación</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.ausencias.map((a) => (
                                <tr key={a.id} className="border-t border-[#E2E8F0] text-gray-700">
                                  <td className="py-1 pr-3 font-medium">{a.fecha}</td>
                                  <td className={`py-1 pr-3 ${a.noJustificada ? "font-semibold text-red-700" : ""}`}>{labels[a.tipo] ?? a.tipo}{a.cuenta ? "" : " (programado)"}</td>
                                  <td className="py-1 pr-3">{a.fecha_inicio ? `${a.fecha_inicio} a ${a.fecha_fin ?? "sin fin"}` : "—"}</td>
                                  <td className="py-1 pr-3">{a.codigo_vehiculo ? etiquetaVehiculo({ codigo: a.codigo_vehiculo, placa: a.placa }) : "—"}</td>
                                  <td className={`py-1 pr-3 ${a.soporte === "pendiente" ? "font-semibold text-amber-700" : ""}`}>{a.soporte === "no_aplica" ? "—" : SOPORTE_LABEL[a.soporte] ?? a.soporte}</td>
                                  <td className="py-1">{a.justificacion || "—"}</td>
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
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                    {reincidentes.length === 0
                      ? `Sin reincidentes ni soportes pendientes en los ${filtros.ventana} días anteriores al ${filtros.corte}.`
                      : "Ningún reincidente cumple el criterio o la búsqueda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
