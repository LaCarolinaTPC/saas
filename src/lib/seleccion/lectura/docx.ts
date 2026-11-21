/**
 * Hojas de vida en Word (.docx): el modelo no lee Word, así que se saca el
 * texto (párrafos y tablas) y las imágenes pegadas (una foto de la cédula o
 * de un certificado) y se le mandan como texto y como fotos. Un .docx es un
 * zip: el texto está en word/document.xml y las imágenes en word/media/.
 * No hace falta convertirlo a PDF ni otro servicio.
 */
import JSZip from "jszip";

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** ¿Es un Word moderno? Por el tipo o, si WhatsApp no lo trae, por el nombre. */
export function esDocx(mime: string | null | undefined, nombre?: string | null): boolean {
  const m = String(mime ?? "").split(";")[0].trim().toLowerCase();
  return m === MIME_DOCX || (/\.docx$/i.test(String(nombre ?? "")) && (!m || m === "application/octet-stream" || m === "application/zip"));
}

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/**
 * Texto de word/document.xml. PURO. Cada párrafo en su línea, las celdas de
 * una fila separadas por « | », los tabuladores como espacio.
 */
export function xmlATexto(xml: string): string {
  return xml
    // Dentro de una celda, los párrafos van seguidos: una fila de la tabla es una línea.
    .replace(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g, (_, celda: string) => `${celda.replace(/<\/w:p>/g, " ")}</w:tc>`)
    .replace(/<w:tab\/>/g, " ")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\| ?\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

const MAX_IMAGENES = 3;
const MAX_BYTES_IMAGEN = 3_000_000;
/** Más pequeñas que esto suelen ser logos o íconos. */
const MIN_BYTES_IMAGEN = 15_000;
const TIPO_IMAGEN: Record<string, "image/jpeg" | "image/png"> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

export interface DocxExtraido {
  texto: string;
  imagenes: { tipo: "image/jpeg" | "image/png"; base64: string }[];
}

/** Texto e imágenes de un .docx. Lanza si no es un Word válido. */
export async function extraerDocx(bytes: Buffer | Uint8Array): Promise<DocxExtraido> {
  const zip = await JSZip.loadAsync(bytes);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("El archivo no parece un documento de Word (.docx).");
  const texto = xmlATexto(await doc.async("string")).slice(0, 60_000);
  const imagenes: DocxExtraido["imagenes"] = [];
  const medios = Object.values(zip.files)
    .filter((f) => !f.dir && /^word\/media\/.+\.(jpe?g|png)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const f of medios) {
    if (imagenes.length >= MAX_IMAGENES) break;
    const datos = await f.async("nodebuffer");
    if (datos.byteLength < MIN_BYTES_IMAGEN || datos.byteLength > MAX_BYTES_IMAGEN) continue;
    const ext = f.name.split(".").pop()!.toLowerCase();
    imagenes.push({ tipo: TIPO_IMAGEN[ext], base64: datos.toString("base64") });
  }
  return { texto, imagenes };
}
