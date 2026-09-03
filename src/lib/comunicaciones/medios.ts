/**
 * Medios de WhatsApp en Supabase Storage (bucket privado "whatsapp").
 *
 * Meta borra los archivos a los 30 días y su URL de descarga vale ~5 min,
 * así que cada foto, audio o documento que entra o sale se copia aquí y en
 * wa_mensajes queda la ruta (media_path). La bandeja los muestra con URL
 * firmada de una hora.
 */
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { descargarMedioDeMeta, type MedioTipo } from "./whatsapp";

const BUCKET = "whatsapp";
const URL_FIRMADA_SEG = 60 * 60;

const EXTENSIONES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/** Límites de Meta por tipo (bytes). Documentos hasta 100 MB; aquí 50 MB. */
export const LIMITES: Record<MedioTipo, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  sticker: 100 * 1024,
};

/** Tipo de mensaje de WhatsApp según el MIME (Meta solo acepta JPEG/PNG como imagen). */
export function tipoPorMime(mime: string): MedioTipo {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (m === "image/jpeg" || m === "image/png") return "image";
  if (m === "video/mp4" || m === "video/3gpp") return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

function extensionDe(mime: string, nombreArchivo?: string | null): string {
  const delNombre = nombreArchivo?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase();
  return delNombre ?? EXTENSIONES[mime.split(";")[0].trim().toLowerCase()] ?? "bin";
}

/** Sube un binario al bucket y devuelve la ruta (null si falla). */
export async function guardarEnStorage(
  conversacionId: string,
  archivo: Buffer,
  mimeType: string,
  nombreArchivo?: string | null
): Promise<string | null> {
  const db = createAdminClient();
  const ruta = `${conversacionId}/${Date.now()}-${randomBytes(4).toString("hex")}.${extensionDe(
    mimeType,
    nombreArchivo
  )}`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: mimeType, upsert: false });
  if (error) {
    console.error("storage whatsapp (subir):", error.message);
    return null;
  }
  return ruta;
}

/** URLs firmadas para varias rutas de una vez (ruta → url). */
export async function firmarMedios(rutas: string[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  const unicas = Array.from(new Set(rutas.filter(Boolean)));
  if (!unicas.length) return resultado;
  const db = createAdminClient();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrls(unicas, URL_FIRMADA_SEG);
  if (error) {
    console.error("storage whatsapp (firmar):", error.message);
    return resultado;
  }
  for (const f of data ?? []) {
    if (f.path && f.signedUrl) resultado.set(f.path, f.signedUrl);
  }
  return resultado;
}

/**
 * Descarga de Meta un medio entrante y lo archiva; devuelve la ruta. Se usa
 * en el webhook al recibir y, como red de seguridad, al abrir un hilo con
 * medios que quedaron sin archivar (mientras Meta aún los conserve).
 */
export async function archivarMedioDeMeta(
  conversacionId: string,
  mediaId: string,
  nombreArchivo?: string | null
): Promise<{ ruta: string; mimeType: string; nombreArchivo: string | null } | null> {
  const medio = await descargarMedioDeMeta(mediaId);
  if (!medio) return null;
  const nombre = nombreArchivo ?? medio.nombreArchivo;
  const ruta = await guardarEnStorage(conversacionId, medio.archivo, medio.mimeType, nombre);
  if (!ruta) return null;
  return { ruta, mimeType: medio.mimeType, nombreArchivo: nombre };
}

/** Meta conserva los medios ~30 días; después no vale la pena reintentar. */
const VIGENCIA_MEDIO_MS = 29 * 24 * 60 * 60 * 1000;

/** Archiva los medios de una conversación que aún no tienen copia local (máx. 10 por llamada). */
export async function asegurarMedios(conversacionId: string): Promise<void> {
  const db = createAdminClient();
  const { data } = await db
    .from("wa_mensajes")
    .select("id, media_id, nombre_archivo")
    .eq("conversacion_id", conversacionId)
    .not("media_id", "is", null)
    .is("media_path", null)
    .gte("timestamp", new Date(Date.now() - VIGENCIA_MEDIO_MS).toISOString())
    .order("timestamp", { ascending: false })
    .limit(10);
  for (const m of data ?? []) {
    try {
      const r = await archivarMedioDeMeta(conversacionId, m.media_id as string, m.nombre_archivo);
      if (r) {
        await db
          .from("wa_mensajes")
          .update({ media_path: r.ruta, mime_type: r.mimeType, nombre_archivo: r.nombreArchivo })
          .eq("id", m.id);
      }
    } catch (e) {
      console.error("asegurarMedios:", e);
    }
  }
}
