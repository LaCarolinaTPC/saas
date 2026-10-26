/**
 * Reglas de la biblioteca de medios (PURO): qué se acepta subir y dónde queda.
 *
 * Los archivos van del navegador directo a Storage con una URL firmada: Vercel
 * corta el cuerpo de una petición en 4,5 MB y un video no cabría. El servidor
 * firma la subida solo después de pasar por `validarDeclaracion`, y al
 * registrar vuelve a mirar el tamaño y el tipo REALES del objeto en Storage.
 */

import { MEDIOS, RUTA_MEDIO, type TipoMedio } from "./modelo";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export const ACEPTA_INPUT = "image/jpeg,image/png,image/webp,video/mp4,video/webm";

export function tipoDeMime(mime: string): TipoMedio | null {
  if ((MEDIOS.imagen.mimes as readonly string[]).includes(mime)) return "imagen";
  if ((MEDIOS.video.mimes as readonly string[]).includes(mime)) return "video";
  return null;
}

const mb = (b: number) => `${Math.round(b / 1024 / 1024)} MB`;

/** Error legible, o null si se puede subir. */
export function validarDeclaracion(d: { nombre: string; mime: string; bytes: number }): string | null {
  const tipo = tipoDeMime(d.mime);
  if (!tipo) {
    return d.mime.startsWith("video/")
      ? "Ese formato de video no se puede reproducir en el TV. Use MP4 (H.264) o WebM."
      : "Solo se aceptan imágenes JPG, PNG o WebP y videos MP4 o WebM.";
  }
  if (!Number.isFinite(d.bytes) || d.bytes <= 0) return "El archivo está vacío.";
  const max = MEDIOS[tipo].maxBytes;
  if (d.bytes > max) return `${tipo === "video" ? "El video" : "La imagen"} pesa más de ${mb(max)}.`;
  if (!d.nombre.trim()) return "El archivo no tiene nombre.";
  return null;
}

/** Ruta del archivo (y del póster si es video) dentro del bucket `pantalla`. */
export function rutasParaMedio(uuid: string, mime: string): { path: string; posterPath: string | null } {
  const ext = EXT[mime];
  if (!ext || !/^[0-9a-f-]{36}$/i.test(uuid)) throw new Error("Medio no válido.");
  return {
    path: `biblioteca/${uuid}.${ext}`,
    posterPath: tipoDeMime(mime) === "video" ? `biblioteca/${uuid}.poster.jpg` : null,
  };
}

export function esRutaMedio(path: unknown): path is string {
  return typeof path === "string" && RUTA_MEDIO.test(path);
}

/** Nombre para mostrar: sin extensión ni caracteres raros, máximo 80. */
export function nombreVisible(nombreArchivo: string): string {
  const sin = nombreArchivo.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/[<>]/g, "").trim();
  return (sin || "Sin nombre").slice(0, 80);
}

/** "1:05" para la duración de un video. */
export function formatoDuracion(seg: number | null | undefined): string {
  if (seg == null || !Number.isFinite(seg)) return "—";
  const s = Math.round(seg);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatoBytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
