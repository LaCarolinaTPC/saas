/**
 * Carga perezosa de las APIs oficiales de YouTube y Vimeo (solo navegador).
 * Se pide cada script una sola vez; si falla, la promesa se olvida para poder
 * reintentar en la siguiente diapositiva.
 */

export interface ReproductorYouTube {
  mute(): void;
  unMute(): void;
  playVideo(): void;
  getPlayerState(): number;
  getDuration(): number;
  getVideoData?(): { title?: string };
  destroy(): void;
}

interface EventoYouTube {
  target: ReproductorYouTube;
  data: number;
}

export interface ApiYouTube {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: EventoYouTube) => void;
        onStateChange?: (e: EventoYouTube) => void;
        onError?: (e: EventoYouTube) => void;
      };
    }
  ) => ReproductorYouTube;
}

export interface ReproductorVimeo {
  on(evento: "ended" | "error" | "loaded", fn: (d?: unknown) => void): void;
  setMuted(v: boolean): Promise<boolean>;
  play(): Promise<void>;
  getDuration(): Promise<number>;
  getVideoTitle(): Promise<string>;
  destroy(): Promise<void>;
}

export interface ApiVimeo {
  Player: new (el: HTMLIFrameElement | HTMLElement, opts?: Record<string, unknown>) => ReproductorVimeo;
}

type Ventana = Window & {
  YT?: ApiYouTube & { loaded?: number };
  onYouTubeIframeAPIReady?: () => void;
  Vimeo?: ApiVimeo;
};

const LIMITE_MS = 20_000;

function cargarScript(src: string): Promise<void> {
  return new Promise((ok, mal) => {
    const existente = document.querySelector(`script[src="${src}"]`);
    if (existente) existente.remove();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => mal(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

let promesaYouTube: Promise<ApiYouTube> | null = null;

export function cargarYouTube(): Promise<ApiYouTube> {
  const w = window as Ventana;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  promesaYouTube ??= new Promise<ApiYouTube>((ok, mal) => {
    const anterior = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      anterior?.();
      if (w.YT?.Player) ok(w.YT);
    };
    const t = window.setTimeout(() => mal(new Error("YouTube no respondió")), LIMITE_MS);
    cargarScript("https://www.youtube.com/iframe_api").catch((e) => {
      window.clearTimeout(t);
      mal(e);
    });
  }).catch((e) => {
    promesaYouTube = null;
    throw e;
  });
  return promesaYouTube;
}

let promesaVimeo: Promise<ApiVimeo> | null = null;

export function cargarVimeo(): Promise<ApiVimeo> {
  const w = window as Ventana;
  if (w.Vimeo?.Player) return Promise.resolve(w.Vimeo);
  promesaVimeo ??= cargarScript("https://player.vimeo.com/api/player.js")
    .then(() => {
      if (!w.Vimeo?.Player) throw new Error("Vimeo no respondió");
      return w.Vimeo;
    })
    .catch((e) => {
      promesaVimeo = null;
      throw e;
    });
  return promesaVimeo;
}
