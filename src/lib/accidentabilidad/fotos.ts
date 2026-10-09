/** Ruta que deja /api/rotacion/accidentes/fotos en el bucket privado `accidentes`. */
const RUTA_FOTO = /^fotos\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

/** Rutas de fotos válidas, sin repetir; descarta cualquier otra cosa que llegue del cliente. */
export function rutasDeFotos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((p): p is string => typeof p === "string" && RUTA_FOTO.test(p)))];
}
