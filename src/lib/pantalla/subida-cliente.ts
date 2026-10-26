/**
 * Subida de imágenes y videos a la biblioteca de la pantalla (solo navegador).
 *
 * Va directo del navegador a Supabase Storage con una URL firmada que entrega
 * el servidor (`prepararSubida`): un video de 80 MB no puede pasar por una
 * ruta de la app porque Vercel corta el cuerpo en 4,5 MB. Al terminar,
 * `registrarMedio` lo anota en la biblioteca con el tamaño real de Storage.
 */

import { createClient } from "@/lib/supabase/client";
import { comprimirImagen } from "@/lib/imagenes/comprimir";
import { prepararSubida, registrarMedio } from "./actions";
import type { MedioBiblioteca } from "./consultas";
import { tipoDeMime, validarDeclaracion } from "./medios-reglas";

export type EstadoSubida = "midiendo" | "subiendo" | "registrando" | "listo";

/** Dimensiones, duración y primer fotograma (JPEG) de un video, leídos en el navegador. */
export async function medirVideo(file: File): Promise<{ ancho: number; alto: number; duracionSeg: number; poster: Blob | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((ok, mal) => {
      video.onloadedmetadata = () => ok();
      video.onerror = () => mal(new Error("Este navegador no puede leer el video. Use MP4 (H.264) o WebM."));
      setTimeout(() => mal(new Error("No se pudo leer el video.")), 20_000);
    });
    const duracionSeg = Number.isFinite(video.duration) ? video.duration : 0;
    const ancho = video.videoWidth;
    const alto = video.videoHeight;
    if (!ancho || !alto) throw new Error("El video no tiene imagen o usa un formato que el TV no reproduce. Use MP4 (H.264) o WebM.");
    let poster: Blob | null = null;
    try {
      await new Promise<void>((ok) => {
        video.onseeked = () => ok();
        video.currentTime = Math.min(0.5, duracionSeg / 2 || 0);
        setTimeout(ok, 5000);
      });
      const escala = Math.min(1, 1280 / Math.max(ancho, alto));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(ancho * escala);
      canvas.height = Math.round(alto * escala);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      poster = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    } catch {
      poster = null;
    }
    return { ancho, alto, duracionSeg, poster };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Sube un archivo a la biblioteca y devuelve el medio registrado. Lanza con un mensaje legible. */
export async function subirMedio(file: File, onEstado?: (e: EstadoSubida) => void): Promise<MedioBiblioteca> {
  const tipo = tipoDeMime(file.type);
  const error = validarDeclaracion({ nombre: file.name, mime: file.type, bytes: file.size });
  if (error || !tipo) throw new Error(error ?? "Archivo no permitido.");

  onEstado?.("midiendo");
  let cuerpo: Blob = file;
  let ancho: number | null = null;
  let alto: number | null = null;
  let duracionSeg: number | null = null;
  let poster: Blob | null = null;
  let mime = file.type;
  if (tipo === "imagen") {
    const r = await comprimirImagen(file, { ladoMax: 1920, calidad: 0.85, formato: "conservar" });
    cuerpo = r.blob;
    ancho = r.ancho;
    alto = r.alto;
    mime = r.blob.type || file.type;
  } else {
    const m = await medirVideo(file);
    ancho = m.ancho;
    alto = m.alto;
    duracionSeg = m.duracionSeg;
    poster = m.poster;
  }

  const supabase = createClient();
  const subir = async () => {
    const prep = await prepararSubida({ nombre: file.name, mime, bytes: cuerpo.size });
    if (!prep.ok) throw new Error(prep.error);
    onEstado?.("subiendo");
    const r = await supabase.storage.from("pantalla").uploadToSignedUrl(prep.path, prep.token, cuerpo, { contentType: mime });
    if (r.error) throw new Error(r.error.message);
    let posterPath: string | null = null;
    if (poster && prep.poster) {
      const rp = await supabase.storage
        .from("pantalla")
        .uploadToSignedUrl(prep.poster.path, prep.poster.token, poster, { contentType: "image/jpeg" });
      if (!rp.error) posterPath = prep.poster.path;
    }
    return { path: prep.path, posterPath };
  };

  let subido: { path: string; posterPath: string | null };
  try {
    subido = await subir();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/payload too large|413|maximum allowed size|exceeded/i.test(msg)) {
      throw new Error("El servidor de archivos rechazó el tamaño. Pida a sistemas subir el límite de Storage a 150 MB.");
    }
    // Una firma vencida por una red lenta: se pide otra una vez.
    if (/expired|signature|jwt/i.test(msg)) subido = await subir();
    else throw new Error(msg || "No se pudo subir el archivo.");
  }

  onEstado?.("registrando");
  const reg = await registrarMedio({ path: subido.path, posterPath: subido.posterPath, nombre: file.name, ancho, alto, duracionSeg });
  if (!reg.ok) throw new Error(reg.error);
  onEstado?.("listo");
  return reg.medio;
}
