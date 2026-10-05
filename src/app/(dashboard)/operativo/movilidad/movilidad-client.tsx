"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, Download, Info, Lightbulb, TriangleAlert, TrendingDown, TrendingUp, Users } from "lucide-react";
import {
  FECHA_RE, FRANJA_COLOR, FRANJA_LABEL, PERIODOS_RAPIDOS, TIPOS_DIA, TIPO_DIA_LABEL,
  diasPorTipo, hh, minutosTexto, perfilCsv, perfilRuta, rangoHoras, recomendaciones, rutasDe,
  type FilaMovilidad, type HoraPerfil, type PerfilRuta, type Recomendacion, type TipoDia,
} from "@/lib/operativo/movilidad-reglas";
import { sumarDias } from "@/lib/operativo/velocidad-reglas";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";
const btnCls = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium disabled:opacity-50";
const TINTA_SUAVE = "#64748b";
const REJILLA = "#e2e8f0";
const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });

type Metrica = "vuelta" | "timbradas";
const fmtEntero = (n: number) => Math.round(n).toLocaleString("es-CO");

/** Color de timbradas: más intenso cuantas más timbradas mueve la hora dentro de la ruta. */
function colorTimbradas(pos: number | null): { bg: string; fg: string } {
  if (pos == null) return { bg: "#f8fafc", fg: "#94a3b8" };
  return { bg: `hsl(217 80% ${Math.round(94 - pos * 34)}%)`, fg: pos > 0.6 ? "#ffffff" : "hsl(217 60% 25%)" };
}

/** Color del mapa de calor: verde la hora más rápida de la ruta, rojo la más lenta. */
function colorCelda(pos: number | null): { bg: string; fg: string } {
  if (pos == null) return { bg: "#f8fafc", fg: "#94a3b8" };
  const hue = Math.round(120 * (1 - pos));
  return { bg: `hsl(${hue} 70% 88%)`, fg: `hsl(${hue} 60% 25%)` };
}

export function MovilidadClient({
  hoy, desde, hasta, avisoRango, filas, rangoDatos, rutaInicial, tipoDiaInicial, error,
}: {
  hoy: string;
  desde: string;
  hasta: string;
  avisoRango: string | null;
  filas: FilaMovilidad[];
  rangoDatos: { desde: string | null; hasta: string | null };
  rutaInicial: string | null;
  tipoDiaInicial: TipoDia;
  error: string | null;
}) {
  const router = useRouter();
  const rutas = useMemo(() => rutasDe(filas), [filas]);
  const [tipoElegido, setTipoDia] = useState<TipoDia>(tipoDiaInicial);
  const [rutaElegida, setRuta] = useState<string | null>(rutaInicial);
  const [horaSel, setHoraSel] = useState<number | null>(null);
  const [metrica, setMetrica] = useState<Metrica>("vuelta");
  const detalleRef = useRef<HTMLDivElement>(null);
  // Si el tipo elegido no tuvo días en el periodo (p. ej. un domingo con
  // "Lunes a viernes"), se muestra el primero que sí tenga datos.
  const dias = useMemo(() => diasPorTipo(filas), [filas]);
  const tipoDia: TipoDia = dias[tipoElegido] > 0 ? tipoElegido : (TIPOS_DIA.find((t) => dias[t] > 0) ?? tipoElegido);
  const ruta = rutaElegida && rutas.includes(rutaElegida) ? rutaElegida : (rutas[0] ?? null);
  const hayTimbradas = useMemo(() => filas.some((f) => f.timbradas != null), [filas]);
  const [desdeEdit, setDesdeEdit] = useState(desde);
  const [hastaEdit, setHastaEdit] = useState(hasta);
  const rangoValido = FECHA_RE.test(desdeEdit) && FECHA_RE.test(hastaEdit) && desdeEdit <= hastaEdit;
  const rangoEditado = desdeEdit !== desde || hastaEdit !== hasta;

  const perfiles = useMemo(
    () => rutas.map((r) => perfilRuta(filas, r, tipoDia)).filter((p) => p.horas.length > 0),
    [rutas, filas, tipoDia]
  );
  const perfil = perfiles.find((p) => p.ruta === ruta) ?? null;
  const recs = useMemo(() => (perfil ? recomendaciones(perfil) : []), [perfil]);
  const horasMapa = useMemo(() => {
    const hs = new Set<number>();
    for (const p of perfiles) for (const h of p.horas) if (h.salidas > 0) hs.add(h.hora);
    return [...hs].sort((a, b) => a - b);
  }, [perfiles]);

  function actualizarUrl(cambios: Record<string, string | null>) {
    const sp = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(cambios)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    window.history.replaceState(null, "", `/operativo/movilidad?${sp.toString()}`);
  }
  function irAPeriodo(d: string, h: string) {
    const sp = new URLSearchParams();
    sp.set("desde", d);
    sp.set("hasta", h);
    sp.set("dia", tipoDia);
    if (ruta) sp.set("ruta", ruta);
    router.push(`/operativo/movilidad?${sp.toString()}`);
  }
  function elegirTipo(t: TipoDia) {
    setTipoDia(t);
    actualizarUrl({ dia: t });
  }
  function elegirRuta(r: string, hora: number | null = null) {
    setRuta(r);
    setHoraSel(hora);
    actualizarUrl({ ruta: r });
    // El detalle está debajo del mapa: se baja hasta él para que se vea el cambio.
    requestAnimationFrame(() => detalleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function descargarCsv() {
    if (!perfil) return;
    const blob = new Blob(["﻿" + perfilCsv(perfil, desde, hasta)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `movilidad_${perfil.ruta.replace(/[^\w]+/g, "_")}_${tipoDia}_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ayer = sumarDias(hoy, -1);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      {/* Filtros */}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div>
          <span className={labelCls}>Periodo rápido</span>
          <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
            {PERIODOS_RAPIDOS.map((p) => {
              const d = sumarDias(ayer, -(p.dias - 1));
              const activo = hasta === ayer && desde === d;
              return (
                <button
                  key={p.dias}
                  type="button"
                  onClick={() => irAPeriodo(d, ayer)}
                  className={`px-3 py-2 text-sm font-medium ${activo ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (rangoValido) irAPeriodo(desdeEdit, hastaEdit);
          }}
        >
          <label>
            <span className={labelCls}>Desde</span>
            <input type="date" className={inputCls} value={desdeEdit} min={rangoDatos.desde ?? undefined} max={hoy} onChange={(e) => setDesdeEdit(e.target.value)} />
          </label>
          <label>
            <span className={labelCls}>Hasta</span>
            <input type="date" className={inputCls} value={hastaEdit} min={rangoDatos.desde ?? undefined} max={hoy} onChange={(e) => setHastaEdit(e.target.value)} />
          </label>
          <button
            type="submit"
            disabled={!rangoValido || !rangoEditado}
            className={`${btnCls} border-[#4F46E5] bg-[#4F46E5] text-white hover:bg-[#4338CA]`}
          >
            Aplicar
          </button>
        </form>
        <div>
          <span className={labelCls}>Tipo de día</span>
          <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
            {TIPOS_DIA.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => elegirTipo(t)}
                disabled={filas.length > 0 && dias[t] === 0}
                title={dias[t] === 0 ? "No hubo días de este tipo en el periodo" : undefined}
                className={`px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${tipoDia === t ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}
              >
                {TIPO_DIA_LABEL[t]} <span className="opacity-70">· {dias[t]} d</span>
              </button>
            ))}
          </div>
        </div>
        <p className="ml-auto max-w-sm text-xs text-gray-500">
          Vuelta = de la hora de despacho a la hora de llegada, en viajes despachados con novedad NORMAL.
          Histórico disponible: {rangoDatos.desde ?? "—"} a {rangoDatos.hasta ?? "—"}.
        </p>
      </section>

      {avisoRango && <Aviso tono="alerta" texto={avisoRango} />}
      {error && (
        <Aviso
          tono="alerta"
          texto={`No se pudo calcular la movilidad: ${error}. Si la función no existe, falta aplicar la migración 20261005145417 en el SQL Editor.`}
        />
      )}
      {!error && filas.length === 0 && <Aviso tono="info" texto="No hay viajes despachados en ese periodo." />}
      {filas.length > 0 && tipoDia !== tipoElegido && (
        <Aviso
          tono="info"
          texto={`No hubo días de tipo "${TIPO_DIA_LABEL[tipoElegido]}" en el periodo: se muestra "${TIPO_DIA_LABEL[tipoDia]}".`}
        />
      )}
      {!hayTimbradas && filas.length > 0 && (
        <Aviso
          tono="info"
          texto="Las timbradas totales por hora aparecen al aplicar la migración 20261005212328 en el SQL Editor; mientras tanto se muestra la mediana de timbradas por viaje."
        />
      )}

      {perfiles.length > 0 && (
        <>
          {/* Mapa de calor de todas las rutas */}
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">
                {metrica === "vuelta" ? "Duración de la vuelta" : hayTimbradas ? "Timbradas por día" : "Timbradas por viaje"} por hora de
                salida · {TIPO_DIA_LABEL[tipoDia]}
              </h2>
              <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
                {(["vuelta", "timbradas"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetrica(m)}
                    className={`px-3 py-1.5 text-xs font-medium ${metrica === m ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}
                  >
                    {m === "vuelta" ? "Vuelta (min)" : "Timbradas"}
                  </button>
                ))}
              </div>
              <p className="w-full text-xs text-gray-500">
                {metrica === "vuelta"
                  ? `Minutos (mediana). Verde = la hora más rápida de cada ruta, rojo = la más lenta. Gris = pocos viajes con llegada (menos de ${perfiles[0]?.minViajes ?? 15} en el periodo).`
                  : hayTimbradas
                    ? "Timbradas promedio por día que mueve cada hora. Más oscuro = la hora que más pasajeros mueve en esa ruta."
                    : "Mediana de timbradas por viaje. Más oscuro = la hora con más pasajeros por viaje en esa ruta."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0.5 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-medium text-gray-600">Ruta</th>
                    {horasMapa.map((h) => (
                      <th key={h} className="px-1 py-1 text-center font-medium text-gray-500">{String(h).padStart(2, "0")}h</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perfiles.map((p) => {
                    const porHora = new Map(p.horas.map((h) => [h.hora, h]));
                    const sel = p.ruta === ruta;
                    const valorT = (h: HoraPerfil) => (hayTimbradas ? h.timbradasDia : h.pasajeros);
                    const ts = p.horas.map(valorT).filter((v): v is number => v != null);
                    const tMin = ts.length ? Math.min(...ts) : 0;
                    const tMax = ts.length ? Math.max(...ts) : 0;
                    return (
                      <tr key={p.ruta} onClick={() => elegirRuta(p.ruta)} className="cursor-pointer">
                        <td
                          className={`sticky left-0 z-10 whitespace-nowrap rounded-md px-2 py-1.5 font-medium ${sel ? "bg-[#EEF2FF] text-[#4338CA] ring-1 ring-[#4F46E5]" : "bg-white text-gray-800 hover:bg-[#F8FAFC]"}`}
                        >
                          {p.ruta}
                          <span className="ml-1 font-normal text-gray-400">· {p.dias} d</span>
                        </td>
                        {horasMapa.map((hora) => {
                          const h = porHora.get(hora);
                          const vt = h ? valorT(h) : null;
                          const c =
                            metrica === "vuelta"
                              ? colorCelda(h?.fiable ? h.posicion : null)
                              : colorTimbradas(vt == null ? null : tMax > tMin ? (vt - tMin) / (tMax - tMin) : 0.5);
                          const marcada = sel && horaSel === hora;
                          return (
                            <td
                              key={hora}
                              onClick={(e) => {
                                e.stopPropagation();
                                elegirRuta(p.ruta, hora);
                              }}
                              className={`min-w-[44px] rounded-md px-1 py-1.5 text-center font-semibold tabular-nums ${marcada ? "ring-2 ring-[#4F46E5]" : ""}`}
                              style={{ backgroundColor: c.bg, color: c.fg }}
                              title={
                                h
                                  ? `${p.ruta} · ${hh(hora)}\nVuelta: ${minutosTexto(h.mediana)} (p10 ${Math.round(h.p10 ?? 0)} – p90 ${Math.round(h.p90 ?? 0)})\nSalidas por día: ${fmt(h.salidasDia)}\nTimbradas por día: ${h.timbradasDia != null ? fmtEntero(h.timbradasDia) : "—"}\nTimbradas por viaje (mediana): ${h.pasajeros != null ? fmt(h.pasajeros) : "—"}\nViajes con llegada: ${h.conDuracion}`
                                  : "Sin salidas"
                              }
                            >
                              {metrica === "vuelta"
                                ? (h?.mediana != null ? Math.round(h.mediana) : "")
                                : (vt != null ? fmtEntero(vt) : "")}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Toque una ruta o una celda: el análisis de esa ruta aparece abajo y la hora tocada queda resaltada en la tabla.
            </p>
          </section>

          <div ref={detalleRef} className="scroll-mt-4">
            {perfil && <DetalleRuta perfil={perfil} recs={recs} onCsv={descargarCsv} horaSel={horaSel} metrica={metrica} hayTimbradas={hayTimbradas} />}
          </div>
        </>
      )}
    </div>
  );
}

function Aviso({ tono, texto }: { tono: "alerta" | "info"; texto: string }) {
  const c = tono === "alerta" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800";
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${c}`}>
      {tono === "alerta" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{texto}</span>
    </div>
  );
}

function Tarjeta({ titulo, valor, detalle, icono, color }: {
  titulo: string;
  valor: string;
  detalle?: string;
  icono: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-600" style={color ? { color } : undefined}>
        {icono}
        {titulo}
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{valor}</div>
      {detalle && <div className="mt-0.5 text-xs text-gray-500">{detalle}</div>}
    </div>
  );
}

function ChipFranja({ h }: { h: HoraPerfil }) {
  if (!h.franja) return <span className="text-xs text-gray-400">Pocos datos</span>;
  const c = FRANJA_COLOR[h.franja];
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: c.suave, color: c.texto }}>
      {FRANJA_LABEL[h.franja]}
    </span>
  );
}

function TooltipHora({ active, payload }: { active?: boolean; payload?: { payload: HoraPerfil }[] }) {
  if (!active || !payload?.length) return null;
  const h = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900">Salida {rangoHoras(h.hora, h.hora)}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-gray-700">
        <dt>Vuelta (mediana)</dt><dd className="text-right font-medium">{minutosTexto(h.mediana)}</dd>
        <dt>10% más rápido</dt><dd className="text-right">{Math.round(h.p10 ?? 0)} min</dd>
        <dt>10% más lento</dt><dd className="text-right">{Math.round(h.p90 ?? 0)} min</dd>
        <dt>Más que la mejor hora</dt><dd className="text-right">{h.extra != null ? `+${fmt(h.extra)} min` : "—"}</dd>
        <dt>Salidas por día</dt><dd className="text-right">{fmt(h.salidasDia)}</dd>
        <dt>Timbradas por día</dt><dd className="text-right">{h.timbradasDia != null ? fmtEntero(h.timbradasDia) : "—"}</dd>
        <dt>Timbradas por viaje</dt><dd className="text-right">{h.pasajeros != null ? fmt(h.pasajeros) : "—"}</dd>
      </dl>
    </div>
  );
}

function DetalleRuta({ perfil: p, recs, onCsv, horaSel, metrica, hayTimbradas }: {
  perfil: PerfilRuta;
  recs: Recomendacion[];
  onCsv: () => void;
  horaSel: number | null;
  metrica: Metrica;
  hayTimbradas: boolean;
}) {
  const verTimbradas = metrica === "timbradas";
  const datos = verTimbradas
    ? p.horas.filter((h) => (hayTimbradas ? h.timbradasDia : h.pasajeros) != null)
    : p.horas.filter((h) => h.fiable);
  const claveGrafico = verTimbradas ? (hayTimbradas ? "timbradasDia" : "pasajeros") : "mediana";
  const pctPico = p.salidasDia > 0 ? (p.salidasDiaPico / p.salidasDia) * 100 : 0;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">
          {p.ruta} <span className="font-normal text-gray-500">· {TIPO_DIA_LABEL[p.tipoDia]} · {p.dias} días con operación</span>
        </h2>
        <button type="button" onClick={onCsv} className={`${btnCls} border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]`}>
          <Download className="h-4 w-4" /> Descargar CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tarjeta
          titulo="Mejor hora para salir"
          valor={p.mejor ? hh(p.mejor.hora) : "—"}
          detalle={p.mejor ? `Vuelta de ${minutosTexto(p.mejor.mediana)}` : undefined}
          icono={<TrendingDown className="h-4 w-4" />}
          color={FRANJA_COLOR.valle.texto}
        />
        <Tarjeta
          titulo="Peor hora para salir"
          valor={p.peor ? hh(p.peor.hora) : "—"}
          detalle={p.peor ? `Vuelta de ${minutosTexto(p.peor.mediana)}` : undefined}
          icono={<TrendingUp className="h-4 w-4" />}
          color={FRANJA_COLOR.pico.texto}
        />
        <Tarjeta
          titulo="Diferencia por vuelta"
          valor={p.mejor && p.peor ? `${Math.round(p.peor.mediana! - p.mejor.mediana!)} min` : "—"}
          detalle={`Vuelta promedio del día: ${minutosTexto(p.vueltaPromedio)}`}
          icono={<Clock className="h-4 w-4" />}
        />
        <Tarjeta
          titulo="Salidas por día"
          valor={fmt(p.salidasDia)}
          detalle={`${fmt(p.salidasDiaPico)} en pico (${fmt(pctPico)}%) · ${fmt(p.salidasDiaValle)} en valle`}
          icono={<Clock className="h-4 w-4" />}
        />
        <Tarjeta
          titulo="Timbradas por día"
          valor={p.timbradasDia != null ? fmtEntero(p.timbradasDia) : "—"}
          detalle={p.timbradasDia != null && p.salidasDia > 0 ? `${fmt(p.timbradasDia / p.salidasDia)} por salida` : "Requiere la migración 20261005212328"}
          icono={<Users className="h-4 w-4" />}
        />
      </div>
      {p.horas.length > 0 && !p.horas.some((h) => h.fiable) && (
        <Aviso
          tono="info"
          texto={`Ninguna hora tiene ${p.minViajes} viajes con llegada en este periodo, así que no se clasifican en valle o pico. Amplíe el periodo para ver la mejor y la peor hora; la tabla de abajo sí muestra cada hora.`}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 lg:col-span-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {verTimbradas
              ? hayTimbradas ? "Timbradas por día según la hora de salida" : "Timbradas por viaje según la hora de salida"
              : "Duración de la vuelta según la hora de salida (min)"}
          </h3>
          <div className="mt-1 flex gap-3 text-xs text-gray-500">
            {(["valle", "normal", "pico"] as const).map((f) => (
              <span key={f} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: FRANJA_COLOR[f].fuerte }} />
                {FRANJA_LABEL[f]}
              </span>
            ))}
          </div>
          <div className="mt-2 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} stroke={REJILLA} />
                <XAxis dataKey="hora" tickFormatter={(h: number) => `${String(h).padStart(2, "0")}h`} tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} domain={[0, "auto"]} />
                <Tooltip content={<TooltipHora />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey={claveGrafico} radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {datos.map((h) => (
                    <Cell
                      key={h.hora}
                      fill={verTimbradas ? "#2a78d6" : FRANJA_COLOR[h.franja ?? "normal"].fuerte}
                      stroke={h.hora === horaSel ? "#0f172a" : undefined}
                      strokeWidth={h.hora === horaSel ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-2 lg:col-span-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Lightbulb className="h-4 w-4 text-amber-500" /> Qué dicen los datos para el despacho
          </h3>
          {recs.length === 0 && <p className="text-sm text-gray-500">No hay horas con datos suficientes para recomendar.</p>}
          {recs.map((r, i) => {
            const c =
              r.tono === "accion" ? "border-indigo-200 bg-indigo-50" : r.tono === "alerta" ? "border-amber-200 bg-amber-50" : "border-[#E2E8F0] bg-white";
            return (
              <div key={i} className={`rounded-lg border p-3 ${c}`}>
                <p className="text-sm font-semibold text-gray-900">{r.titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-700">{r.detalle}</p>
              </div>
            );
          })}
        </div>
      </div>

      {p.bloques.length > 0 && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Tiempo de vuelta sugerido por franja</h3>
          <p className="mb-3 text-xs text-gray-500">
            Horas seguidas con vueltas parecidas. &quot;Típico&quot; es la mediana; &quot;con holgura&quot; cubre 3 de cada 4 vueltas (p75).
          </p>
          <div className="flex flex-wrap gap-2">
            {p.bloques.map((b) => {
              const c = FRANJA_COLOR[b.franja];
              return (
                <div key={b.desde} className="min-w-[150px] rounded-lg border px-3 py-2" style={{ borderColor: c.fuerte, backgroundColor: c.suave }}>
                  <div className="text-xs font-medium" style={{ color: c.texto }}>
                    {rangoHoras(b.desde, b.hasta)} · {FRANJA_LABEL[b.franja]}
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-gray-900">{b.minutos} min</div>
                  <div className="text-xs text-gray-600">con holgura {b.conHolgura} min</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Hora de salida</th>
              <th className="px-3 py-2 text-left font-medium">Franja</th>
              <th className="px-3 py-2 text-right font-medium">Salidas/día</th>
              <th className="px-3 py-2 text-right font-medium">Vuelta (mediana)</th>
              <th className="px-3 py-2 text-right font-medium">Rango típico (p10–p90)</th>
              <th className="px-3 py-2 text-right font-medium">vs. mejor hora</th>
              <th className="px-3 py-2 text-right font-medium">Timbradas/día</th>
              <th className="px-3 py-2 text-right font-medium">Timbradas por viaje</th>
              <th className="px-3 py-2 text-right font-medium">Timbradas del periodo</th>
              <th className="px-3 py-2 text-right font-medium">Viajes medidos</th>
            </tr>
          </thead>
          <tbody>
            {p.horas.map((h) => (
              <tr key={h.hora} className={`border-t border-[#E2E8F0] ${h.hora === horaSel ? "bg-[#EEF2FF]" : ""}`}>
                <td className="px-3 py-2 font-medium text-gray-900">{rangoHoras(h.hora, h.hora)}</td>
                <td className="px-3 py-2"><ChipFranja h={h} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(h.salidasDia)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{h.mediana != null ? `${Math.round(h.mediana)} min` : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {h.p10 != null && h.p90 != null ? `${Math.round(h.p10)}–${Math.round(h.p90)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {h.extra == null ? "—" : h.extra === 0 ? <span className="font-semibold text-green-700">mejor</span> : `+${Math.round(h.extra)} min`}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{h.timbradasDia != null ? fmtEntero(h.timbradasDia) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{h.pasajeros != null ? fmt(h.pasajeros) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{h.timbradas != null ? fmtEntero(h.timbradas) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{h.conDuracion.toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
