/**
 * Archivos de los documentos del vehículo en Supabase Storage (bucket privado
 * "operativo"). Misma forma que los medios de WhatsApp: se sube desde el
 * servidor con un nombre irrepetible y se sirve con URL firmada de una hora.
 */
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ARCHIVO_MIMES } from "./constants";

const BUCKET = "operativo";
const URL_FIRMADA_SEG = 60 * 60;

/** Sube el binario y devuelve la ruta (null si falla). */
export async function guardarArchivo(
  codigo: string,
  tipo: string,
  archivo: Buffer,
  mimeType: string
): Promise<string | null> {
  const db = createAdminClient();
  const ext = ARCHIVO_MIMES[mimeType.split(";")[0].trim().toLowerCase()] ?? "bin";
  const ruta = `${codigo}/${tipo}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(ruta, archivo, { contentType: mimeType, upsert: false });
  if (error) {
    console.error("storage operativo (subir):", error.message);
    return null;
  }
  return ruta;
}

/** Borra un archivo; se usa como compensación si el registro no se pudo guardar. */
export async function eliminarArchivo(ruta: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.storage.from(BUCKET).remove([ruta]);
  if (error) console.error("storage operativo (borrar):", error.message);
}

/** URLs firmadas para varias rutas de una vez (ruta → url). */
export async function firmarArchivos(rutas: (string | null)[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  const unicas = Array.from(new Set(rutas.filter((r): r is string => Boolean(r))));
  if (!unicas.length) return resultado;
  const db = createAdminClient();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrls(unicas, URL_FIRMADA_SEG);
  if (error) {
    console.error("storage operativo (firmar):", error.message);
    return resultado;
  }
  for (const f of data ?? []) if (f.path && f.signedUrl) resultado.set(f.path, f.signedUrl);
  return resultado;
}
