/**
 * Soportes del expediente en el bucket privado `incapacidades` (fase 6).
 * Misma forma que los documentos del vehículo: se sube desde el servidor con
 * nombre irrepetible, se sirve con URL firmada de una hora y se anula con
 * motivo, nunca se borra la fila.
 */
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Actor } from "./liquidacion";

export const BUCKET_ADJUNTOS = "incapacidades";
const URL_FIRMADA_SEG = 60 * 60;

export const ADJUNTO_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const ADJUNTO_ACCEPT = ".pdf,image/jpeg,image/png,image/webp";
export const ADJUNTO_LIMITE_BYTES = 10 * 1024 * 1024;

export const RELACIONADO_TIPOS = ["expediente", "liquidacion", "radicacion", "recaudo", "ajuste"] as const;
export type RelacionadoTipo = (typeof RELACIONADO_TIPOS)[number];
export const RELACIONADO_LABEL: Record<RelacionadoTipo, string> = {
  expediente: "Expediente (incapacidad, historia clínica)",
  liquidacion: "Liquidación",
  radicacion: "Radicación (oficio, acuse de la entidad)",
  recaudo: "Recaudo (comprobante del giro)",
  ajuste: "Ajuste (glosa, comunicación de la entidad)",
};

export interface AdjuntoConUrl {
  id: string;
  relacionado_tipo: string;
  relacionado_id: string | null;
  archivo_ruta: string;
  archivo_nombre: string;
  archivo_mime: string | null;
  archivo_tamano: number | null;
  subido_por_email: string | null;
  created_at: string;
  anulado_at: string | null;
  motivo_anulacion: string | null;
  url: string | null;
}

export function tamanoLegible(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Sube el binario y registra la fila; si la fila falla, borra el archivo. */
export async function guardarAdjunto(d: {
  expedienteId: string;
  relacionadoTipo: RelacionadoTipo;
  relacionadoId: string | null;
  nombre: string;
  mime: string;
  buffer: Buffer;
}, actor: Actor): Promise<string> {
  const db = createAdminClient();
  const ext = ADJUNTO_MIMES[d.mime] ?? "bin";
  const ruta = `${d.expedienteId}/${d.relacionadoTipo}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const { error: e1 } = await db.storage.from(BUCKET_ADJUNTOS).upload(ruta, d.buffer, { contentType: d.mime, upsert: false });
  if (e1) throw new Error(`No se pudo guardar el archivo en Storage: ${e1.message}`);
  const { data, error } = await db
    .from("incapacidad_adjuntos")
    .insert({
      expediente_id: d.expedienteId,
      relacionado_tipo: d.relacionadoTipo,
      relacionado_id: d.relacionadoId,
      archivo_ruta: ruta,
      archivo_nombre: d.nombre.slice(0, 200),
      archivo_mime: d.mime,
      archivo_tamano: d.buffer.byteLength,
      subido_por_email: actor.email,
    })
    .select("id")
    .single();
  if (error) {
    await db.storage.from(BUCKET_ADJUNTOS).remove([ruta]).catch(() => undefined);
    throw new Error(error.message);
  }
  try {
    await db.from("ausentismo_log").insert({ registro_id: d.expedienteId, accion: "adjunto_subido", datos_nuevos: { adjunto_id: (data as { id: string }).id, nombre: d.nombre, tipo: d.relacionadoTipo, tamano: d.buffer.byteLength }, user_email: actor.email });
  } catch (e) {
    console.error("[incapacidades] bitácora de adjunto:", e);
  }
  return (data as { id: string }).id;
}

/** Los soportes del expediente con su URL firmada (null si Storage no responde). */
export async function listarAdjuntos(expedienteId: string, incluirAnulados = false): Promise<AdjuntoConUrl[]> {
  const db = createAdminClient();
  let q = db.from("incapacidad_adjuntos").select("*").eq("expediente_id", expedienteId).order("created_at", { ascending: false });
  if (!incluirAnulados) q = q.is("anulado_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Omit<AdjuntoConUrl, "url">[];
  const vigentes = filas.filter((f) => !f.anulado_at).map((f) => f.archivo_ruta);
  const urls = new Map<string, string>();
  if (vigentes.length) {
    const { data: firmadas, error: e2 } = await db.storage.from(BUCKET_ADJUNTOS).createSignedUrls(vigentes, URL_FIRMADA_SEG);
    if (e2) console.error("[incapacidades] storage (firmar):", e2.message);
    for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }
  return filas.map((f) => ({ ...f, url: urls.get(f.archivo_ruta) ?? null }));
}

export async function anularAdjunto(adjuntoId: string, motivo: string | null, actor: Actor): Promise<{ expedienteId: string; nombre: string }> {
  if (!motivo || motivo.trim().length < 5) throw new Error("Escribe el motivo de la anulación (mínimo 5 caracteres).");
  const db = createAdminClient();
  const { data, error } = await db
    .from("incapacidad_adjuntos")
    .update({ anulado_at: new Date().toISOString(), anulado_por_email: actor.email, motivo_anulacion: motivo.trim() })
    .eq("id", adjuntoId)
    .is("anulado_at", null)
    .select("expediente_id, archivo_nombre")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("El soporte no existe o ya está anulado.");
  const r = data as { expediente_id: string; archivo_nombre: string };
  try {
    await db.from("ausentismo_log").insert({ registro_id: r.expediente_id, accion: "adjunto_anulado", datos_nuevos: { adjunto_id: adjuntoId, nombre: r.archivo_nombre, motivo }, user_email: actor.email });
  } catch (e) {
    console.error("[incapacidades] bitácora de adjunto:", e);
  }
  return { expedienteId: r.expediente_id, nombre: r.archivo_nombre };
}
