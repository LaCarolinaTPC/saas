"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, FileX2, Gavel, Phone, Search, ShieldAlert, TriangleAlert,
} from "lucide-react";
import {
  CATEGORIAS_REINCIDENCIA, CRITERIOS_REINCIDENCIA, MINIMOS_REINCIDENCIA, VENTANAS_REINCIDENCIA,
  NIVELES_ALERTA, NIVEL_ALERTA_LABEL, NIVEL_ALERTA_ACCION, NIVEL_ALERTA_COLOR, SOPORTE_LABEL,
  CONCEPTO_EPS, CONCEPTO_INCAPACIDAD, CONCEPTO_NO_JUSTIFICADA, DIAS_DESCARGOS, DIAS_TERMINACION,
  conteoPorNivel, etiquetaVehiculo,
  type Concepto, type NivelAlerta,
} from "@/lib/ausentismo/constants";
import type { Reincidente } from "@/lib/ausentismo/data";
import {
  exportarReincidentes, filtrarReincidentes, textoRacha, categoriaLabel,
  type FiltrosReincidentesUI,
} from "@/lib/ausentismo/exportar";
import { BotonesExportar } from "../botones-exportar";

export type { FiltrosReincidentesUI };

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

const ICONO_NIVEL: Record<NivelAlerta, React.ComponentType<{ className?: string }>> = {
  terminacion: FileX2,
  descargos: Gavel,
  critica: ShieldAlert,
  alta: TriangleAlert,
};

/** Chip del nivel con su color; `accion` añade debajo qué debe hacer RRHH. */
export function ChipNivel({ nivel, accion = false }: { nivel: NivelAlerta | null; accion?: boolean }) {
  if (!nivel) return <span className="text-xs text-gray-400">Sin alerta</span>;
  const Icono = ICONO_NIVEL[nivel];
  const color = NIVEL_ALERTA_COLOR[nivel];
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white"
        style={{ backgroundColor: color.fuerte }}
      >
        <Icono className="h-3 w-3" />
        {NIVEL_ALERTA_LABEL[nivel]}
      </span>
      {accion && (
        <span className="text-[11px] leading-tight" style={{ color: color.texto }}>
          {NIVEL_ALERTA_ACCION[nivel]}
        </span>
      )}
    </span>
  );
}

/**
 * Reincidentes con alerta escalonada: la regla base (N+ ausencias en la
 * ventana o soportes pendientes, sin los conceptos programados), la
 * categoría por la que se mide (todas, citas EPS, incapacidades o no
 * justificadas) y cuatro niveles de alerta por faltas sin justificar, cada
 * uno con su color: alta, crítica, citación a descargos (4 días seguidos) y
 * terminación de contrato (5 o más). La tabla se agrupa por nivel para que
 * el informe se lea por segmentos. Ventana, mínimo, categoría y corte vienen
 * del servidor; el criterio y la búsqueda se aplican aquí.
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
  const conteos = useMemo(() => conteoPorNivel(reincidentes), [reincidentes]);
  const conSoporte = useMemo(() => reincidentes.filter((r) => r.soportesPendientes > 0).length, [reincidentes]);
  const noCuentan = conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.nombre.toLowerCase()).join(", ") || "ninguno";
  const categoria = filtros.categoria;
  const queSeMide =
    categoria === CONCEPTO_EPS ? "citas médicas / EPS"
    : categoria === CONCEPTO_INCAPACIDAD ? "incapacidades"
    : categoria === CONCEPTO_NO_JUSTIFICADA ? "faltas no justificadas"
    : "ausencias";

  // Filas agrupadas por nivel, en orden de gravedad; "Sin alerta" al final.
  const grupos = useMemo(() => {
    const orden: (NivelAlerta | null)[] = [...NIVELES_ALERTA, null];
    return orden
      .map((n) => ({ nivel: n, filas: visibles.filter((r) => r.alerta === n) }))
      .filter((g) => g.filas.length > 0);
  }, [visibles]);

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

  const irCriterio = (criterio: string) => onAplicar({ ...filtros, tab: "reincidentes", criterio });
  const resaltar = (col: string) => (categoria === col ? "bg-[#EEF2FF]" : "");
  const COLS = 12;

  return (
    <>
      <div className="space-y-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E]">
        <p className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {categoria ? (
              <>Conductores con {filtros.minimo}+ {queSeMide} en los {filtros.ventana} días anteriores al {filtros.corte}.</>
            ) : (
              <>Conductores con {filtros.minimo}+ ausencias en los {filtros.ventana} días anteriores al {filtros.corte} o con soportes pendientes por entregar.</>
            )}{" "}
            Quien lleve {DIAS_DESCARGOS} o más días seguidos sin justificar entra siempre. No cuentan los conceptos
            programados del catálogo ({noCuentan}). Se calcula del propio registro.
          </span>
        </p>
        <ul className="ml-5 grid gap-1 sm:grid-cols-2">
          {NIVELES_ALERTA.map((n) => (
            <li key={n} className="flex items-center gap-2">
              <ChipNivel nivel={n} />
              <span style={{ color: NIVEL_ALERTA_COLOR[n].texto }}>{NIVEL_ALERTA_ACCION[n]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        {campo("Corte", <input type="date" value={f.corte} max={hoy} onChange={(e) => set("corte")(e.target.value)} className={inputCls} />)}
        {campo("Categoría", (
          <select value={f.categoria} onChange={(e) => set("categoria")(e.target.value)} className={inputCls}>
            {CATEGORIAS_REINCIDENCIA.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        ))}
        {campo("Ventana", (
          <select value={f.ventana} onChange={(e) => set("ventana")(e.target.value)} className={inputCls}>
            {VENTANAS_REINCIDENCIA.map((v) => <option key={v} value={String(v)}>{v} días</option>)}
          </select>
        ))}
        {campo("Mínimo", (
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
          onClick={() => onAplicar({
            tab: "reincidentes", corte: f.corte, categoria: f.categoria, ventana: f.ventana,
            minimo: f.minimo, criterio: f.criterio, q: f.q,
          })}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
        >
          <Search className="h-4 w-4" /> Aplicar
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>
            {visibles.length} de {reincidentes.length} reincidente{reincidentes.length === 1 ? "" : "s"}
            {categoria && <span className="text-gray-400"> · {categoriaLabel(categoria)}</span>}
          </span>
          {NIVELES_ALERTA.map((n) => (
            <button
              key={n}
              onClick={() => irCriterio(n)}
              title={NIVEL_ALERTA_ACCION[n]}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${conteos[n] > 0 ? "text-white" : "bg-[#F1F5F9] text-gray-500"}`}
              style={conteos[n] > 0 ? { backgroundColor: NIVEL_ALERTA_COLOR[n].fuerte } : undefined}
            >
              {conteos[n]} {NIVEL_ALERTA_LABEL[n].toLowerCase()}{conteos[n] === 1 || n === "terminacion" || n === "descargos" ? "" : "s"}
            </button>
          ))}
          <button onClick={() => irCriterio("soportes")} className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-gray-600">
            {conSoporte} con soporte pendiente
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
                <th className={`px-3 py-2 text-right ${resaltar(CONCEPTO_NO_JUSTIFICADA)}`}>No justificadas</th>
                <th className="px-3 py-2">Seguidos sin justificar</th>
                <th className={`px-3 py-2 text-right ${resaltar(CONCEPTO_EPS)}`}>Citas EPS</th>
                <th className={`px-3 py-2 text-right ${resaltar(CONCEPTO_INCAPACIDAD)}`}>Incapacidades</th>
                <th className="px-3 py-2 text-right">Soportes pendientes</th>
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2">Última</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.nivel ?? "sin"}>
                  {/* Cabecera del segmento: solo cuando hay más de un nivel en pantalla. */}
                  {grupos.length > 1 && (
                    <tr>
                      <td
                        colSpan={COLS}
                        className="border-y border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold"
                        style={{
                          backgroundColor: g.nivel ? NIVEL_ALERTA_COLOR[g.nivel].suave : "#F8FAFC",
                          color: g.nivel ? NIVEL_ALERTA_COLOR[g.nivel].texto : "#64748B",
                        }}
                      >
                        {g.nivel ? `${NIVEL_ALERTA_LABEL[g.nivel]} · ${NIVEL_ALERTA_ACCION[g.nivel]}` : "Sin alerta · todas las ausencias justificadas"}
                        {" "}({g.filas.length})
                      </td>
                    </tr>
                  )}
                  {g.filas.map((r) => {
                    const abierto = abiertos.has(r.cedula);
                    const racha = textoRacha(r);
                    return (
                      <Fragment key={r.cedula}>
                        <tr
                          className="border-b border-[#F1F5F9]"
                          style={r.alerta ? { backgroundColor: NIVEL_ALERTA_COLOR[r.alerta].suave } : undefined}
                        >
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
                          <td className="px-3 py-2"><ChipNivel nivel={r.alerta} accion={r.alerta === "descargos" || r.alerta === "terminacion"} /></td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900">{r.codigo ? `${r.codigo} · ` : ""}{r.nombre}</p>
                            <p className="text-xs text-gray-500">CC {r.cedula}</p>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {r.telefono ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {r.telefono}</span> : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">{r.total}</td>
                          <td className={`px-3 py-2 text-right ${r.noJustificadas > 0 ? "font-semibold text-red-700" : ""}`}>{r.noJustificadas}</td>
                          <td className="px-3 py-2 text-xs">
                            {racha ? (
                              <span
                                className={r.racha.dias >= DIAS_DESCARGOS ? "font-semibold" : "text-gray-600"}
                                style={r.racha.dias >= DIAS_DESCARGOS && r.alerta ? { color: NIVEL_ALERTA_COLOR[r.alerta].texto } : undefined}
                              >
                                {racha}
                                {r.racha.dias >= DIAS_TERMINACION ? " · terminación" : r.racha.dias >= DIAS_DESCARGOS ? " · descargos" : ""}
                              </span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className={`px-3 py-2 text-right ${r.eps > 0 ? "font-medium text-[#4338CA]" : "text-gray-400"}`}>{r.eps}</td>
                          <td className={`px-3 py-2 text-right ${r.incapacidades > 0 ? "font-medium text-[#DC2626]" : "text-gray-400"}`}>
                            {r.incapacidades}
                            {r.incapacidades > 0 && <span className="ml-1 text-xs font-normal text-gray-500">({r.diasIncapacidad} d)</span>}
                          </td>
                          <td className={`px-3 py-2 text-right ${r.soportesPendientes > 0 ? "font-semibold text-amber-700" : ""}`}>{r.soportesPendientes}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {Object.entries(r.tipos).map(([t, n]) => `${labels[t] ?? t}: ${n}`).join(" · ")}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{r.ultimaFecha}</td>
                        </tr>
                        {abierto && (
                          <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                            <td />
                            <td colSpan={COLS - 1} className="px-3 py-2">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left uppercase tracking-wide text-gray-400">
                                    <th className="py-1 pr-3">Fecha</th>
                                    <th className="py-1 pr-3">Concepto</th>
                                    <th className="py-1 pr-3">Periodo</th>
                                    <th className="py-1 pr-3">Incapacidad</th>
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
                                      <td className="py-1 pr-3">{a.incapacidad_inicio ? `${a.incapacidad_inicio} a ${a.incapacidad_fin ?? "sin fin"}` : "—"}</td>
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
                </Fragment>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={COLS} className="px-4 py-8 text-center text-sm text-gray-500">
                    {reincidentes.length === 0
                      ? `Sin reincidentes por ${queSeMide} en los ${filtros.ventana} días anteriores al ${filtros.corte}.`
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
