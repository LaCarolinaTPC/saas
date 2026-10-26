"use client";

/**
 * Video de YouTube o Vimeo dentro de una diapositiva.
 *
 * Usa la API oficial de cada reproductor (se carga solo cuando hace falta y
 * una sola vez) para tres cosas: saber cuándo termina (la diapositiva puede
 * avanzar), enterarse si falla (el dueño prohibió insertarlo, lo borró…) y
 * poder activar el sonido. Arranca siempre en silencio: sin un clic en el TV
 * el navegador no deja reproducir con sonido.
 *
 * En el editor y en las miniaturas se pinta la miniatura del video: no se
 * carga ningún reproductor mientras se edita.
 */

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import type { ElementoVideoWeb } from "@/lib/pantalla/modelo";
import { NOMBRE_PROVEEDOR, miniaturaDe, urlReproductorVimeo } from "@/lib/pantalla/enlaces-video";
import { formatoDuracion } from "@/lib/pantalla/medios-reglas";
import { EVENTO_ACTIVAR_SONIDO } from "./eventos";
import { cargarVimeo, cargarYouTube, type ReproductorYouTube } from "./apis-video";

type Modo = "editor" | "miniatura" | "reproduccion" | "salida";

const COLOR_PROVEEDOR = { youtube: "#ff0000", vimeo: "#1ab7ea", mp4: "#475569" } as const;

function Miniatura({ el, modo, fallo }: { el: ElementoVideoWeb; modo: Modo; fallo: boolean }) {
  const url = miniaturaDe(el.web, el.miniatura);
  const conAdornos = modo === "editor" || modo === "miniatura";
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000", overflow: "hidden" }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      )}
      {(conAdornos || fallo) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          {fallo ? (
            <span style={{ background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 32, padding: "10px 22px", borderRadius: 10, fontFamily: "var(--font-inter), sans-serif" }}>
              Video no disponible
            </span>
          ) : (
            <div style={{ background: COLOR_PROVEEDOR[el.web.proveedor], borderRadius: 24, padding: "22px 34px", display: "flex" }}>
              <Play style={{ width: 64, height: 64, color: "#fff", fill: "#fff" }} />
            </div>
          )}
        </div>
      )}
      {conAdornos && (
        <>
          <span
            style={{
              position: "absolute",
              left: 16,
              top: 16,
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              fontSize: 26,
              padding: "4px 14px",
              borderRadius: 8,
              fontFamily: "var(--font-inter), sans-serif",
              maxWidth: "calc(100% - 32px)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {NOMBRE_PROVEEDOR[el.web.proveedor]}
            {el.titulo ? ` · ${el.titulo}` : ""}
          </span>
          <span
            style={{
              position: "absolute",
              right: 16,
              bottom: 16,
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              fontSize: 28,
              padding: "4px 14px",
              borderRadius: 8,
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            {formatoDuracion(el.duracionSeg)}
          </span>
        </>
      )}
    </div>
  );
}

function YouTube({
  el,
  bucle,
  onFin,
  onFallo,
  onSonidoBloqueado,
}: {
  el: ElementoVideoWeb & { web: { proveedor: "youtube" } };
  bucle: boolean;
  onFin?: (id: string) => void;
  onFallo: () => void;
  onSonidoBloqueado?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const contenedor = host.current;
    let vivo = true;
    let player: ReproductorYouTube | null = null;
    let revisar: number | undefined;
    const activar = () => {
      if (el.silenciado || !player) return;
      player.unMute();
      player.playVideo();
    };
    cargarYouTube()
      .then((YT) => {
        if (!vivo || !contenedor) return;
        const div = document.createElement("div");
        contenedor.appendChild(div);
        player = new YT.Player(div, {
          host: "https://www.youtube-nocookie.com",
          videoId: el.web.id,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            iv_load_policy: 3,
            disablekb: 1,
            fs: 0,
            // En YouTube, el bucle de un solo video exige repetirlo como lista.
            ...(bucle ? { loop: 1, playlist: el.web.id } : {}),
          },
          events: {
            onReady: (e) => {
              e.target.mute();
              e.target.playVideo();
              if (!el.silenciado) {
                e.target.unMute();
                // Si el navegador no deja sonar sin un clic, pausa el video: se
                // vuelve a silencio para que siga y se ofrece «Activar sonido».
                revisar = window.setTimeout(() => {
                  if (vivo && e.target.getPlayerState() !== 1) {
                    e.target.mute();
                    e.target.playVideo();
                    onSonidoBloqueado?.();
                  }
                }, 1200);
              }
            },
            onStateChange: (e) => {
              if (e.data === 0) onFin?.(el.id);
            },
            onError: () => onFallo(),
          },
        });
      })
      .catch(() => vivo && onFallo());
    window.addEventListener(EVENTO_ACTIVAR_SONIDO, activar);
    return () => {
      vivo = false;
      if (revisar) window.clearTimeout(revisar);
      window.removeEventListener(EVENTO_ACTIVAR_SONIDO, activar);
      try {
        player?.destroy();
      } catch {
        /* ya no existe */
      }
      if (contenedor) contenedor.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.web.id, bucle, el.silenciado]);
  return <div ref={host} className="pantalla-video-web" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
}

function Vimeo({
  el,
  bucle,
  onFin,
  onFallo,
  onSonidoBloqueado,
}: {
  el: ElementoVideoWeb & { web: { proveedor: "vimeo" } };
  bucle: boolean;
  onFin?: (id: string) => void;
  onFallo: () => void;
  onSonidoBloqueado?: () => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const src = urlReproductorVimeo(el.web, { bucle });
  useEffect(() => {
    let vivo = true;
    let player: import("./apis-video").ReproductorVimeo | null = null;
    const activar = () => {
      if (el.silenciado || !player) return;
      void player.setMuted(false).then(() => player?.play()).catch(() => {});
    };
    // Si la API no carga, el video igual se reproduce (autoplay en la URL);
    // solo se pierde saber cuándo termina y el temporizador de respaldo avanza.
    cargarVimeo()
      .then((V) => {
        if (!vivo || !iframe.current) return;
        player = new V.Player(iframe.current);
        player.on("ended", () => onFin?.(el.id));
        player.on("error", () => onFallo());
        if (!el.silenciado) {
          player
            .setMuted(false)
            .then(() => player?.play())
            .catch(() => {
              void player?.setMuted(true).then(() => player?.play());
              onSonidoBloqueado?.();
            });
        }
      })
      .catch(() => {});
    window.addEventListener(EVENTO_ACTIVAR_SONIDO, activar);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_ACTIVAR_SONIDO, activar);
      void player?.destroy?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, el.silenciado]);
  return (
    <iframe
      ref={iframe}
      src={src}
      title={el.titulo || "Video de Vimeo"}
      allow="autoplay; fullscreen; picture-in-picture"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, pointerEvents: "none" }}
    />
  );
}

export function VideoWeb({
  el,
  modo,
  manda,
  unica,
  onFin,
  onFallo,
  onSonidoBloqueado,
}: {
  el: ElementoVideoWeb;
  modo: Modo;
  manda: boolean;
  unica: boolean;
  onFin?: (id: string) => void;
  onFallo?: (id: string) => void;
  onSonidoBloqueado?: () => void;
}) {
  const [fallo, setFallo] = useState(false);
  if (modo !== "reproduccion" || fallo || el.web.proveedor === "mp4") {
    return <Miniatura el={el} modo={modo} fallo={fallo} />;
  }
  const bucle = unica || (el.bucle && !manda);
  const alFallar = () => {
    setFallo(true);
    onFallo?.(el.id);
  };
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000", overflow: "hidden" }}>
      {el.web.proveedor === "youtube" ? (
        <YouTube
          el={el as ElementoVideoWeb & { web: { proveedor: "youtube" } }}
          bucle={bucle}
          onFin={onFin}
          onFallo={alFallar}
          onSonidoBloqueado={onSonidoBloqueado}
        />
      ) : (
        <Vimeo
          el={el as ElementoVideoWeb & { web: { proveedor: "vimeo" } }}
          bucle={bucle}
          onFin={onFin}
          onFallo={alFallar}
          onSonidoBloqueado={onSonidoBloqueado}
        />
      )}
    </div>
  );
}
