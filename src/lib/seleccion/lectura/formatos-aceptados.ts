/**
 * Formatos que se pueden leer, para el navegador (selector de archivos y
 * mensajes): sin dependencias, para no cargar el lector de zip en el cliente.
 * La conversión está en ./formatos (solo servidor). PURO.
 */

export const MIME_ODT = "application/vnd.oasis.opendocument.text";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Para el atributo `accept` del selector de archivos. */
export const ACEPTA_ARCHIVOS = [
  ".pdf", ".docx", ".odt", ".rtf", ".txt", ".jpg", ".jpeg", ".png", ".webp",
  "application/pdf", MIME_DOCX, MIME_ODT, "application/rtf", "text/rtf", "text/plain", "image/jpeg", "image/png", "image/webp",
].join(",");

/** Lo que se puede subir, para los mensajes. */
export const FORMATOS_LEGIBLES = "PDF, Word (.docx), OpenDocument (.odt), RTF, texto (.txt) o foto (JPG, PNG o WebP)";

/** Tope del chat de prueba: Vercel no acepta peticiones de más de ~4,5 MB (por WhatsApp se leen hasta 8 MB). */
export const MAX_BYTES_DOCUMENTO_PRUEBA = 4 * 1024 * 1024;

/** ¿Es una foto (va por la lectura de la cédula en el chat de prueba)? */
export function esFoto(mime: string | null | undefined, nombre?: string | null): boolean {
  const m = String(mime ?? "").split(";")[0].trim().toLowerCase();
  return ["image/jpeg", "image/png", "image/webp"].includes(m) || (!m && /\.(jpe?g|png|webp)$/i.test(String(nombre ?? "")));
}
