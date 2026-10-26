/**
 * Revisa un video desde enlace ANTES de insertarlo (solo navegador): título,
 * duración y si el sitio deja reproducirlo insertado. Así un video que el
 * dueño no permite insertar se descubre en el editor y no en el TV.
 */

import type { RefVideoWeb } from "@/lib/pantalla/enlaces-video";
import { validarMiniaturaWeb } from "@/lib/pantalla/enlaces-video";
import { cargarYouTube } from "../apis-video";

export type InfoVideoWeb =
  | { ok: true; titulo: string; duracionSeg: number | null; miniatura: string | null; aviso: string | null }
  | { ok: false; error: string };

const LIMITE_MS = 15_000;

function conLimite<T>(p: Promise<T>, ms = LIMITE_MS): Promise<T | "tiempo"> {
  return Promise.race([p, new Promise<"tiempo">((ok) => setTimeout(() => ok("tiempo"), ms))]);
}

const SIN_VERIFICAR =
  "No se pudo comprobar el video ahora (¿sin internet?). Se insertará igual; revíselo en la vista previa.";

async function medirYouTube(id: string): Promise<InfoVideoWeb> {
  let YT;
  try {
    YT = await cargarYouTube();
  } catch {
    return { ok: true, titulo: "", duracionSeg: null, miniatura: null, aviso: SIN_VERIFICAR };
  }
  const caja = document.createElement("div");
  caja.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none";
  const div = document.createElement("div");
  caja.appendChild(div);
  document.body.appendChild(caja);
  try {
    const r = await conLimite(
      new Promise<InfoVideoWeb>((ok) => {
        const p = new YT.Player(div, {
          host: "https://www.youtube-nocookie.com",
          videoId: id,
          playerVars: { autoplay: 0, controls: 0 },
          events: {
            onReady: (e) => {
              // La duración puede tardar un instante en estar disponible.
              let intentos = 0;
              const leer = () => {
                const d = e.target.getDuration();
                if (d > 0 || intentos++ > 10) {
                  ok({ ok: true, titulo: e.target.getVideoData?.()?.title ?? "", duracionSeg: d > 0 ? d : null, miniatura: null, aviso: null });
                  try {
                    p.destroy();
                  } catch {
                    /* nada */
                  }
                } else setTimeout(leer, 300);
              };
              leer();
            },
            onError: (e) => {
              // 100: no existe o es privado · 101/150: el dueño no permite insertarlo.
              ok({
                ok: false,
                error:
                  e.data === 101 || e.data === 150
                    ? "El dueño de este video no permite mostrarlo fuera de YouTube. Elija otro o súbalo a la biblioteca."
                    : "YouTube dice que el video no existe o es privado.",
              });
            },
          },
        });
      })
    );
    return r === "tiempo" ? { ok: true, titulo: "", duracionSeg: null, miniatura: null, aviso: SIN_VERIFICAR } : r;
  } finally {
    caja.remove();
  }
}

async function medirVimeo(ref: Extract<RefVideoWeb, { proveedor: "vimeo" }>): Promise<InfoVideoWeb> {
  const url = `https://vimeo.com/${ref.id}${ref.hash ? `/${ref.hash}` : ""}`;
  try {
    const r = await conLimite(fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`));
    if (r === "tiempo") return { ok: true, titulo: "", duracionSeg: null, miniatura: null, aviso: SIN_VERIFICAR };
    if (r.status === 403 || r.status === 404) {
      return { ok: false, error: "Vimeo no deja mostrar este video fuera de su sitio (es privado o no permite insertarlo)." };
    }
    if (!r.ok) return { ok: true, titulo: "", duracionSeg: null, miniatura: null, aviso: SIN_VERIFICAR };
    const j = (await r.json()) as { title?: string; duration?: number; thumbnail_url?: string };
    return {
      ok: true,
      titulo: j.title ?? "",
      duracionSeg: typeof j.duration === "number" && j.duration > 0 ? j.duration : null,
      miniatura: validarMiniaturaWeb(j.thumbnail_url ?? null),
      aviso: null,
    };
  } catch {
    return { ok: true, titulo: "", duracionSeg: null, miniatura: null, aviso: SIN_VERIFICAR };
  }
}

async function medirArchivo(url: string): Promise<InfoVideoWeb> {
  const v = document.createElement("video");
  v.preload = "metadata";
  v.muted = true;
  v.src = url;
  try {
    const r = await conLimite(
      new Promise<InfoVideoWeb>((ok) => {
        v.onloadedmetadata = () =>
          ok({
            ok: true,
            titulo: decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").replace(/\.(mp4|webm)$/i, ""),
            duracionSeg: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null,
            miniatura: null,
            aviso: null,
          });
        v.onerror = () =>
          ok({ ok: false, error: "No se pudo abrir ese archivo de video. Revise el enlace o que el formato sea MP4 (H.264) o WebM." });
      })
    );
    return r === "tiempo" ? { ok: true, titulo: "", duracionSeg: null, miniatura: null, aviso: SIN_VERIFICAR } : r;
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

export function medirVideoWeb(ref: RefVideoWeb): Promise<InfoVideoWeb> {
  if (ref.proveedor === "youtube") return medirYouTube(ref.id);
  if (ref.proveedor === "vimeo") return medirVimeo(ref);
  return medirArchivo(ref.url);
}
