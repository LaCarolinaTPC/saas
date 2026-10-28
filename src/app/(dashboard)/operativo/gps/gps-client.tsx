"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, MapPin, RefreshCw, Search } from "lucide-react";
import {
  ESTADO_REPORTE_LABEL, EVENTOS_KPI, estadoReporte, minutosSinReportar, por100km, resumirFlota, textoTiempo,
  type EstadoReporte, type PosicionGps,
} from "@/lib/gema/gps-reglas";
import { sumarDias } from "@/lib/operativo/velocidad-reglas";
import type { KpisGps, PosicionesFlota } from "@/lib/operativo/gps-flota";

const inputCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";
const tarjeta = "rounded-xl border border-[#E2E8F0] bg-white p-4";

const COLOR_ESTADO: Record<EstadoReporte, { punto: string; texto: string }> = {
  al_dia: { punto: "#16A34A", texto: "#166534" },
  atrasado: { punto: "#D97706", texto: "#92400E" },
  sin_reportar: { punto: "#EA580C", texto: "#9A3412" },
  caido: { punto: "#DC2626", texto: "#991B1B" },
};

const ORDEN_ESTADO: EstadoReporte[] = ["caido", "sin_reportar", "atrasado", "al_dia"];
const PERIODOS = [7, 30, 90] as const;
const n = (x: number) => x.toLocaleString("es-CO");
const n1 = (x: number | null) => (x === null ? "—" : x.toLocaleString("es-CO", { maximumFractionDigits: 1 }));

/** Hora de Colombia «AAAA-MM-DD HH:MM:SS», el mismo reloj sin zona de GEMA. */
function ahoraColombia(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")}:${v("second")}`;
}

export function GpsClient({ hoy, desde, hasta, posiciones, kpis, errorKpis }: {
  hoy: string;
  desde: string;
  hasta: string;
  posiciones: PosicionesFlota;
  kpis: KpisGps | null;
  errorKpis: string | null;
}) {
  const router = useRouter();
  const [ahora, setAhora] = useState(ahoraColombia);
  const [filtro, setFiltro] = useState<EstadoReporte | "problemas" | "todos">("problemas");
  const [q, setQ] = useState("");
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);

  // En vivo: se relee cada minuto mientras la pestaña está visible.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setAhora(ahoraColombia());
      router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);

  const resumen = useMemo(() => resumirFlota(posiciones.posiciones, ahora), [posiciones.posiciones, ahora]);
  const filas = useMemo(() => {
    const conEstado = posiciones.posiciones.map((p) => {
      const min = minutosSinReportar(p.fecha_hora, ahora);
      return { p, min, estado: estadoReporte(min) };
    });
    const busca = q.trim().toLowerCase();
    return conEstado
      .filter((f) => (filtro === "todos" ? true : filtro === "problemas" ? f.estado !== "al_dia" : f.estado === filtro))
      .filter((f) => !busca || f.p.codigo_vehiculo.toLowerCase().includes(busca) || (f.p.placa ?? "").toLowerCase().includes(busca))
      .sort((a, b) => ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado) || (b.min ?? 1e9) - (a.min ?? 1e9));
  }, [posiciones.posiciones, ahora, filtro, q]);

  const ayer = sumarDias(hoy, -1);
  const irA = (de: string, a: string) => router.push(`/operativo/gps?desde=${de}&hasta=${a}`);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      {/* ── En vivo ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">Flota en vivo</h2>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>
              {posiciones.fuente === "vivo" ? "Directo de GEMA" : posiciones.fuente === "copia" ? "Copia del espejo" : "Sin datos"}
              {posiciones.leidoAt &&
                ` · leído ${new Date(posiciones.leidoAt).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}`}
              {" "}· se actualiza cada minuto
            </span>
            <button
              type="button"
              onClick={() => { setAhora(ahoraColombia()); router.refresh(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-gray-600 hover:bg-[#F8FAFC]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </button>
          </div>
        </div>
        {posiciones.error && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {posiciones.error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Kpi titulo="Buses con GPS" valor={n(resumen.total)} />
          <Kpi titulo="En movimiento" valor={n(resumen.enMovimiento)} nota="al día y con velocidad" />
          <Kpi titulo="Detenidos" valor={n(resumen.detenidos)} nota="al día, sin velocidad" />
          {ORDEN_ESTADO.slice().reverse().map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setFiltro(filtro === e ? "problemas" : e)}
              className={`${tarjeta} text-left transition hover:bg-[#F8FAFC] ${filtro === e ? "ring-2 ring-[#4F46E5]" : ""}`}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: COLOR_ESTADO[e].texto }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_ESTADO[e].punto }} />
                {ESTADO_REPORTE_LABEL[e]}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{n(resumen.porEstado[e])}</div>
            </button>
          ))}
        </div>

        <div className={tarjeta}>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className={labelCls}>Mostrar</span>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={inputCls}>
                <option value="problemas">Los que no están al día</option>
                <option value="todos">Todos</option>
                {ORDEN_ESTADO.map((e) => <option key={e} value={e}>{ESTADO_REPORTE_LABEL[e]}</option>)}
              </select>
            </div>
            <div className="relative">
              <span className={labelCls}>Bus</span>
              <Search className="absolute bottom-2.5 left-2.5 h-4 w-4 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código o placa" className={`${inputCls} w-44 pl-8`} />
            </div>
            <span className="ml-auto text-sm text-gray-500">{filas.length} bus(es)</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr className="border-b border-[#F1F5F9]">
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Bus</th>
                  <th className="py-2 pr-3">Último reporte</th>
                  <th className="py-2 pr-3">Sin reportar</th>
                  <th className="py-2 pr-3">Modo</th>
                  <th className="py-2 pr-3 text-right">Velocidad</th>
                  <th className="py-2 pr-3">Último encendido / apagado</th>
                  <th className="py-2">Dónde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filas.map(({ p, min, estado }) => (
                  <Fila key={p.codigo_vehiculo} p={p} min={min} estado={estado} />
                ))}
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-gray-500">
                      {filtro === "problemas" ? "Todos los buses están reportando al día." : "Ningún bus con este filtro."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── KPIs del periodo ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Indicadores del periodo</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
              {PERIODOS.map((dias) => {
                const de = sumarDias(ayer, -(dias - 1));
                const activo = desde === de && hasta === ayer;
                return (
                  <button
                    key={dias}
                    type="button"
                    onClick={() => irA(de, ayer)}
                    className={`px-3 py-2 text-sm font-medium ${activo ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}
                  >
                    {dias} días
                  </button>
                );
              })}
            </div>
            <input type="date" value={d} max={h} onChange={(e) => setD(e.target.value)} className={inputCls} />
            <input type="date" value={h} min={d} max={hoy} onChange={(e) => setH(e.target.value)} className={inputCls} />
            <button
              type="button"
              onClick={() => d && h && irA(d, h)}
              className="h-9 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              Aplicar
            </button>
          </div>
        </div>
        {errorKpis || !kpis ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No se pudieron calcular los indicadores: {errorKpis ?? "sin datos"}. Revise que la migración
            20261028210048_gps_ultimas_posiciones_de_la_flota.sql esté aplicada.
          </p>
        ) : (
          <Indicadores k={kpis} />
        )}
      </section>
    </div>
  );
}

function Fila({ p, min, estado }: { p: PosicionGps; min: number | null; estado: EstadoReporte }) {
  const mapa = p.latitud != null && p.longitud != null ? `https://www.google.com/maps?q=${p.latitud},${p.longitud}` : null;
  return (
    <tr>
      <td className="py-2 pr-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: COLOR_ESTADO[estado].texto }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_ESTADO[estado].punto }} />
          {ESTADO_REPORTE_LABEL[estado].split(" (")[0]}
        </span>
      </td>
      <td className="py-2 pr-3">
        <span className="font-medium text-gray-900">{p.codigo_vehiculo}</span>
        {p.placa && <span className="ml-1.5 text-xs text-gray-500">{p.placa}</span>}
      </td>
      <td className="py-2 pr-3 tabular-nums text-gray-700">{p.fecha_hora ?? "—"}</td>
      <td className={`py-2 pr-3 tabular-nums ${estado === "al_dia" ? "text-gray-600" : "font-semibold"}`} style={estado === "al_dia" ? undefined : { color: COLOR_ESTADO[estado].texto }}>
        {textoTiempo(min)}
      </td>
      <td className="py-2 pr-3 text-gray-600">{p.evento ?? "—"}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-gray-700">{p.velocidad_kph != null ? `${n1(p.velocidad_kph)} km/h` : "—"}</td>
      <td className="py-2 pr-3 text-xs text-gray-600">
        {p.ultimo_evento_critico ? `${p.ultimo_evento_critico.toLowerCase()}${p.hora_ultimo_evento_critico ? ` · ${p.hora_ultimo_evento_critico}` : ""}` : "—"}
      </td>
      <td className="py-2 text-xs text-gray-600">
        {mapa ? (
          <a href={mapa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#4F46E5] hover:underline">
            <MapPin className="h-3.5 w-3.5" /> {p.direccion ?? "Ver en el mapa"}
          </a>
        ) : (p.direccion ?? "—")}
      </td>
    </tr>
  );
}

function Kpi({ titulo, valor, nota, alerta }: { titulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className={tarjeta}>
      <div className="text-xs font-medium text-gray-500">{titulo}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${alerta ? "text-red-600" : "text-gray-900"}`}>{valor}</div>
      {nota && <div className="mt-0.5 text-[11px] text-gray-400">{nota}</div>}
    </div>
  );
}

function Indicadores({ k }: { k: KpisGps }) {
  const ev = (cod: string) => Number(k.eventos[cod] ?? 0);
  const bruscos = ["46", "47", "48", "49"].reduce((s, c) => s + ev(c), 0);
  const kmBusDia = k.km.bus_dias ? k.km.total / k.km.bus_dias : null;
  const criticosSensor = k.sensor.filter((s) => s.critico).reduce((s, x) => s + Number(x.n), 0);
  const [hover, setHover] = useState<number | null>(null);
  const serie = k.por_dia.map((d) => ({ ...d, tasa: por100km(d.bruscos, d.km) }));
  const max = Math.max(0.1, ...serie.map((d) => d.tasa ?? 0));
  const sel = hover !== null ? serie[hover] : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi titulo="Kilómetros" valor={n(Math.round(k.km.total))} nota={`${n(k.km.buses)} buses`} />
        <Kpi titulo="Km por bus al día" valor={n1(kmBusDia)} />
        <Kpi titulo="Conducción brusca / 100 km" valor={n1(por100km(bruscos, k.km.total))} nota={`${n(bruscos)} eventos`} />
        <Kpi titulo="Frenadas bruscas / 100 km" valor={n1(por100km(ev("47"), k.km.total))} nota={`${n(ev("47"))} frenadas`} />
        <Kpi titulo="Botón de pánico" valor={n(ev("42"))} alerta={ev("42") > 0} />
        <Kpi titulo="Batería desconectada" valor={n(ev("45"))} alerta={ev("45") > 0} />
        <Kpi titulo="Sensor: eventos críticos" valor={n(criticosSensor)} nota="bloqueos P1/P2 y reset" />
        <Kpi titulo="Odómetro sospechoso" valor={n(k.km.sospechosos)} nota="bus-días fuera de los km" />
      </div>

      <div className={tarjeta}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Conducción brusca por 100 km, por día</h3>
          <span className="text-xs text-gray-500">
            {sel
              ? `${sel.fecha}: ${n1(sel.tasa)} por 100 km · ${n(sel.bruscos)} eventos · ${n(Math.round(sel.km))} km · ${n(sel.sensor_criticos)} críticos del sensor`
              : "Pase el mouse por un día para ver el detalle"}
          </span>
        </div>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-28 w-full" role="img" aria-label="Conducción brusca por 100 km por día">
          <line x1="0" y1="40" x2="100" y2="40" stroke="#E2E8F0" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          {serie.map((dia, i) => {
            const ancho = 100 / serie.length;
            const alto = ((dia.tasa ?? 0) / max) * 38;
            return (
              <g key={dia.fecha} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={i * ancho} y="0" width={ancho} height="40" fill="transparent" />
                <rect x={i * ancho + ancho * 0.15} y={40 - alto} width={ancho * 0.7} height={alto} fill="#4F46E5" opacity={hover === null || hover === i ? 1 : 0.4} />
              </g>
            );
          })}
        </svg>
        <p className="mt-1 text-xs text-gray-500">Frenadas, aceleraciones y giros bruscos dividido por los km del día (sin odómetros sospechosos).</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <TablaBuses
          titulo="Buses con más conducción brusca (por 100 km)"
          filas={k.top_bruscos}
          columnas={[
            { t: "Por 100 km", v: (b) => n1(b.bruscos_100km) },
            { t: "Eventos", v: (b) => n(b.bruscos) },
            { t: "Km", v: (b) => n(Math.round(b.km)) },
          ]}
        />
        <TablaBuses
          titulo="Buses con más eventos críticos del sensor"
          filas={k.top_sensor}
          columnas={[
            { t: "Críticos", v: (b) => n(b.sensor_criticos) },
            { t: "Por 100 km", v: (b) => n1(por100km(b.sensor_criticos, b.km)) },
            { t: "Km", v: (b) => n(Math.round(b.km)) },
          ]}
        />
        <div className={tarjeta}>
          <h3 className="text-sm font-semibold text-gray-800">Eventos del periodo</h3>
          <ul className="mt-2 divide-y divide-[#F1F5F9] text-sm">
            {Object.entries(EVENTOS_KPI).map(([cod, e]) => (
              <li key={cod} className="flex justify-between py-1.5">
                <span className="text-gray-700">{e.label}</span>
                <span className="tabular-nums text-gray-900">{n(ev(cod))}</span>
              </li>
            ))}
          </ul>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Sensor de pasajeros</h4>
          <ul className="mt-1 divide-y divide-[#F1F5F9] text-sm">
            {k.sensor.slice(0, 10).map((s) => (
              <li key={s.evento} className="flex justify-between py-1.5">
                <span className={s.critico ? "font-medium text-red-700" : "text-gray-700"}>
                  {s.evento.toLowerCase()}
                  {s.critico ? " · crítico" : ""}
                </span>
                <span className="tabular-nums text-gray-900">{n(Number(s.n))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function TablaBuses({ titulo, filas, columnas }: {
  titulo: string;
  filas: KpisGps["top_bruscos"];
  columnas: { t: string; v: (b: KpisGps["top_bruscos"][number]) => string }[];
}) {
  return (
    <div className={tarjeta}>
      <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
      <p className="text-[11px] text-gray-400">Solo buses con 100 km o más en el periodo.</p>
      {filas.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Sin datos en el periodo.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="py-1.5 pr-2">Bus</th>
              {columnas.map((c) => <th key={c.t} className="py-1.5 pr-2 text-right">{c.t}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {filas.map((b) => (
              <tr key={b.codigo_vehiculo}>
                <td className="py-1.5 pr-2 font-medium text-gray-900">{b.codigo_vehiculo}</td>
                {columnas.map((c) => <td key={c.t} className="py-1.5 pr-2 text-right tabular-nums text-gray-700">{c.v(b)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
