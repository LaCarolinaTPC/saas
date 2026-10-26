"use client";

/**
 * Reproductor de una presentación a pantalla completa (TV y vista previa).
 *
 * - Letterbox: el lienzo 1920×1080 se escala para caber en el contenedor sin
 *   deformarse; lo que sobra queda en negro.
 * - Avanza por tiempo o, si la diapositiva lo pide, cuando termina su video
 *   más largo (con un temporizador de seguridad por si `ended` no llega).
 * - Transición de entrada con la saliente y la entrante montadas a la vez.
 * - Precarga los medios de la siguiente diapositiva para que no haya negro.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LIENZO,
  MARGEN_FIN_VIDEO_MS,
  TRANSICION_MS,
  claveDeRef,
  duracionEfectiva,
  videoQueManda,
  type Diapositiva,
  type Presentacion,
} from "@/lib/pantalla/modelo";
import type { DatosWidgets } from "@/lib/pantalla/datos-reglas";
import { claseFuentes } from "@/lib/pantalla/fuentes";
import { MARGEN_FIN_VIDEO_WEB_MS } from "@/lib/pantalla/enlaces-video";
import { LienzoDiapositiva } from "./LienzoDiapositiva";

/** Escala que hace caber 1920×1080 en el contenedor, recalculada al redimensionar. */
export function useEscala(ref: React.RefObject<HTMLElement | null>): number {
  const [escala, setEscala] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const { width, height } = el.getBoundingClientRect();
      setEscala(Math.max(0.01, Math.min(width / LIENZO.ancho, height / LIENZO.alto)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return escala;
}

const ANIM_TRANSICION: Record<string, [string, string] | null> = {
  ninguna: null,
  fundido: ["pantalla-fundido-entra", "pantalla-fundido-sale"],
  deslizar: ["pantalla-deslizar-entra", "pantalla-deslizar-sale"],
  zoom: ["pantalla-zoom-entra", "pantalla-zoom-sale"],
};

function Precarga({ d, medios }: { d: Diapositiva | undefined; medios: Record<string, string> }) {
  if (!d) return null;
  const imagenes: string[] = [];
  const videos: string[] = [];
  if (d.fondo.tipo === "imagen") imagenes.push(medios[claveDeRef(d.fondo.imagen)]);
  for (const e of d.elementos) {
    if (e.tipo === "imagen") imagenes.push(medios[claveDeRef(e.imagen)]);
    if (e.tipo === "video") {
      videos.push(medios[claveDeRef(e.video)]);
      if (e.poster) imagenes.push(medios[claveDeRef(e.poster)]);
    }
  }
  return (
    <div aria-hidden style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
      {imagenes.filter(Boolean).map((u) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt="" />
      ))}
      {videos.filter(Boolean).map((u) => (
        <video key={u} src={u} preload="auto" muted playsInline />
      ))}
    </div>
  );
}

export function Reproductor({
  presentacion,
  datos,
  medios,
  onAvance,
  onSonidoBloqueado,
}: {
  presentacion: Presentacion;
  datos?: DatosWidgets;
  medios: Record<string, string>;
  /** Se llama al terminar cada diapositiva: el TV aprovecha para aplicar una versión nueva. */
  onAvance?: () => void;
  onSonidoBloqueado?: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const escala = useEscala(contenedor);
  const total = presentacion.diapositivas.length;
  const [estado, setEstado] = useState({ indice: 0, saliente: null as number | null, paso: 0 });

  // Presentación nueva (otra versión publicada): empieza desde la primera.
  const [vista, setVista] = useState(presentacion);
  if (vista !== presentacion) {
    setVista(presentacion);
    setEstado((e) => ({ indice: 0, saliente: null, paso: e.paso + 1 }));
  }

  const onAvanceRef = useRef(onAvance);
  useLayoutEffect(() => {
    onAvanceRef.current = onAvance;
  }, [onAvance]);

  const avanzar = useCallback(() => {
    setEstado((e) => {
      if (total <= 1) return e;
      return { indice: (e.indice + 1) % total, saliente: e.indice, paso: e.paso + 1 };
    });
    onAvanceRef.current?.();
  }, [total]);

  const actual = presentacion.diapositivas[Math.min(estado.indice, total - 1)];
  const manda = actual ? videoQueManda(actual) : null;

  // Temporizador de la diapositiva actual.
  const temporizador = useRef<number | null>(null);
  useEffect(() => {
    if (!actual) return;
    const { seg, porVideo } = duracionEfectiva(actual);
    if (total <= 1) {
      // Una sola diapositiva: no avanza, pero sigue avisando cada ciclo para
      // que el TV pueda aplicar una versión nueva.
      const t = window.setInterval(() => onAvanceRef.current?.(), Math.max(10, seg) * 1000);
      return () => window.clearInterval(t);
    }
    // YouTube puede poner un anuncio antes: su margen de seguridad es mayor.
    const vm = videoQueManda(actual);
    const margen = vm?.tipo === "video_web" && vm.web.proveedor !== "mp4" ? MARGEN_FIN_VIDEO_WEB_MS : MARGEN_FIN_VIDEO_MS;
    const ms = porVideo ? seg * 1000 + margen : seg * 1000;
    temporizador.current = window.setTimeout(avanzar, ms);
    return () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
    };
  }, [estado.paso, actual, total, avanzar]);

  // Fin de la transición: se desmonta la saliente.
  useEffect(() => {
    if (estado.saliente == null) return;
    const t = window.setTimeout(() => setEstado((e) => ({ ...e, saliente: null })), TRANSICION_MS);
    return () => window.clearTimeout(t);
  }, [estado.saliente, estado.paso]);

  const alTerminarVideo = useCallback(
    (id: string) => {
      if (manda && id === manda.id) avanzar();
    },
    [manda, avanzar]
  );
  const alFallarVideo = useCallback(
    (id: string) => {
      if (!manda || id !== manda.id || !actual) return;
      if (temporizador.current) window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(avanzar, Math.max(actual.duracionSeg, 5) * 1000);
    },
    [manda, actual, avanzar]
  );

  if (!actual) return <div ref={contenedor} className="h-full w-full bg-black" />;

  const saliente = estado.saliente != null ? presentacion.diapositivas[estado.saliente] : null;
  const anim = saliente ? ANIM_TRANSICION[actual.transicion] : null;
  const siguiente = total > 1 ? presentacion.diapositivas[(estado.indice + 1) % total] : undefined;
  const capa = (hijos: React.ReactNode, animacion?: string, z = 1) => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: z,
        animation: animacion ? `${animacion} ${TRANSICION_MS}ms ease-in-out both` : undefined,
      }}
    >
      {hijos}
    </div>
  );

  return (
    <div ref={contenedor} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {escala > 0 && (
        <div
          className={claseFuentes}
          style={{ width: LIENZO.ancho * escala, height: LIENZO.alto * escala, position: "relative", overflow: "hidden" }}
        >
          <div style={{ width: LIENZO.ancho, height: LIENZO.alto, transform: `scale(${escala})`, transformOrigin: "top left", position: "relative" }}>
            {saliente &&
              capa(
                <LienzoDiapositiva diapositiva={saliente} datos={datos} medios={medios} modo="salida" />,
                anim?.[1],
                1
              )}
            <div key={estado.paso} style={{ position: "absolute", inset: 0, zIndex: 2 }}>
              {capa(
                <LienzoDiapositiva
                  diapositiva={actual}
                  datos={datos}
                  medios={medios}
                  modo="reproduccion"
                  videoQueManda={manda?.id ?? null}
                  unica={total <= 1}
                  onVideoFin={alTerminarVideo}
                  onVideoFallo={alFallarVideo}
                  onSonidoBloqueado={onSonidoBloqueado}
                />,
                saliente ? anim?.[0] : undefined,
                2
              )}
            </div>
          </div>
        </div>
      )}
      <Precarga d={siguiente} medios={medios} />
    </div>
  );
}
