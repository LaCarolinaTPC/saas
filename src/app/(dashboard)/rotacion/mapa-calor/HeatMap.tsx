"use client";

import { useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import "leaflet/dist/leaflet.css";

export interface HeatPoint {
  lat: number;
  lng: number;
  peso: number; // intensidad relativa 0-1
  suben: number;
  bajan: number;
  puntoVirtual: string | null;
  /** Velocidad promedio (km/h) del bus al subir/bajar pasajeros en la celda. */
  velocidad: number | null;
}

export interface PvMarker {
  codPv: string;
  nombre: string;
  lat: number;
  lng: number;
  isBase: boolean;
}

interface Props {
  points: HeatPoint[];
  puntosVirtuales: PvMarker[];
  mostrarPuntos: boolean;
  /** cod_pv del punto filtrado actualmente (se resalta en el mapa). */
  puntoActivo: string | null;
  /** Cambia cuando cambia el filtro servidor (ruta/fechas): re-encuadra el mapa. */
  fitKey: string;
}

// Barranquilla / Soledad como vista inicial si aún no hay datos.
const CENTRO_DEFAULT: [number, number] = [10.94, -74.8];

export default function HeatMap({
  points, puntosVirtuales, mostrarPuntos, puntoActivo, fitKey,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const heatRef = useRef<LType.HeatLayer | null>(null);
  const pvLayerRef = useRef<LType.LayerGroup | null>(null);
  const lastFitRef = useRef<string>("");
  // Los handlers de Leaflet se registran una sola vez: leen los puntos
  // vigentes desde el ref para no re-suscribir en cada filtro.
  const pointsRef = useRef<HeatPoint[]>(points);
  pointsRef.current = points;
  const abrirGloboRef = useRef<
    ((latlng: LType.LatLngExpression, titulo?: string) => void) | null
  >(null);
  const [L, setL] = useState<typeof LType | null>(null);

  // Leaflet toca `window` al importarse: solo se carga en el navegador.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const leaflet = (await import("leaflet")).default;
      await import("leaflet.heat");
      if (!cancelado) setL(leaflet);
    })();
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

    // Clic en cualquier zona del calor o en una geocerca: globo con las
    // subidas/bajadas de las celdas dentro del área visual (~24 px según el
    // zoom). El filtro por punto se aplica solo desde la lista del top.
    const nf = new Intl.NumberFormat("es-CO");
    abrirGloboRef.current = (latlng, titulo) => {
      const px = map.latLngToContainerPoint(latlng);
      const borde = map.containerPointToLatLng(L.point(px.x + 24, px.y));
      const radio = map.distance(latlng, borde);
      let suben = 0;
      let bajan = 0;
      let celdas = 0;
      // Velocidad promedio ponderada por pasajeros movidos en cada celda.
      let velPeso = 0;
      let velSuma = 0;
      const nombres = new Map<string, number>();
      for (const p of pointsRef.current) {
        if (map.distance(latlng, [p.lat, p.lng]) > radio) continue;
        suben += p.suben;
        bajan += p.bajan;
        celdas += 1;
        if (p.velocidad != null) {
          const mov = Math.max(1, p.suben + p.bajan);
          velSuma += p.velocidad * mov;
          velPeso += mov;
        }
        if (p.puntoVirtual) nombres.set(p.puntoVirtual, (nombres.get(p.puntoVirtual) ?? 0) + 1);
      }
      const vel = velPeso ? velSuma / velPeso : null;
      const lugar = titulo ?? [...nombres.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const html = celdas
        ? `<div style="font-size:12px;line-height:1.5">
             ${lugar ? `<div style="font-weight:600">${lugar}</div>` : ""}
             <div>⬆ Suben: <b>${nf.format(suben)}</b></div>
             <div>⬇ Bajan: <b>${nf.format(bajan)}</b></div>
             ${vel != null ? `<div>🚌 Velocidad al recoger/dejar: <b>${vel.toFixed(1)} km/h</b></div>` : ""}
             <div style="color:#94a3b8">${celdas} ${celdas === 1 ? "celda" : "celdas"} en ~${Math.round(radio)} m</div>
           </div>`
        : `<div style="font-size:12px;line-height:1.5">
             ${lugar ? `<div style="font-weight:600">${lugar}</div>` : ""}
             <div style="color:#64748b">Sin subidas ni bajadas aquí (~${Math.round(radio)} m)</div>
           </div>`;
      L.popup({ closeButton: false, maxWidth: 240 }).setLatLng(latlng).setContent(html).openOn(map);
    };
    map.on("click", (e: LType.LeafletMouseEvent) => abrirGloboRef.current?.(e.latlng));

    return () => {
      map.remove();
      mapRef.current = null;
      heatRef.current = null;
      pvLayerRef.current = null;
    };
  }, [L]);

  // Capa de calor.
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    const latlngs = points.map((p) => [p.lat, p.lng, p.peso] as [number, number, number]);
    if (heatRef.current) {
      heatRef.current.setLatLngs(latlngs);
    } else {
      heatRef.current = L.heatLayer(latlngs, {
        radius: 14,
        blur: 18,
        maxZoom: 17,
        max: 1,
        minOpacity: 0.25,
      }).addTo(map);
    }
    if (latlngs.length && lastFitRef.current !== fitKey) {
      lastFitRef.current = fitKey;
      map.fitBounds(L.latLngBounds(latlngs.map(([la, ln]) => [la, ln] as [number, number])), {
        padding: [24, 24],
        maxZoom: 15,
      });
    }
  }, [L, points, fitKey]);

  // Marcadores de puntos virtuales (geocercas GEMA): clic = globo con las
  // subidas/bajadas de la zona (el filtro se aplica desde la lista del top).
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    pvLayerRef.current?.remove();
    pvLayerRef.current = null;
    if (!mostrarPuntos) return;
    const grupo = L.layerGroup(
      puntosVirtuales.map((pv) => {
        const activo = pv.codPv === puntoActivo;
        return L.circleMarker([pv.lat, pv.lng], {
          // Sin esto, el clic en la geocerca también dispararía el clic del
          // mapa y abriría el globo de la zona encima del filtro.
          bubblingMouseEvents: false,
          radius: activo ? 8 : 5,
          color: activo ? "#ea580c" : pv.isBase ? "#0f172a" : "#4f46e5",
          weight: activo ? 3 : 2,
          fillColor: activo ? "#ffedd5" : "#ffffff",
          fillOpacity: 0.9,
        })
          .bindTooltip(pv.nombre, { direction: "top", offset: [0, -6] })
          .on("click", () => abrirGloboRef.current?.([pv.lat, pv.lng], pv.nombre));
      })
    );
    grupo.addTo(map);
    pvLayerRef.current = grupo;
  }, [L, puntosVirtuales, mostrarPuntos, puntoActivo]);

  return (
    <div className="relative">
      <div ref={divRef} className="h-[520px] w-full rounded-2xl z-0" />
      {!L && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-50 text-sm text-text-tertiary">
          Cargando mapa…
        </div>
      )}
    </div>
  );
}
