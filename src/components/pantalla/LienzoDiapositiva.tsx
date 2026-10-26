"use client";

/**
 * Renderizador ÚNICO de una diapositiva (1920×1080, en px del lienzo). Lo usan
 * el editor, las miniaturas, la vista previa y el televisor: no hay dos formas
 * de pintar lo mismo, así que lo que se ve al editar es lo que sale en el TV.
 *
 * El contenedor que lo usa se encarga de escalarlo (`transform: scale`) y de
 * poner `claseFuentes`.
 */

import { memo, useEffect, useRef, useState } from "react";
import { ImageOff, Play } from "lucide-react";
import { fontFamilyDe } from "@/lib/pantalla/fuentes-catalogo";
import {
  LIENZO,
  claveDeRef,
  type Animacion,
  type Caja,
  type Efecto,
  type Velocidad,
  type Diapositiva,
  type Elemento,
  type Fondo,
} from "@/lib/pantalla/modelo";
import type { DatosWidgets } from "@/lib/pantalla/datos-reglas";
import { formatoDuracion } from "@/lib/pantalla/medios-reglas";
import { defForma } from "@/lib/pantalla/formas";
import { FUENTE_EMOJI } from "@/lib/pantalla/emojis";
import { WidgetPantalla } from "./widgets";
import { VideoWeb } from "./VideoWeb";
import { COMPONENTE_ICONO } from "./iconos-lucide";

/**
 * "salida": la diapositiva que se va durante la transición. Se pinta quieta
 * (videos como su póster) para no volver a arrancar videos ni solapar audio.
 */
export type ModoLienzo = "editor" | "miniatura" | "reproduccion" | "salida";

import { EVENTO_ACTIVAR_SONIDO } from "./eventos";
export { EVENTO_ACTIVAR_SONIDO };

export interface PropsLienzo {
  diapositiva: Diapositiva;
  datos?: DatosWidgets;
  medios: Record<string, string>;
  modo: ModoLienzo;
  /** Reproducción: id del video que decide el fin de la diapositiva. */
  videoQueManda?: string | null;
  /** Reproducción: es la única diapositiva (los videos giran en bucle). */
  unica?: boolean;
  onVideoFin?: (id: string) => void;
  onVideoFallo?: (id: string) => void;
  onSonidoBloqueado?: () => void;
  /** Editor: reproduce la animación de este elemento («Probar»). `n` la reinicia. */
  probar?: { id: string; n: number } | null;
}

function estiloFondo(f: Fondo): React.CSSProperties {
  if (f.tipo === "color") return { background: f.color };
  if (f.tipo === "degradado") return { background: `linear-gradient(${f.angulo}deg, ${f.desde}, ${f.hasta})` };
  return { background: "#000" };
}

function ImagenFondo({ fondo, medios }: { fondo: Extract<Fondo, { tipo: "imagen" }>; medios: Record<string, string> }) {
  const url = medios[claveDeRef(fondo.imagen)];
  return (
    <>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fondo.ajuste === "cubrir" ? "cover" : "contain" }}
        />
      )}
      {fondo.oscurecer > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${fondo.oscurecer})` }} />}
    </>
  );
}

function Marcador({ texto }: { texto: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "rgba(148,163,184,0.25)",
        color: "#94a3b8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontSize: 32,
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <ImageOff style={{ width: 64, height: 64 }} />
      {texto}
    </div>
  );
}

/** Lo que necesita el reproductor de archivos: video propio o MP4 desde enlace. */
type ArchivoVideo = {
  id: string;
  ajuste: "cubrir" | "contener";
  silenciado: boolean;
  bucle: boolean;
  duracionSeg: number | null;
  /** "video/mp4" | "video/webm" (para saber si el navegador lo puede reproducir). */
  mime: string;
};

function VideoElemento({
  el,
  urlActual,
  poster,
  modo,
  manda,
  unica,
  onFin,
  onFallo,
  onSonidoBloqueado,
}: {
  el: ArchivoVideo;
  urlActual: string | undefined;
  poster: string | undefined;
  modo: ModoLienzo;
  manda: boolean;
  unica: boolean;
  onFin?: (id: string) => void;
  onFallo?: (id: string) => void;
  onSonidoBloqueado?: () => void;
}) {
  // La URL firmada se fija al montar: si el servidor la renueva mientras se
  // reproduce, el video no se reinicia. La diapositiva se vuelve a montar cada
  // vez que entra, así que siempre toma la vigente en ese momento.
  const [src, setSrc] = useState(urlActual);
  useEffect(() => {
    if (!src && urlActual) setSrc(urlActual);
  }, [src, urlActual]);
  const [fallo, setFallo] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const objectFit = el.ajuste === "cubrir" ? "cover" : "contain";

  useEffect(() => {
    if (modo !== "reproduccion") return;
    const v = ref.current;
    if (!v || !src) return;
    if (v.canPlayType(el.mime) === "") {
      setFallo(true);
      onFallo?.(el.id);
      return;
    }
    v.muted = el.silenciado;
    v.play().catch(() => {
      // Sin gesto del usuario el navegador solo deja reproducir en silencio.
      if (!el.silenciado) onSonidoBloqueado?.();
      v.muted = true;
      v.play().catch(() => {});
    });
    const activar = () => {
      if (el.silenciado) return;
      v.muted = false;
      v.play().catch(() => {});
    };
    window.addEventListener(EVENTO_ACTIVAR_SONIDO, activar);
    return () => {
      window.removeEventListener(EVENTO_ACTIVAR_SONIDO, activar);
      v.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, src, el.silenciado]);

  if (modo !== "reproduccion" || fallo || !src) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative", background: "#000" }}>
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit }} />
        ) : urlActual && !fallo ? (
          // Sin póster (MP4 desde enlace): el navegador muestra el primer fotograma, sin reproducir.
          <video src={`${urlActual}#t=0.5`} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit, display: "block" }} />
        ) : (
          <Marcador texto={fallo ? "Video no disponible" : "Video"} />
        )}
        {(modo === "editor" || modo === "miniatura") && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{ background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: 28, display: "flex" }}>
              <Play style={{ width: 72, height: 72, color: "#fff", fill: "#fff" }} />
            </div>
            <span
              style={{
                position: "absolute",
                right: 16,
                bottom: 16,
                background: "rgba(0,0,0,0.65)",
                color: "#fff",
                fontSize: 28,
                padding: "4px 14px",
                borderRadius: 8,
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              {formatoDuracion(el.duracionSeg)}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      playsInline
      autoPlay
      preload="auto"
      loop={unica || (el.bucle && !manda)}
      onEnded={() => onFin?.(el.id)}
      onError={() => {
        setFallo(true);
        onFallo?.(el.id);
      }}
      style={{ width: "100%", height: "100%", objectFit, background: "#000", display: "block" }}
    />
  );
}

/**
 * Recuadro de una imagen o un video con su marco. El marco va POR DENTRO de la
 * caja (border-box): agregarlo no cambia el tamaño ni la posición del elemento.
 */
function estiloMarco(el: { radio: number; marco: number; colorMarco: string }): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    borderRadius: el.radio,
    overflow: "hidden",
    border: el.marco > 0 ? `${el.marco}px solid ${el.colorMarco}` : undefined,
    background: el.marco > 0 ? el.colorMarco : undefined,
  };
}

/** Duración de la entrada; el efecto continuo arranca cuando termina. */
const ENTRADA_MS = 700;

/** Entrada → keyframes de globals.css («ninguna» no está). */
const ANIM_ENTRADA: Partial<Record<Animacion, { nombre: string; curva?: string }>> = {
  aparecer: { nombre: "pantalla-el-aparecer" },
  subir: { nombre: "pantalla-el-subir" },
  bajar: { nombre: "pantalla-el-bajar" },
  izquierda: { nombre: "pantalla-el-izquierda" },
  derecha: { nombre: "pantalla-el-derecha" },
  zoom: { nombre: "pantalla-el-zoom" },
  rebote: { nombre: "pantalla-el-rebote", curva: "ease-out" },
  girar: { nombre: "pantalla-el-girar" },
  desenfoque: { nombre: "pantalla-el-desenfoque", curva: "ease-out" },
  voltear: { nombre: "pantalla-el-voltear" },
};

/** Efecto continuo → keyframes y duración de un ciclo a velocidad normal. */
const EFECTO_CSS: Partial<Record<Efecto, { nombre: string; ms: number; curva: string }>> = {
  pulsar: { nombre: "pantalla-ef-pulsar", ms: 1600, curva: "ease-in-out" },
  latido: { nombre: "pantalla-ef-latido", ms: 1400, curva: "ease-in-out" },
  flotar: { nombre: "pantalla-ef-flotar", ms: 3000, curva: "ease-in-out" },
  balancear: { nombre: "pantalla-ef-balancear", ms: 2400, curva: "ease-in-out" },
  sacudir: { nombre: "pantalla-ef-sacudir", ms: 2600, curva: "ease-in-out" },
  girar: { nombre: "pantalla-ef-girar", ms: 6000, curva: "linear" },
  parpadear: { nombre: "pantalla-ef-parpadear", ms: 1400, curva: "ease-in-out" },
  brillar: { nombre: "pantalla-ef-brillar", ms: 2000, curva: "ease-in-out" },
};
const FACTOR_VELOCIDAD: Record<Velocidad, number> = { lenta: 1.6, normal: 1, rapida: 0.55 };

/** `animation` del efecto continuo, o undefined. Arranca tras la entrada y su retardo. */
export function animacionEfecto(el: Pick<Caja, "efecto" | "entrada">): string | undefined {
  const def = EFECTO_CSS[el.efecto.tipo];
  if (!def) return undefined;
  const ms = Math.round(def.ms * FACTOR_VELOCIDAD[el.efecto.velocidad]);
  const inicio = el.entrada.animacion === "ninguna" ? 0 : el.entrada.retardoMs + ENTRADA_MS;
  return `${def.nombre} ${ms}ms ${def.curva} ${inicio}ms infinite`;
}

function ContenidoElemento(props: {
  el: Elemento;
  datos?: DatosWidgets;
  medios: Record<string, string>;
  modo: ModoLienzo;
  videoQueManda?: string | null;
  unica?: boolean;
  onVideoFin?: (id: string) => void;
  onVideoFallo?: (id: string) => void;
  onSonidoBloqueado?: () => void;
}) {
  const { el, medios, modo } = props;
  switch (el.tipo) {
    case "texto":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            color: el.color,
            fontFamily: fontFamilyDe(el.fuente),
            fontSize: el.tamano,
            fontWeight: el.negrita ? 700 : 400,
            fontStyle: el.cursiva ? "italic" : "normal",
            textAlign: el.alineacion === "centro" ? "center" : el.alineacion === "derecha" ? "right" : "left",
            lineHeight: el.interlineado,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            textShadow: el.sombra ? "0 4px 18px rgba(0,0,0,0.65)" : undefined,
          }}
        >
          {el.texto}
        </div>
      );
    case "imagen": {
      const url = medios[claveDeRef(el.imagen)];
      return (
        <div style={estiloMarco(el)}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: el.ajuste === "cubrir" ? "cover" : "contain", display: "block" }}
            />
          ) : (
            <Marcador texto="Imagen no disponible" />
          )}
        </div>
      );
    }
    case "video":
      return (
        <div style={estiloMarco(el)}>
          <VideoElemento
            el={{ ...el, mime: el.video.path.endsWith(".webm") ? "video/webm" : "video/mp4" }}
            urlActual={medios[claveDeRef(el.video)]}
            poster={el.poster ? medios[claveDeRef(el.poster)] : undefined}
            modo={modo}
            manda={props.videoQueManda === el.id}
            unica={Boolean(props.unica)}
            onFin={props.onVideoFin}
            onFallo={props.onVideoFallo}
            onSonidoBloqueado={props.onSonidoBloqueado}
          />
        </div>
      );
    case "video_web":
      return (
        <div style={estiloMarco(el)}>
          {el.web.proveedor === "mp4" ? (
            // Un MP4 en otra dirección se reproduce igual que un video propio.
            <VideoElemento
              el={{ ...el, ajuste: "contener", mime: /\.webm$/i.test(new URL(el.web.url).pathname) ? "video/webm" : "video/mp4" }}
              urlActual={el.web.url}
              poster={undefined}
              modo={modo}
              manda={props.videoQueManda === el.id}
              unica={Boolean(props.unica)}
              onFin={props.onVideoFin}
              onFallo={props.onVideoFallo}
              onSonidoBloqueado={props.onSonidoBloqueado}
            />
          ) : (
            <VideoWeb
              el={el}
              modo={modo}
              manda={props.videoQueManda === el.id}
              unica={Boolean(props.unica)}
              onFin={props.onVideoFin}
              onFallo={props.onVideoFallo}
              onSonidoBloqueado={props.onSonidoBloqueado}
            />
          )}
        </div>
      );
    case "icono": {
      const Icono = COMPONENTE_ICONO[el.icono];
      const lado = Math.min(el.w, el.h);
      const conFondo = el.fondo !== "ninguno";
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            filter: el.sombra ? "drop-shadow(0 6px 14px rgba(0,0,0,0.45))" : undefined,
          }}
        >
          <div
            style={{
              width: conFondo ? lado : "100%",
              height: conFondo ? lado : "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: conFondo ? el.colorFondo : undefined,
              borderRadius: el.fondo === "circulo" ? "50%" : el.fondo === "cuadrado" ? lado * 0.18 : undefined,
            }}
          >
            {/* Con fondo, el ícono ocupa ~60 % para dejar aire, como una señal. */}
            <Icono size={lado * (conFondo ? 0.6 : 1)} strokeWidth={el.grosor} color={el.color} style={{ display: "block" }} aria-hidden />
          </div>
        </div>
      );
    }
    case "emoji":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // El emoticono llena la caja (ligeramente menos para que no se corte).
            fontSize: Math.max(8, Math.min(el.w, el.h) * 0.82),
            lineHeight: 1,
            fontFamily: FUENTE_EMOJI,
            filter: el.sombra ? "drop-shadow(0 6px 14px rgba(0,0,0,0.45))" : undefined,
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {el.emoji}
        </div>
      );
    case "forma": {
      if (el.forma === "linea") {
        return <div style={{ width: "100%", height: "100%", background: el.relleno, borderRadius: el.h / 2 }} />;
      }
      const def = defForma(el.forma);
      if (def.d) {
        return (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            style={{ display: "block", overflow: "visible" }}
            aria-hidden
          >
            <path
              d={def.d}
              fill={el.relleno}
              fillRule={def.evenodd ? "evenodd" : "nonzero"}
              stroke={el.grosorBorde > 0 ? el.borde : "none"}
              strokeWidth={el.grosorBorde}
              strokeLinejoin="round"
              // El borde mide lo mismo aunque la figura se estire.
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        );
      }
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: el.relleno,
            border: el.grosorBorde > 0 ? `${el.grosorBorde}px solid ${el.borde}` : undefined,
            borderRadius: el.forma === "elipse" ? "50%" : el.radio,
          }}
        />
      );
    }
    case "widget":
      return <WidgetPantalla el={el} datos={props.datos} />;
  }
}

function LienzoDiapositivaBase(props: PropsLienzo) {
  const { diapositiva: d, modo } = props;
  const animar = modo === "reproduccion";
  return (
    <div
      style={{
        position: "relative",
        width: LIENZO.ancho,
        height: LIENZO.alto,
        overflow: "hidden",
        ...estiloFondo(d.fondo),
      }}
    >
      {d.fondo.tipo === "imagen" && <ImagenFondo fondo={d.fondo} medios={props.medios} />}
      {d.elementos.map((el) => {
        const probando = props.probar?.id === el.id;
        const anim = animar || probando ? ANIM_ENTRADA[el.entrada.animacion] : undefined;
        const efecto = animar || probando ? animacionEfecto(el) : undefined;
        return (
          <div
            key={el.id}
            data-elemento={el.id}
            style={{
              position: "absolute",
              left: el.x,
              top: el.y,
              width: el.w,
              height: el.h,
              transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
              opacity: el.opacidad,
            }}
          >
            <div
              key={probando ? `probar-${props.probar?.n}` : "fijo"}
              style={{
                width: "100%",
                height: "100%",
                animation: anim
                  ? `${anim.nombre} ${ENTRADA_MS}ms ${anim.curva ?? "cubic-bezier(.2,.7,.2,1)"} ${el.entrada.retardoMs}ms both`
                  : undefined,
              }}
            >
              {/* Capa propia para el efecto continuo: no pisa la transformación de la entrada. */}
              <div style={{ width: "100%", height: "100%", animation: efecto, transformOrigin: "center" }}>
                <ContenidoElemento el={el} {...props} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const LienzoDiapositiva = memo(LienzoDiapositivaBase);

/** Lienzo a escala fija (miniaturas, listas). */
export function LienzoMiniatura({
  diapositiva,
  medios,
  datos,
  ancho,
  className,
}: {
  diapositiva: Diapositiva;
  medios: Record<string, string>;
  datos?: DatosWidgets;
  ancho: number;
  className?: string;
}) {
  const escala = ancho / LIENZO.ancho;
  return (
    <div className={className} style={{ width: ancho, height: LIENZO.alto * escala, overflow: "hidden", position: "relative", pointerEvents: "none" }}>
      <div style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: LIENZO.ancho, height: LIENZO.alto }}>
        <LienzoDiapositiva diapositiva={diapositiva} medios={medios} datos={datos} modo="miniatura" />
      </div>
    </div>
  );
}
