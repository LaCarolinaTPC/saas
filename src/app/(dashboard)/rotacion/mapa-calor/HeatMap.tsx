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
}

export interface PvMarker {
  nombre: string;
  lat: number;
  lng: number;
  isBase: boolean;
}

interface Props {
  points: HeatPoint[];
  puntosVirtuales: PvMarker[];
  mostrarPuntos: boolean;
  /** Cambia cuando cambia el filtro servidor (ruta/fechas): re-encuadra el mapa. */
  fitKey: string;
}

// Barranquilla / Soledad como vista inicial si aún no hay datos.
const CENTRO_DEFAULT: [number, number] = [10.94, -74.8];

export default function HeatMap({ points, puntosVirtuales, mostrarPuntos, fitKey }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const heatRef = useRef<LType.HeatLayer | null>(null);
  const pvLayerRef = useRef<LType.LayerGroup | null>(null);
  const lastFitRef = useRef<string>("");
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

  // Marcadores de puntos virtuales (geocercas GEMA).
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    pvLayerRef.current?.remove();
    pvLayerRef.current = null;
    if (!mostrarPuntos) return;
    const grupo = L.layerGroup(
      puntosVirtuales.map((pv) =>
        L.circleMarker([pv.lat, pv.lng], {
          radius: 5,
          color: pv.isBase ? "#0f172a" : "#4f46e5",
          weight: 2,
          fillColor: "#ffffff",
          fillOpacity: 0.9,
        }).bindTooltip(pv.nombre, { direction: "top", offset: [0, -6] })
      )
    );
    grupo.addTo(map);
    pvLayerRef.current = grupo;
  }, [L, puntosVirtuales, mostrarPuntos]);

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
