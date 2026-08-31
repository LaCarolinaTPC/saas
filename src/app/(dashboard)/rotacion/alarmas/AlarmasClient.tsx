"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  TriangleAlert, Calendar, Loader2, Lock, DoorOpen, WifiOff,
  Route as RouteIcon, Truck, UserRound,
} from "lucide-react";
import type { AlarmasData, AlarmaAgregado } from "@/lib/rotacion/data/alarmas";

const nf = new Intl.NumberFormat("es-CO");

const TIPO_LABELS: Record<string, string> = {
  "BLOQUEO P1": "Bloqueo puerta 1",
  "BLOQUEO P2": "Bloqueo puerta 2",
  "BLOQUEO P3": "Bloqueo puerta 3",
  "PUERTA ABIERTA": "Puerta abierta",
  "PUERTA CERRADA": "Puerta cerrada",
  "FALLA DE COMUNICACION": "Falla de comunicación",
};

function tipoBadge(tipo: string): string {
  if (tipo.startsWith("BLOQUEO")) return "bg-rose-50 text-rose-700";
  if (tipo.startsWith("PUERTA")) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function TopLista({ titulo, icono: Icono, items, esVehiculo }: {
  titulo: string;
  icono: typeof Truck;
  items: AlarmaAgregado[];
  esVehiculo?: boolean;
}) {
  const max = items[0]?.total || 1;
  return (
    <div className="bg-surface-raised rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2 mb-4">
        <Icono className="w-4 h-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">{titulo}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-text-tertiary">Sin datos en el periodo.</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.nombre}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-text-secondary truncate mr-2">
                  {esVehiculo ? `${it.nombre}${it.placa ? ` · ${it.placa}` : ""}` : it.nombre}
                </span>
                <span className="text-text-tertiary whitespace-nowrap">
                  {nf.format(it.total)}
                  <span className="ml-1 text-[10px]">
                    ({it.bloqueos} bloq · {it.puertas} pta · {it.fallas} fallas)
                  </span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-rose-400"
                  style={{ width: `${(it.total / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AlarmasClient({ data }: { data: AlarmasData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(false);
  const [desde, setDesde] = useState(data.desde);
  const [hasta, setHasta] = useState(data.hasta);

  function navigate(params: {
    desde?: string; hasta?: string; tipo?: string | null; ruta?: string | null;
  }) {
    const sp = new URLSearchParams();
    sp.set("desde", params.desde ?? data.desde);
    sp.set("hasta", params.hasta ?? data.hasta);
    const tipo = params.tipo === undefined ? data.tipo : params.tipo;
    if (tipo) sp.set("tipo", tipo);
    const ruta = params.ruta === undefined ? data.ruta : params.ruta;
    if (ruta) sp.set("ruta", ruta);
    startTransition(() => router.push(`${pathname}?${sp}`, { scroll: false }));
  }

  function rangoRelativo(dias: number) {
    const fin = data.ultimaFechaSync ?? new Date().toISOString().slice(0, 10);
    const d = new Date(`${fin}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (dias - 1));
    navigate({ desde: d.toISOString().slice(0, 10), hasta: fin });
  }

  const bloqueos = data.porTipo.filter((t) => t.tipo.startsWith("BLOQUEO")).reduce((s, t) => s + t.total, 0);
  const puertas = data.porTipo.filter((t) => t.tipo.startsWith("PUERTA")).reduce((s, t) => s + t.total, 0);
  const fallas = data.porTipo.filter((t) => t.tipo.startsWith("FALLA")).reduce((s, t) => s + t.total, 0);
  const maxHora = Math.max(1, ...data.porHora.map((h) => h.total));
  const porHora = Array.from({ length: 24 }, (_, h) => data.porHora.find((x) => x.hora === h)?.total ?? 0);

  const chip = (activo: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
      activo ? "bg-slate-900 text-white" : "bg-slate-100 text-text-secondary hover:bg-slate-200"
    }`;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Alarmas de Registradoras
        </h1>
        <p className="text-sm text-text-tertiary mt-1">
          Bloqueos de puerta, aperturas fuera de protocolo y fallas de comunicación reportadas
          por los equipos a bordo ({data.desde} a {data.hasta})
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-surface-raised rounded-2xl border border-border p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-medium text-text-secondary">Periodo, tipo y ruta</span>
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
          <button onClick={() => navigate({ tipo: null })} className={chip(data.tipo === null)}>
            Todas
          </button>
          <button onClick={() => navigate({ tipo: "BLOQUEO" })} className={chip(data.tipo === "BLOQUEO")}>
            Bloqueos
          </button>
          <button onClick={() => navigate({ tipo: "PUERTA" })} className={chip(data.tipo === "PUERTA")}>
            Puertas
          </button>
          <button onClick={() => navigate({ tipo: "FALLA" })} className={chip(data.tipo === "FALLA")}>
            Fallas
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
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
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

      {data.total === 0 ? (
        <div className="bg-surface-raised rounded-2xl border border-border p-16 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
            <TriangleAlert className="w-7 h-7 text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Sin alarmas en este periodo</h2>
          <p className="text-sm text-text-tertiary mt-2 max-w-md mx-auto">
            Las registradoras no reportaron bloqueos, aperturas ni fallas entre {data.desde} y {data.hasta}
            con los filtros elegidos.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { icon: TriangleAlert, color: "text-slate-700 bg-slate-100", label: "Total alarmas", value: nf.format(data.total) },
              { icon: Lock, color: "text-rose-600 bg-rose-50", label: "Bloqueos de puerta", value: nf.format(bloqueos) },
              { icon: DoorOpen, color: "text-amber-600 bg-amber-50", label: "Eventos de puerta", value: nf.format(puertas) },
              { icon: WifiOff, color: "text-indigo-600 bg-indigo-50", label: "Fallas de comunicación", value: nf.format(fallas) },
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

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <TopLista titulo="Vehículos con más alarmas" icono={Truck} items={data.porVehiculo} esVehiculo />
            <TopLista titulo="Conductores con más alarmas" icono={UserRound} items={data.porConductor} />
          </div>

          {/* Distribución horaria */}
          <div className="bg-surface-raised rounded-2xl border border-border p-4 mb-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Distribución por hora</h3>
            <div className="flex items-end gap-0.5 h-24">
              {porHora.map((v, h) => (
                <div
                  key={h}
                  title={`${String(h).padStart(2, "0")}:00 — ${nf.format(v)} alarmas`}
                  className="flex-1 flex flex-col justify-end h-full"
                >
                  <div
                    style={{ height: `${Math.max(2, (v / maxHora) * 100)}%` }}
                    className="rounded-t bg-rose-400"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
            </div>
          </div>

          {/* Tabla de eventos */}
          <div className="bg-surface-raised rounded-2xl border border-border mb-8 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Eventos</h3>
              <span className="text-xs text-text-tertiary">
                {data.eventos.length < data.total
                  ? `Mostrando los ${nf.format(data.eventos.length)} más recientes de ${nf.format(data.total)}`
                  : `${nf.format(data.total)} eventos`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-text-tertiary border-b border-border">
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Hora</th>
                    <th className="px-4 py-2 font-medium">Tipo</th>
                    <th className="px-4 py-2 font-medium">Vehículo</th>
                    <th className="px-4 py-2 font-medium">Conductor</th>
                    <th className="px-4 py-2 font-medium">Ruta</th>
                    <th className="px-4 py-2 font-medium">Ubicación</th>
                  </tr>
                </thead>
                <tbody>
                  {data.eventos.map((e, i) => (
                    <tr key={i} className="border-b border-border/60 hover:bg-slate-50">
                      <td className="px-4 py-2 whitespace-nowrap text-text-secondary">{e.fecha}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-text-secondary">{e.hora}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md font-medium ${tipoBadge(e.tipo)}`}>
                          {TIPO_LABELS[e.tipo] ?? e.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-text-secondary">
                        {e.codigoVehiculo}{e.placa ? ` · ${e.placa}` : ""}
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{e.conductor ?? "—"}</td>
                      <td className="px-4 py-2 text-text-secondary">{e.ruta ?? "—"}</td>
                      <td className="px-4 py-2 text-text-tertiary">
                        {e.puntoVirtual ?? e.direccion ?? (e.lat != null ? `${e.lat}, ${e.lng}` : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
