"use client";

import { useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import "leaflet/dist/leaflet.css";
import { distanciaM, type Coord, type ParadaKml } from "@/lib/operativo/rutas-kml-reglas";
import { rumbo } from "@/lib/operativo/rutas-gps-reglas";

export interface CapaRuta {
  id: string;
  nombre: string;
  color: string;
  linea: Coord[];
  paradas: ParadaKml[];
  /** Línea punteada (versión anterior o vista previa). */
  punteada?: boolean;
  /** Más gruesa y encima de las demás. */
  destacada?: boolean;
}

/** Bus en vivo sobre el mapa. */
export interface MarcadorBus {
  codigo: string;
  lat: number;
  lon: number;
  color: string;
  /** Rumbo en grados para la flecha (null si está detenido o no se sabe). */
  rumbo: number | null;
  /** HTML ya escapado del globo. */
  globo: string;
  /** Resaltado (más grande y encima). */
  alerta?: boolean;
}

// Barranquilla / Soledad como vista inicial si aún no hay rutas.
const CENTRO_DEFAULT: [number, number] = [10.94, -74.8];

const ll = ([lon, lat]: Coord): [number, number] => [lat, lon];

export const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Flechas a lo largo de la línea para ver el sentido del recorrido. */
function flechas(linea: Coord[]): { pos: Coord; grados: number }[] {
  let total = 0;
  for (let i = 1; i < linea.length; i++) total += distanciaM(linea[i - 1], linea[i]);
  const cada = Math.max(300, total / 30);
  const out: { pos: Coord; grados: number }[] = [];
  let siguiente = cada / 2;
  let acum = 0;
  for (let i = 1; i < linea.length; i++) {
    const d = distanciaM(linea[i - 1], linea[i]);
    while (d > 0 && acum + d >= siguiente) {
      const t = (siguiente - acum) / d;
      const [a, b] = [linea[i - 1], linea[i]];
      out.push({ pos: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], grados: rumbo(a, b) });
      siguiente += cada;
    }
    acum += d;
  }
  return out;
}

/**
 * Mapa de rutas: cada capa es una línea con su color, flechas de sentido,
 * marca de inicio y paradas. Re-encuadra solo cuando cambia `fitKey`.
 */
export default function MapaRutas({ capas, fitKey, className = "h-[560px]", buses = [], foco = null }: {
  capas: CapaRuta[];
  fitKey: string;
  className?: string;
  buses?: MarcadorBus[];
  /** Centra el mapa en este punto cada vez que cambia `clave`. */
  foco?: { lat: number; lon: number; clave: string } | null;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const grupoRef = useRef<LType.LayerGroup | null>(null);
  const busesRef = useRef<LType.LayerGroup | null>(null);
  const focoRef = useRef<string>("");
  const lastFitRef = useRef<string>("");
  const [L, setL] = useState<typeof LType | null>(null);

  // Leaflet toca `window` al importarse: solo se carga en el navegador.
  useEffect(() => {
    let cancelado = false;
    import("leaflet").then((m) => {
      if (!cancelado) setL(m.default);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!L || !divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true }).setView(CENTRO_DEFAULT, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    grupoRef.current = L.layerGroup().addTo(map);
    busesRef.current = L.layerGroup().addTo(map);
    // Dentro de un diálogo el contenedor cambia de tamaño al abrir (animación):
    // Leaflet debe volver a medirlo o deja franjas grises.
    const obs = new ResizeObserver(() => map.invalidateSize());
    obs.observe(divRef.current);
    return () => {
      obs.disconnect();
      map.remove();
      mapRef.current = null;
      grupoRef.current = null;
      busesRef.current = null;
      lastFitRef.current = "";
      focoRef.current = "";
    };
  }, [L]);

  useEffect(() => {
    const map = mapRef.current;
    const grupo = grupoRef.current;
    if (!L || !map || !grupo) return;
    grupo.clearLayers();
    const limites = L.latLngBounds([]);
    const ordenadas = [...capas].sort((a, b) => Number(!!a.destacada) - Number(!!b.destacada));
    for (const c of ordenadas) {
      if (c.linea.length < 2) continue;
      const puntos = c.linea.map(ll);
      L.polyline(puntos, {
        color: c.color,
        weight: c.destacada ? 6 : 4,
        opacity: c.punteada ? 0.7 : 0.9,
        dashArray: c.punteada ? "8 8" : undefined,
      })
        .bindTooltip(escapar(c.nombre), { sticky: true })
        .addTo(grupo);
      for (const f of flechas(c.linea)) {
        L.marker(ll(f.pos), {
          interactive: false,
          icon: L.divIcon({
            className: "",
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            html: `<div style="transform:rotate(${f.grados}deg);color:${c.color};font-size:14px;line-height:14px;text-align:center;font-weight:900;text-shadow:0 0 2px #fff">▲</div>`,
          }),
        }).addTo(grupo);
      }
      L.circleMarker(puntos[0], { radius: 7, color: "#fff", weight: 2, fillColor: c.color, fillOpacity: 1 })
        .bindTooltip(`Inicio · ${escapar(c.nombre)}`)
        .addTo(grupo);
      for (const p of c.paradas) {
        L.circleMarker([p.lat, p.lon], { radius: 4, color: c.color, weight: 2, fillColor: "#fff", fillOpacity: 1 })
          .bindTooltip(escapar(p.nombre || "Parada"))
          .addTo(grupo);
      }
      for (const p of puntos) limites.extend(p);
    }
    if (fitKey !== lastFitRef.current && limites.isValid()) {
      map.fitBounds(limites, { padding: [24, 24] });
      lastFitRef.current = fitKey;
    }
  }, [L, capas, fitKey]);

  // Buses: capa aparte para no redibujar las rutas en cada refresco.
  useEffect(() => {
    const grupo = busesRef.current;
    if (!L || !grupo) return;
    grupo.clearLayers();
    const orden = [...buses].sort((a, b) => Number(!!a.alerta) - Number(!!b.alerta));
    for (const b of orden) {
      const t = b.alerta ? 22 : 16;
      const flecha =
        b.rumbo != null
          ? `<div style="position:absolute;inset:0;transform:rotate(${b.rumbo}deg)"><div style="position:absolute;left:50%;top:-7px;margin-left:-4px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid ${b.color}"></div></div>`
          : "";
      L.marker([b.lat, b.lon], {
        zIndexOffset: b.alerta ? 1000 : 0,
        icon: L.divIcon({
          className: "",
          iconSize: [t, t],
          iconAnchor: [t / 2, t / 2],
          html: `<div style="position:relative;width:${t}px;height:${t}px">${flecha}<div style="width:${t}px;height:${t}px;border-radius:50%;background:${b.color};border:2px solid #fff;box-shadow:0 0 0 1px ${b.color}${b.alerta ? ",0 0 8px 2px " + b.color : ""};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center">${b.alerta ? "!" : ""}</div></div>`,
        }),
      })
        .bindTooltip(`<b>${escapar(b.codigo)}</b>`, { direction: "top", offset: [0, -t / 2] })
        .bindPopup(b.globo, { maxWidth: 260 })
        .addTo(grupo);
    }
  }, [L, buses]);

  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map || !foco || foco.clave === focoRef.current) return;
    focoRef.current = foco.clave;
    map.setView([foco.lat, foco.lon], Math.max(map.getZoom(), 16));
  }, [L, foco]);

  // `relative z-0 isolate`: Leaflet pone sus capas con z-index 400–1000; sin
  // un contexto de apilamiento propio el mapa de la página tapa el diálogo
  // de carga (z-50).
  return <div ref={divRef} className={`relative z-0 isolate w-full rounded-xl border border-[#E2E8F0] ${className}`} />;
}
