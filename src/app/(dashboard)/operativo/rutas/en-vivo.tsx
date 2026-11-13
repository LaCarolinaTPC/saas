"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Pause, Play, RefreshCw, Search, TriangleAlert } from "lucide-react";
import {
  ETIQUETA_ESTADO, LECTURAS_CONFIRMAR_DESVIO, actualizarRachas, desvioConfirmado, type EstadoBusRuta, type Racha,
} from "@/lib/operativo/rutas-gps-reglas";
import type { BusEnRuta, FlotaEnRutas } from "@/lib/operativo/rutas-gps";
import type { GeometriaKml } from "@/lib/operativo/rutas-kml";
import { flotaEnRutas } from "./actions";
import type { CapaRuta, MarcadorBus } from "./mapa-rutas";

const MapaRutas = dynamic(() => import("./mapa-rutas"), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full animate-pulse rounded-xl bg-[#E2E8F0]" />,
});

const REFRESCO_MS = 60_000;

/** Estado que se muestra: un desvío sin confirmar es "posible desvío". */
type EstadoVista = EstadoBusRuta | "posible_desvio";

const VISTA: Record<EstadoVista, { etiqueta: string; color: string; orden: number; enMapa: boolean }> = {
  desviado: { etiqueta: "Desviado", color: "#DC2626", orden: 0, enMapa: true },
  sentido_contrario: { etiqueta: ETIQUETA_ESTADO.sentido_contrario, color: "#9333EA", orden: 1, enMapa: true },
  posible_desvio: { etiqueta: "Posible desvío", color: "#F59E0B", orden: 2, enMapa: true },
  en_ruta: { etiqueta: ETIQUETA_ESTADO.en_ruta, color: "#16A34A", orden: 3, enMapa: true },
  sin_kml: { etiqueta: ETIQUETA_ESTADO.sin_kml, color: "#0EA5E9", orden: 4, enMapa: true },
  fuera_de_viaje: { etiqueta: ETIQUETA_ESTADO.fuera_de_viaje, color: "#94A3B8", orden: 5, enMapa: true },
  sin_senal: { etiqueta: ETIQUETA_ESTADO.sin_senal, color: "#475569", orden: 6, enMapa: true },
  sin_programacion: { etiqueta: ETIQUETA_ESTADO.sin_programacion, color: "#CBD5E1", orden: 7, enMapa: false },
  sin_posicion: { etiqueta: ETIQUETA_ESTADO.sin_posicion, color: "#E2E8F0", orden: 8, enMapa: false },
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const textoEdad = (m: number | null) => (m == null ? "sin dato" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

function globo(b: BusEnRuta, e: EstadoVista, racha: Racha | undefined): string {
  const filas = [
    `<div style="font-weight:700;font-size:13px">${esc(b.codigo)}${b.placa ? ` · ${esc(b.placa)}` : ""}</div>`,
    `<div style="color:${VISTA[e].color};font-weight:600">${VISTA[e].etiqueta}</div>`,
    b.ruta ? `<div>Ruta: <b>${esc(b.ruta)}</b>${b.origenRuta === "programacion" ? " (programada)" : ""}</div>` : "",
    b.viaje != null ? `<div>Viaje ${b.viaje} · despachado ${esc(b.horaDespacho ?? "")}</div>` : "",
    b.distanciaM != null ? `<div>A <b>${b.distanciaM} m</b> de la ruta (tolerancia ${b.toleranciaM} m)</div>` : "",
    b.avanceKm != null ? `<div>Avance sobre la ruta: ${b.avanceKm} km</div>` : "",
    racha ? `<div>Lecturas fuera seguidas: ${racha.lecturas}</div>` : "",
    `<div style="color:#64748b">${b.velocidadKph ?? 0} km/h · GPS hace ${textoEdad(b.edadMin)}</div>`,
  ];
  return `<div style="font-size:12px;line-height:1.5">${filas.join("")}</div>`;
}

export function EnVivo({ geometrias, colorPorRuta }: {
  geometrias: GeometriaKml[];
  colorPorRuta: Map<string, string>;
}) {
  const [flota, setFlota] = useState<FlotaEnRutas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [rachas, setRachas] = useState<Record<string, Racha>>({});
  const [filtroEstado, setFiltroEstado] = useState<EstadoVista | "alertas" | "todos">("alertas");
  const [filtroRuta, setFiltroRuta] = useState<string>("");
  const [q, setQ] = useState("");
  const [foco, setFoco] = useState<{ lat: number; lon: number; clave: string } | null>(null);
  const enCurso = useRef(false);

  const leer = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setCargando(true);
    try {
      const r = await flotaEnRutas();
      if (!r.success || !r.data) {
        setError(r.success ? "Sin datos." : r.error);
        return;
      }
      const datos = r.data;
      setError(null);
      setFlota(datos);
      setRachas((prev) =>
        actualizarRachas(prev, datos.buses.map((b) => ({ codigo: b.codigo, estado: b.estado, fechaHora: b.fechaHora })))
      );
    } finally {
      enCurso.current = false;
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void leer();
  }, [leer]);

  useEffect(() => {
    if (pausado) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void leer();
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [pausado, leer]);

  const vista = useCallback(
    (b: BusEnRuta): EstadoVista =>
      (b.estado === "desviado" || b.estado === "sentido_contrario") && !desvioConfirmado(rachas[b.codigo])
        ? "posible_desvio"
        : b.estado,
    [rachas]
  );

  const buses = useMemo(() => flota?.buses ?? [], [flota]);
  const conteo = useMemo(() => {
    const c = {} as Record<EstadoVista, number>;
    for (const k of Object.keys(VISTA) as EstadoVista[]) c[k] = 0;
    for (const b of buses) if (!filtroRuta || b.ruta === filtroRuta) c[vista(b)] += 1;
    return c;
  }, [buses, vista, filtroRuta]);

  const rutasEnVivo = useMemo(
    () => [...new Set(buses.map((b) => b.ruta).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, "es")),
    [buses]
  );

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return buses
      .filter((b) => {
        const e = vista(b);
        if (filtroRuta && b.ruta !== filtroRuta) return false;
        if (filtroEstado === "alertas" && !["desviado", "sentido_contrario", "posible_desvio"].includes(e)) return false;
        if (filtroEstado !== "alertas" && filtroEstado !== "todos" && e !== filtroEstado) return false;
        return !texto || b.codigo.toLowerCase().includes(texto) || (b.placa ?? "").toLowerCase().includes(texto);
      })
      .sort((a, b) => VISTA[vista(a)].orden - VISTA[vista(b)].orden || (b.distanciaM ?? 0) - (a.distanciaM ?? 0));
  }, [buses, vista, filtroEstado, filtroRuta, q]);

  const capas: CapaRuta[] = useMemo(
    () =>
      geometrias
        .filter((g) => !filtroRuta || g.ruta === filtroRuta)
        .map((g) => ({
          id: `v${g.id}`,
          nombre: g.ruta,
          color: colorPorRuta.get(g.ruta) ?? "#4F46E5",
          linea: g.linea,
          paradas: [],
        })),
    [geometrias, colorPorRuta, filtroRuta]
  );

  const marcadores: MarcadorBus[] = useMemo(
    () =>
      buses
        .filter((b) => b.lat != null && b.lon != null && VISTA[vista(b)].enMapa && (!filtroRuta || b.ruta === filtroRuta))
        .map((b) => {
          const e = vista(b);
          return {
            codigo: b.codigo,
            lat: b.lat!,
            lon: b.lon!,
            color: VISTA[e].color,
            rumbo: (b.velocidadKph ?? 0) >= 5 ? b.rumbo : null,
            globo: globo(b, e, rachas[b.codigo]),
            alerta: e === "desviado" || e === "sentido_contrario",
          };
        }),
    [buses, vista, filtroRuta, rachas]
  );

  const alertas = conteo.desviado + conteo.sentido_contrario;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {flota && (
            <>
              <span>
                GPS: {flota.gps.fuente === "vivo" ? "directo de GEMA" : flota.gps.fuente === "copia" ? "copia del espejo" : "sin datos"}
              </span>
              <span>· Despacho de hace {textoEdad(flota.despacho.edadMin)}</span>
              <span>· Calculado {flota.ahora.slice(11, 16)}</span>
            </>
          )}
          {cargando && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC]"
            onClick={() => setPausado((p) => !p)}
          >
            {pausado ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {pausado ? "Reanudar" : "Pausar"} (cada {REFRESCO_MS / 1000} s)
          </button>
          <button
            type="button"
            disabled={cargando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50"
            onClick={() => void leer()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {[error, flota?.gps.error, flota?.despacho.error].filter(Boolean).map((m) => (
        <div key={m} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> <span>{m}</span>
        </div>
      ))}

      {!geometrias.length && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          Ninguna ruta tiene KML todavía: los buses se ven, pero no se puede medir el desvío hasta cargar los trazados.
        </div>
      )}

      {/* Indicadores por estado */}
      <div className="flex flex-wrap gap-2">
        <Chip activo={filtroEstado === "alertas"} color="#DC2626" etiqueta="Alertas" valor={alertas} onClick={() => setFiltroEstado("alertas")} />
        {(Object.keys(VISTA) as EstadoVista[])
          .sort((a, b) => VISTA[a].orden - VISTA[b].orden)
          .map((e) => (
            <Chip
              key={e}
              activo={filtroEstado === e}
              color={VISTA[e].color}
              etiqueta={VISTA[e].etiqueta}
              valor={conteo[e]}
              onClick={() => setFiltroEstado(e)}
            />
          ))}
        <Chip activo={filtroEstado === "todos"} color="#4F46E5" etiqueta="Todos" valor={buses.length} onClick={() => setFiltroEstado("todos")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="flex max-h-[600px] flex-col rounded-xl border border-[#E2E8F0] bg-white">
          <div className="space-y-2 border-b border-[#E2E8F0] p-3">
            <select
              className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm"
              value={filtroRuta}
              onChange={(e) => setFiltroRuta(e.target.value)}
            >
              <option value="">Todas las rutas</option>
              {rutasEnVivo.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2 h-4 w-4 text-gray-400" />
              <input
                className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 pl-8 text-sm outline-none focus:border-[#4F46E5]"
                placeholder="Bus o placa"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <ul className="flex-1 divide-y divide-[#F1F5F9] overflow-y-auto">
            {filtrados.map((b) => {
              const e = vista(b);
              return (
                <li
                  key={b.codigo}
                  className={`px-3 py-2 text-sm ${b.lat != null ? "cursor-pointer hover:bg-[#F8FAFC]" : ""}`}
                  onClick={() => b.lat != null && b.lon != null && setFoco({ lat: b.lat, lon: b.lon, clave: `${b.codigo}|${Date.now()}` })}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">
                      {b.codigo}
                      {b.placa && <span className="font-normal text-gray-500"> · {b.placa}</span>}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: VISTA[e].color }}
                    >
                      {VISTA[e].etiqueta}
                    </span>
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {b.ruta ?? "Sin ruta hoy"}
                    {b.distanciaM != null && ` · a ${b.distanciaM} m`}
                    {` · GPS ${textoEdad(b.edadMin)}`}
                  </div>
                </li>
              );
            })}
            {!filtrados.length && (
              <li className="p-4 text-center text-sm text-gray-500">
                {flota ? "Ningún bus en este filtro." : "Leyendo la flota…"}
              </li>
            )}
          </ul>
        </aside>

        <section className="space-y-1">
          <MapaRutas capas={capas} buses={marcadores} foco={foco} fitKey={`vivo|${filtroRuta}|${geometrias.length}`} className="h-[600px]" />
          <p className="text-xs text-gray-500">
            Un bus queda <b>Desviado</b> cuando está más lejos que la tolerancia de su ruta en {LECTURAS_CONFIRMAR_DESVIO} lecturas
            GPS seguidas; con una sola lectura se muestra como <b>Posible desvío</b>. Solo se juzgan buses en viaje; la ruta es
            la del despacho (reprogramada) y, si no ha salido, la programada.
          </p>
        </section>
      </div>
    </div>
  );
}

function Chip({ activo, color, etiqueta, valor, onClick }: {
  activo: boolean;
  color: string;
  etiqueta: string;
  valor: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs font-medium ${activo ? "ring-2" : "border-[#E2E8F0]"}`}
      style={activo ? { borderColor: color, boxShadow: `0 0 0 2px ${color}` } : undefined}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {etiqueta}
      <b className="text-gray-900">{valor}</b>
    </button>
  );
}
