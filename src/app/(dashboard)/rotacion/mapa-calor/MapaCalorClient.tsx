"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Flame, Calendar, Loader2, ArrowUpFromDot, ArrowDownToDot,
  Clock, MapPin, Route as RouteIcon, Bus, Ticket, TriangleAlert,
} from "lucide-react";
import type { MapaCalorData } from "@/lib/rotacion/data/mapa-calor";
import type { HeatPoint } from "./HeatMap";

// Leaflet solo funciona en el navegador.
const HeatMap = dynamic(() => import("./HeatMap"), { ssr: false });

type Tipo = "suben" | "bajan" | "ambos";

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const nf = new Intl.NumberFormat("es-CO");

function valor(v: { suben: number; bajan: number }, tipo: Tipo): number {
  if (tipo === "suben") return v.suben;
  if (tipo === "bajan") return v.bajan;
  return v.suben + v.bajan;
}

export default function MapaCalorClient({ data }: { data: MapaCalorData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [tipo, setTipo] = useState<Tipo>("suben");
  const [mostrarPuntos, setMostrarPuntos] = useState(true);
  // null = automático: la capa se enciende sola si el viaje elegido tuvo
  // alarmas; el usuario puede forzarla con el botón en cualquier momento.
  const [mostrarAlarmasManual, setMostrarAlarmasManual] = useState<boolean | null>(null);
  const alarmasDelViaje = data.despacho
    ? data.viajes.find((v) => v.numero === data.despacho)?.alarmas ?? 0
    : 0;
  const mostrarAlarmas = mostrarAlarmasManual ?? alarmasDelViaje > 0;
  const [showCustom, setShowCustom] = useState(false);
  const [desde, setDesde] = useState(data.desde);
  const [hasta, setHasta] = useState(data.hasta);

  function navigate(params: {
    desde?: string; hasta?: string; ruta?: string | null; punto?: string | null;
    vehiculo?: string | null; despacho?: number | null; hd?: number; hh?: number;
  }) {
    const sp = new URLSearchParams();
    sp.set("desde", params.desde ?? data.desde);
    sp.set("hasta", params.hasta ?? data.hasta);
    const ruta = params.ruta === undefined ? data.ruta : params.ruta;
    if (ruta) sp.set("ruta", ruta);
    const punto = params.punto === undefined ? data.punto : params.punto;
    if (punto) sp.set("punto", punto);
    const vehiculo = params.vehiculo === undefined ? data.vehiculo : params.vehiculo;
    if (vehiculo) sp.set("vehiculo", vehiculo);
    // El viaje se limpia al cambiar de vehículo o de periodo (es de un día).
    const despacho =
      params.despacho !== undefined
        ? params.despacho
        : params.vehiculo !== undefined || params.desde || params.hasta
          ? null
          : data.despacho;
    if (despacho) sp.set("despacho", String(despacho));
    const hd = params.hd ?? data.horaDesde;
    const hh = params.hh ?? data.horaHasta;
    if (hd !== 0) sp.set("hd", String(hd));
    if (hh !== 23) sp.set("hh", String(hh));
    // scroll:false — sin esto Next sube la página al tope en cada filtro y,
    // al hacer clic en un punto del mapa, el usuario aterriza de golpe en el
    // panel de periodo como si se hubiera abierto un filtro de fechas.
    startTransition(() => router.push(`${pathname}?${sp}`, { scroll: false }));
  }

  // El filtro viaja por cod_pv: en GEMA la mayoría de las geocercas no
  // tienen nombre (llegan como "N/A") y el nombre no las identifica.
  function togglePunto(codPv: string) {
    navigate({ punto: data.punto === codPv ? null : codPv });
  }

  const nombrePuntoActivo = data.punto
    ? data.puntosVirtuales.find((p) => p.codPv === data.punto)?.nombre ??
      data.topPv.find((t) => t.cod === data.punto)?.nombre ??
      `Punto ${data.punto}`
    : null;

  function rangoRelativo(dias: number) {
    const fin = data.ultimaFechaSync ?? new Date().toISOString().slice(0, 10);
    const d = new Date(`${fin}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (dias - 1));
    navigate({ desde: d.toISOString().slice(0, 10), hasta: fin });
  }

  function clickHora(h: number) {
    if (data.horaDesde === h && data.horaHasta === h) navigate({ hd: 0, hh: 23 });
    else navigate({ hd: h, hh: h });
  }

  // Intensidad normalizada contra el percentil 95 para que un solo
  // pico (la terminal) no apague el resto del mapa.
  const puntos = useMemo<HeatPoint[]>(() => {
    const lista = data.celdas
      .filter((c) => valor(c, tipo) > 0)
      .map((c) => ({
        lat: c.lat, lng: c.lng, peso: 0,
        suben: c.suben, bajan: c.bajan, puntoVirtual: c.puntoVirtual,
        velocidad: c.velocidad,
      }));
    const valores = lista.map((p) => valor(p, tipo)).sort((a, b) => a - b);
    const p95 = valores.length ? valores[Math.floor(valores.length * 0.95)] : 1;
    for (const p of lista) p.peso = Math.min(1, valor(p, tipo) / Math.max(1, p95));
    return lista;
  }, [data.celdas, tipo]);

  const porHora = useMemo(() => {
    const arr = HORAS.map(() => ({ suben: 0, bajan: 0 }));
    for (const h of data.porHora) arr[h.hora] = { suben: h.suben, bajan: h.bajan };
    return arr;
  }, [data.porHora]);

  const totales = useMemo(() => {
    let suben = 0;
    let bajan = 0;
    for (const c of data.celdas) {
      suben += c.suben;
      bajan += c.bajan;
    }
    const horaPico = porHora.reduce(
      (best, v, h) => (valor(v, tipo) > valor(porHora[best], tipo) ? h : best), 0
    );
    return { suben, bajan, horaPico, puntos: puntos.length };
  }, [data.celdas, porHora, puntos.length, tipo]);

  const topPuntos = useMemo(
    () => [...data.topPv].sort((a, b) => valor(b, tipo) - valor(a, tipo)).slice(0, 8),
    [data.topPv, tipo]
  );

  // Con ruta seleccionada, solo las geocercas sobre el recorrido (~150 m del
  // trazado): el filtro por actividad deja pasar geocercas de otras rutas que
  // el bus apenas cruza en una intersección.
  const puntosVirtualesRuta = useMemo(() => {
    if (!data.ruta || data.trazado.length < 2) return data.puntosVirtuales;
    const cosLat = Math.cos((data.trazado[0][0] * Math.PI) / 180);
    const UMBRAL_M = 150;
    // Grado de latitud ≈ 111.320 m; longitud se corrige por cos(lat).
    const umbralGrados2 = (UMBRAL_M / 111320) ** 2;
    return data.puntosVirtuales.filter((pv) => {
      for (const [la, ln] of data.trazado) {
        const dLat = pv.lat - la;
        const dLng = (pv.lng - ln) * cosLat;
        if (dLat * dLat + dLng * dLng <= umbralGrados2) return true;
      }
      return false;
    });
  }, [data.ruta, data.trazado, data.puntosVirtuales]);

  // Viajes con reinicio de registradora (contador que retrocede a mitad del
  // despacho): GEMA liquida final − inicial y la timbrada neta queda corta.
  const viajesConReinicio = useMemo(
    () =>
      data.viajes.filter(
        (v) => v.reinicios > 0 && (!data.despacho || v.numero === data.despacho)
      ),
    [data.viajes, data.despacho]
  );

  const maxHora = Math.max(1, ...porHora.map((v) => valor(v, tipo)));
  const sinDatos = data.celdas.length === 0;
  const franjaCompleta = data.horaDesde === 0 && data.horaHasta === 23;

  const chip = (activo: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
      activo ? "bg-slate-900 text-white" : "bg-slate-100 text-text-secondary hover:bg-slate-200"
    }`;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Mapa de Calor de Pasajeros
        </h1>
        <p className="text-sm text-text-tertiary mt-1">
          Dónde y a qué hora suben y bajan los pasajeros, según los puntos virtuales de GEMA
          ({data.desde} a {data.hasta}{data.ruta ? ` · ${data.ruta}` : " · todas las rutas"}
          {data.vehiculo ? ` · Bus ${data.vehiculo}` : ""}
          {data.despacho ? ` · viaje ${data.viajes.find((v) => v.numero === data.despacho)?.viaje ?? data.despacho}` : ""})
        </p>
        {data.punto && (
          <button
            onClick={() => navigate({ punto: null })}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            Filtrado por: {nombrePuntoActivo}
            <span className="font-bold ml-1">×</span>
          </button>
        )}
      </div>

      {/* Filtros: periodo, ruta y franja horaria (recargan del servidor) */}
      <div className="bg-surface-raised rounded-2xl border border-border p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-medium text-text-secondary">Periodo, ruta y franja</span>
          {isPending && <Loader2 className="w-3 h-3 animate-spin text-text-muted" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => rangoRelativo(1)} className={chip(data.desde === data.hasta)}>
            Último día
          </button>
          <button onClick={() => rangoRelativo(7)} className={chip(false)}>7 días</button>
          <button onClick={() => rangoRelativo(30)} className={chip(false)}>30 días</button>
          <button onClick={() => setShowCustom(!showCustom)} className={chip(showCustom)}>
            Personalizado
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <RouteIcon className="w-3.5 h-3.5 text-text-muted" />
          <select
            value={data.ruta ?? ""}
            onChange={(e) => navigate({ ruta: e.target.value || null })}
            className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white max-w-64"
          >
            <option value="">Todas las rutas</option>
            {data.rutas.map((r) => (
              <option key={r.ruta} value={r.ruta}>
                {r.ruta} ({nf.format(r.timbradas)} timbradas)
              </option>
            ))}
          </select>
          <div className="w-px h-5 bg-border mx-1" />
          <Bus className="w-3.5 h-3.5 text-text-muted" />
          <select
            value={data.vehiculo ?? ""}
            onChange={(e) => navigate({ vehiculo: e.target.value || null })}
            className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white max-w-44"
          >
            <option value="">Todos los vehículos</option>
            {data.vehiculos.map((v) => (
              <option key={v.codigo} value={v.codigo}>
                {v.codigo}{v.placa ? ` · ${v.placa}` : ""}
              </option>
            ))}
          </select>
          {data.vehiculo && data.desde === data.hasta && (
            <select
              value={data.despacho ?? ""}
              onChange={(e) => navigate({ despacho: e.target.value ? Number(e.target.value) : null })}
              className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white max-w-64"
              title="Viajes (despachos) del vehículo en el día elegido"
            >
              <option value="">Todos los viajes del día ({data.viajes.length})</option>
              {data.viajes.map((v, i) => (
                <option key={v.numero} value={v.numero}>
                  Viaje {v.viaje ?? i + 1} · {(v.horaDespacho ?? "??:??").slice(0, 5)}
                  {v.horaLlegada ? `–${v.horaLlegada.slice(0, 5)}` : ""}
                  {v.ruta ? ` · ${v.ruta}` : ""}
                  {v.sinRecaudo ? " · sin recaudo" : ""}
                  {v.reinicios > 0 ? " · 🔴 VERIFICAR TIMBRADA" : ""}
                  {v.alarmas > 0 ? ` · ⚠ ${v.alarmas} alarma${v.alarmas === 1 ? "" : "s"}` : ""}
                </option>
              ))}
            </select>
          )}
          <div className="w-px h-5 bg-border mx-1" />
          <Clock className="w-3.5 h-3.5 text-text-muted" />
          <select
            value={data.horaDesde}
            onChange={(e) => navigate({ hd: Number(e.target.value) })}
            className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white"
          >
            {HORAS.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
          <span className="text-xs text-text-muted">a</span>
          <select
            value={data.horaHasta}
            onChange={(e) => navigate({ hh: Number(e.target.value) })}
            className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white"
          >
            {HORAS.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:59</option>
            ))}
          </select>
          {!franjaCompleta && (
            <button
              onClick={() => navigate({ hd: 0, hh: 23 })}
              className="px-2 py-1.5 rounded-lg text-xs text-text-tertiary hover:bg-slate-100 cursor-pointer"
            >
              Todas las horas
            </button>
          )}
        </div>
        {showCustom && (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white"
            />
            <span className="text-xs text-text-muted">a</span>
            <input
              type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-border text-xs bg-white"
            />
            <button
              onClick={() => navigate({ desde, hasta })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {sinDatos ? (
        <div className="bg-surface-raised rounded-2xl border border-border p-16 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-6">
            <Flame className="w-7 h-7 text-orange-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Sin datos en este periodo</h2>
          <p className="text-sm text-text-tertiary mt-2 max-w-md mx-auto">
            No hay eventos de pasajeros sincronizados entre {data.desde} y {data.hasta}
            {franjaCompleta ? "" : " en la franja horaria elegida"}
            {nombrePuntoActivo ? ` dentro de ${nombrePuntoActivo}` : ""}.
            La sincronización con GEMA corre a diario; puede verse su estado en Rotación → Datos.
          </p>
          {data.punto && (
            <button
              onClick={() => navigate({ punto: null })}
              className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
            >
              Quitar filtro de punto
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Alerta: reinicio de registradora a mitad de viaje */}
          {viajesConReinicio.length > 0 && (
            <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <TriangleAlert className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-red-700">VERIFICACIÓN DE TIMBRADA</div>
                <p className="text-xs text-red-700/90 mt-0.5">
                  La registradora se reinició a mitad de{" "}
                  {viajesConReinicio.length === 1 ? "este viaje" : `${viajesConReinicio.length} viajes`}:
                </p>
                <ul className="text-xs text-red-700/90 mt-1 space-y-0.5">
                  {viajesConReinicio.map((v) => {
                    const netaReal = Math.max(0, v.timbradasGps - (v.descuentoVr ?? 0));
                    return (
                      <li key={v.numero}>
                        <b>Viaje {v.viaje ?? "?"} · {(v.horaDespacho ?? "").slice(0, 5)}</b>
                        {" — "}GEMA liquidó {nf.format(v.timbradasVr ?? 0)} netas; la
                        reconstrucción del contador da <b>≈{nf.format(netaReal)}</b>.
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-red-700/90 mt-1">
                  El KPI mantiene la cifra oficial liquidada; la reconstrucción es la
                  referencia para verificar contra la cartulina.
                </p>
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            {[
              { icon: ArrowUpFromDot, color: "text-emerald-600 bg-emerald-50", label: "Pasajeros suben", value: nf.format(totales.suben) },
              { icon: ArrowDownToDot, color: "text-rose-600 bg-rose-50", label: "Pasajeros bajan", value: nf.format(totales.bajan) },
              {
                icon: Ticket, color: "text-sky-600 bg-sky-50",
                // GEMA entrega `timbradas` ya neta (timbradas_real − descuento).
                // Es la cifra OFICIAL liquidada: no se corrige automáticamente;
                // el banner rojo muestra la reconstrucción como referencia.
                label: `Timbradas netas (${nf.format(data.timbradas.bruto)} − ${nf.format(data.timbradas.descuento)} dcto · ${nf.format(data.timbradas.viajes)} viajes)`,
                value: nf.format(data.timbradas.timbradas),
              },
              { icon: Clock, color: "text-indigo-600 bg-indigo-50", label: "Hora pico", value: `${String(totales.horaPico).padStart(2, "0")}:00` },
              { icon: MapPin, color: "text-amber-600 bg-amber-50", label: "Puntos con actividad", value: nf.format(totales.puntos) },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-surface-raised rounded-2xl border border-border p-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
                  <kpi.icon className="w-4 h-4" />
                </div>
                <div className="text-xl font-bold text-text-primary">{kpi.value}</div>
                <div className="text-xs text-text-tertiary">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Mapa */}
          <div className="bg-surface-raised rounded-2xl border border-border p-2 mb-4">
            <div className="flex flex-wrap items-center gap-1.5 p-2">
              <span className="text-xs font-medium text-text-secondary mr-1">Mostrar:</span>
              <button onClick={() => setTipo("suben")} className={chip(tipo === "suben")}>Suben</button>
              <button onClick={() => setTipo("bajan")} className={chip(tipo === "bajan")}>Bajan</button>
              <button onClick={() => setTipo("ambos")} className={chip(tipo === "ambos")}>Ambos</button>
              <div className="w-px h-5 bg-border mx-1" />
              <button onClick={() => setMostrarPuntos(!mostrarPuntos)} className={chip(mostrarPuntos)}>
                Puntos virtuales
              </button>
              <button
                onClick={() => setMostrarAlarmasManual(!mostrarAlarmas)}
                className={chip(mostrarAlarmas)}
                title="Alarmas de registradora del periodo (bloqueos, puertas, fallas)"
              >
                Alarmas ({nf.format(data.alarmas.length)})
              </button>
              {mostrarAlarmas && (
                <span className="text-[10px] text-text-tertiary flex items-center gap-2">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-1" />Bloqueo</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-amber-600 mr-1" />Puerta</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-violet-600 mr-1" />Falla</span>
                </span>
              )}
              {!franjaCompleta && (
                <span className="text-xs text-text-tertiary ml-auto">
                  Franja {String(data.horaDesde).padStart(2, "0")}:00–{String(data.horaHasta).padStart(2, "0")}:59
                </span>
              )}
            </div>
            <div className="relative">
              <HeatMap
                points={puntos}
                puntosVirtuales={puntosVirtualesRuta}
                mostrarPuntos={mostrarPuntos}
                alarmas={data.alarmas}
                mostrarAlarmas={mostrarAlarmas}
                trazado={data.trazado}
                puntoActivo={data.punto}
                fitKey={`${data.desde}|${data.hasta}|${data.ruta ?? ""}|${data.punto ?? ""}|${data.vehiculo ?? ""}|${data.despacho ?? ""}`}
              />
              {isPending && (
                <div className="absolute inset-0 z-[1000] flex items-center justify-center rounded-2xl bg-white/60">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white shadow text-xs text-text-secondary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Aplicando filtro…
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-8">
            {/* Distribución horaria */}
            <div className="bg-surface-raised rounded-2xl border border-border p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                Distribución por hora
              </h3>
              <p className="text-xs text-text-tertiary mb-4">
                Clic en una barra para ver esa hora en el mapa; clic de nuevo para volver a todas.
              </p>
              <div className="flex items-end gap-0.5 h-36">
                {HORAS.map((h) => {
                  const v = valor(porHora[h], tipo);
                  const enRango = h >= data.horaDesde && h <= data.horaHasta;
                  return (
                    <button
                      key={h}
                      onClick={() => clickHora(h)}
                      title={`${String(h).padStart(2, "0")}:00 — ${nf.format(porHora[h].suben)} suben, ${nf.format(porHora[h].bajan)} bajan`}
                      className="flex-1 flex flex-col justify-end h-full cursor-pointer group"
                    >
                      <div
                        style={{ height: `${Math.max(2, (v / maxHora) * 100)}%` }}
                        className={`rounded-t transition-colors ${
                          enRango ? "bg-orange-500 group-hover:bg-orange-600" : "bg-slate-200 group-hover:bg-slate-300"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-text-muted mt-1">
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
              </div>
            </div>

            {/* Top puntos virtuales */}
            <div className="bg-surface-raised rounded-2xl border border-border p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                Puntos con más actividad
              </h3>
              <p className="text-xs text-text-tertiary mb-4">
                Incluye ubicaciones sin geocerca en GEMA (identificadas por su dirección GPS);
                solo las que tienen geocerca permiten filtrar con clic.
              </p>
              {topPuntos.length === 0 ? (
                <p className="text-xs text-text-tertiary">
                  Sin subidas ni bajadas registradas en la franja elegida.
                </p>
              ) : (
                <div className="space-y-2">
                  {topPuntos.map((t) => {
                    const max = valor(topPuntos[0], tipo) || 1;
                    const activo = t.cod !== null && data.punto === t.cod;
                    const filtrable = t.cod !== null;
                    return (
                      <button
                        key={t.cod ?? t.nombre}
                        onClick={() => t.cod !== null && togglePunto(t.cod)}
                        title={
                          !filtrable
                            ? "Ubicación sin geocerca en GEMA (no filtrable)"
                            : activo ? "Quitar el filtro" : "Filtrar por este punto"
                        }
                        className={`block w-full text-left rounded-lg px-2 py-1 -mx-2 transition-colors ${
                          activo ? "bg-orange-50" : filtrable ? "cursor-pointer hover:bg-slate-50" : "cursor-default"
                        }`}
                      >
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className={`truncate mr-2 ${activo ? "font-semibold text-orange-700" : "text-text-secondary"}`}>
                            {t.nombre}
                          </span>
                          <span className="text-text-tertiary whitespace-nowrap">
                            {nf.format(t.suben)} ↑ · {nf.format(t.bajan)} ↓
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-orange-400"
                            style={{ width: `${(valor(t, tipo) / max) * 100}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
