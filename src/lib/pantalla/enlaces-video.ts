/**
 * Videos desde un enlace (PURO): YouTube, Vimeo o un archivo MP4/WebM directo.
 *
 * Se guarda la REFERENCIA mínima (proveedor + id), nunca el enlace pegado tal
 * cual: así el TV solo arma direcciones de reproductores conocidos y no se
 * puede colar otra página dentro de la pantalla.
 *
 * Límites que no controla Gestivo (se avisan en el editor): YouTube puede
 * meter anuncios si el dueño del video lo monetiza; si el dueño prohíbe
 * insertarlo o lo borra, el TV muestra la miniatura y pasa a la siguiente
 * diapositiva; el video se descarga de internet cada vez que se reproduce.
 */

export type RefVideoWeb =
  | { proveedor: "youtube"; id: string }
  | { proveedor: "vimeo"; id: string; hash: string | null }
  | { proveedor: "mp4"; url: string };

export type ProveedorVideoWeb = RefVideoWeb["proveedor"];

export const NOMBRE_PROVEEDOR: Record<ProveedorVideoWeb, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  mp4: "Archivo de video",
};

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const ID_VIMEO = /^\d{1,12}$/;
const HASH_VIMEO = /^[a-f0-9]{6,20}$/i;
const MAX_URL = 500;

function aUrl(texto: string): URL | null {
  const t = texto.trim();
  if (!t || t.length > 2000) return null;
  try {
    return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
}

/** URL de un MP4/WebM directo, solo https, sin credenciales ni rarezas. */
function esArchivoDirecto(u: URL): boolean {
  return (
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    u.href.length <= MAX_URL &&
    /\.(mp4|webm)$/i.test(u.pathname) &&
    !/["'<>\s\\]/.test(u.href)
  );
}

/**
 * Reconoce un enlace pegado por la persona. Null si no es de un sitio que el
 * TV pueda reproducir solo (TikTok, Instagram, Facebook, Drive… no lo permiten).
 */
export function interpretarEnlace(texto: string): RefVideoWeb | null {
  const u = aUrl(texto);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");

  if (host === "youtu.be") {
    const id = u.pathname.split("/")[1] ?? "";
    return ID_YOUTUBE.test(id) ? { proveedor: "youtube", id } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v && ID_YOUTUBE.test(v)) return { proveedor: "youtube", id: v };
    const [, tipo, id] = u.pathname.split("/");
    if (["embed", "shorts", "live", "v"].includes(tipo ?? "") && ID_YOUTUBE.test(id ?? "")) {
      return { proveedor: "youtube", id: id! };
    }
    return null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const partes = u.pathname.split("/").filter(Boolean);
    // vimeo.com/123 · vimeo.com/123/abcdef (no listado) · player.vimeo.com/video/123?h=abc
    // vimeo.com/channels/x/123 · vimeo.com/groups/x/videos/123
    const i = partes.findIndex((p) => ID_VIMEO.test(p));
    if (i < 0) return null;
    const id = partes[i];
    const hashRuta = partes[i + 1] && HASH_VIMEO.test(partes[i + 1]) ? partes[i + 1] : null;
    const hashQuery = u.searchParams.get("h");
    const hash = hashRuta ?? (hashQuery && HASH_VIMEO.test(hashQuery) ? hashQuery : null);
    return { proveedor: "vimeo", id, hash };
  }

  if (esArchivoDirecto(u)) return { proveedor: "mp4", url: u.href };
  return null;
}

/** Valida lo que viene guardado (no un enlace pegado). */
export function validarRefVideoWeb(v: unknown): RefVideoWeb | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.proveedor === "youtube" && typeof o.id === "string" && ID_YOUTUBE.test(o.id)) {
    return { proveedor: "youtube", id: o.id };
  }
  if (o.proveedor === "vimeo" && typeof o.id === "string" && ID_VIMEO.test(o.id)) {
    const hash = typeof o.hash === "string" && HASH_VIMEO.test(o.hash) ? o.hash : null;
    return { proveedor: "vimeo", id: o.id, hash };
  }
  if (o.proveedor === "mp4" && typeof o.url === "string") {
    const u = aUrl(o.url);
    return u && esArchivoDirecto(u) && u.href === o.url ? { proveedor: "mp4", url: o.url } : null;
  }
  return null;
}

/** Miniatura guardada de Vimeo: solo de su CDN de imágenes. */
export function validarMiniaturaWeb(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_URL) return null;
  const u = aUrl(v);
  return u && u.protocol === "https:" && u.hostname === "i.vimeocdn.com" && u.href === v ? v : null;
}

/** Miniatura para el editor y para cuando el TV no puede reproducir. */
export function miniaturaDe(ref: RefVideoWeb, guardada: string | null): string | null {
  if (ref.proveedor === "youtube") return `https://i.ytimg.com/vi/${ref.id}/hqdefault.jpg`;
  return guardada;
}

/** Enlace para abrir el video en su sitio (panel del editor). */
export function enlacePublico(ref: RefVideoWeb): string {
  if (ref.proveedor === "youtube") return `https://www.youtube.com/watch?v=${ref.id}`;
  if (ref.proveedor === "vimeo") return `https://vimeo.com/${ref.id}${ref.hash ? `/${ref.hash}` : ""}`;
  return ref.url;
}

/** Dirección del reproductor de Vimeo en modo TV (sin controles ni textos). */
export function urlReproductorVimeo(ref: Extract<RefVideoWeb, { proveedor: "vimeo" }>, opts: { bucle: boolean }): string {
  const q = new URLSearchParams({
    autoplay: "1",
    muted: "1",
    controls: "0",
    title: "0",
    byline: "0",
    portrait: "0",
    dnt: "1",
    playsinline: "1",
    loop: opts.bucle ? "1" : "0",
  });
  if (ref.hash) q.set("h", ref.hash);
  return `https://player.vimeo.com/video/${ref.id}?${q}`;
}

/**
 * Temporizador de seguridad de un video desde enlace que manda la diapositiva:
 * más largo que para los videos propios porque YouTube puede poner un anuncio
 * antes y el video tarda más en empezar.
 */
export const MARGEN_FIN_VIDEO_WEB_MS = 45_000;
