"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Maximize, Volume2, X } from "lucide-react";
import { Reproductor } from "@/components/pantalla/Reproductor";
import { EVENTO_ACTIVAR_SONIDO } from "@/components/pantalla/LienzoDiapositiva";
import type { Presentacion } from "@/lib/pantalla/modelo";
import type { DatosWidgets } from "@/lib/pantalla/datos-reglas";

export function VistaPreviaClient({
  id,
  nombre,
  de,
  presentacion,
  datos,
  medios,
  diaPrueba,
  ayerReal,
}: {
  id: string;
  nombre: string;
  de: "borrador" | "publicada";
  presentacion: Presentacion;
  datos: DatosWidgets;
  medios: Record<string, string>;
  /** TEMPORAL: día elegido para probar «Accidentes de ayer» (null = el real). */
  diaPrueba: string | null;
  ayerReal: string;
}) {
  const router = useRouter();
  const [controles, setControles] = useState(true);
  const irADia = (dia: string | null) => {
    const q = new URLSearchParams({ de });
    if (dia && dia !== ayerReal) q.set("dia", dia);
    router.replace(`/pantalla/${id}/vista-previa?${q.toString()}`);
  };
  const [sonidoBloqueado, setSonidoBloqueado] = useState(false);

  useEffect(() => {
    let t: number | undefined;
    const mostrar = () => {
      setControles(true);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => setControles(false), 2500);
    };
    mostrar();
    window.addEventListener("mousemove", mostrar);
    return () => {
      window.removeEventListener("mousemove", mostrar);
      if (t) window.clearTimeout(t);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black" style={{ cursor: controles ? "default" : "none" }}>
      <Reproductor presentacion={presentacion} datos={datos} medios={medios} onSonidoBloqueado={() => setSonidoBloqueado(true)} />
      <div
        className="absolute top-0 right-0 left-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-3 text-white transition-opacity"
        style={{ opacity: controles ? 1 : 0, pointerEvents: controles ? "auto" : "none" }}
      >
        <div className="text-sm">
          <span className="font-semibold">{nombre}</span>
          <span className="ml-2 rounded bg-white/15 px-2 py-0.5 text-xs">{de === "borrador" ? "Vista previa del borrador" : "Versión publicada"}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* TEMPORAL (pruebas): elegir el día que muestra «Accidentes de ayer». Quitar junto con `?dia` en page.tsx. */}
          <label className="flex items-center gap-1.5 rounded-lg bg-amber-400/20 px-3 py-1 text-sm" title="Solo para probar: los datos se calculan como si hoy fuera el día siguiente">
            <CalendarDays className="h-4 w-4" />
            <span className="whitespace-nowrap">Accidentes del</span>
            <input
              type="date"
              className="rounded bg-white/90 px-1.5 py-0.5 text-sm text-gray-900 outline-none"
              value={diaPrueba ?? ayerReal}
              max={ayerReal}
              onChange={(e) => e.target.value && irADia(e.target.value)}
            />
            {diaPrueba && (
              <button type="button" onClick={() => irADia(null)} className="whitespace-nowrap rounded bg-white/15 px-2 py-0.5 text-xs hover:bg-white/25">
                Volver a ayer
              </button>
            )}
          </label>
          <button
            onClick={() => {
              window.dispatchEvent(new Event(EVENTO_ACTIVAR_SONIDO));
              setSonidoBloqueado(false);
              if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
              else void document.exitFullscreen?.().catch(() => {});
            }}
            className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25"
          >
            <Maximize className="h-4 w-4" /> Pantalla completa
          </button>
          <Link href={`/pantalla/${id}`} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25">
            <X className="h-4 w-4" /> Cerrar
          </Link>
        </div>
      </div>
      {sonidoBloqueado && (
        <button
          onClick={() => {
            window.dispatchEvent(new Event(EVENTO_ACTIVAR_SONIDO));
            setSonidoBloqueado(false);
          }}
          className="absolute bottom-6 left-6 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white backdrop-blur"
        >
          <Volume2 className="h-4 w-4" /> Activar sonido
        </button>
      )}
    </div>
  );
}
