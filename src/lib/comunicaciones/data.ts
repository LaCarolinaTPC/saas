import { createAdminClient } from "@/lib/supabase/admin";
import { firmarMedios } from "./medios";

export interface ConversacionResumen {
  id: string;
  telefono: string;
  nombre: string | null;
  ultimoMensaje: string;
  ultimoMensajeAt: string;
  ultimoEntranteAt: string | null;
  noLeidos: number;
}

export interface MensajeChat {
  id: string;
  direccion: "entrante" | "saliente";
  contenido: string;
  estado: string | null;
  errorMensaje: string | null;
  mediaTipo: string | null;
  mimeType: string | null;
  nombreArchivo: string | null;
  /** URL firmada (1 h) del archivo en Storage; null si no hay copia local. */
  mediaUrl: string | null;
  plantilla: string | null;
  enviadoPor: string | null;
  timestamp: string;
}

const ETIQUETA_MEDIO: Record<string, string> = {
  image: "📷 Foto",
  video: "🎥 Video",
  audio: "🎤 Audio",
  document: "📄 Documento",
  sticker: "Sticker",
};

export async function getConversaciones(): Promise<ConversacionResumen[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("wa_conversaciones")
    .select(
      "id, ultimo_mensaje_at, ultimo_entrante_at, no_leidos, wa_contactos(telefono, nombre)"
    )
    .order("ultimo_mensaje_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`conversaciones: ${error.message}`);

  // Último mensaje por conversación (una consulta, no N+1).
  const ids = (data ?? []).map((c) => c.id);
  const ultimos = new Map<string, string>();
  if (ids.length) {
    const { data: msjs } = await db
      .from("wa_mensajes")
      .select("conversacion_id, contenido, media_tipo, timestamp")
      .in("conversacion_id", ids)
      .order("timestamp", { ascending: false })
      .limit(600);
    for (const m of msjs ?? []) {
      if (!ultimos.has(m.conversacion_id)) {
        ultimos.set(
          m.conversacion_id,
          m.contenido || (m.media_tipo ? ETIQUETA_MEDIO[m.media_tipo] ?? `[${m.media_tipo}]` : "")
        );
      }
    }
  }

  return (data ?? []).map((c) => {
    // El embed de PostgREST llega como objeto (FK única), tipado como array.
    const contacto = (Array.isArray(c.wa_contactos) ? c.wa_contactos[0] : c.wa_contactos) as {
      telefono: string; nombre: string | null;
    } | null;
    return {
      id: c.id,
      telefono: contacto?.telefono ?? "",
      nombre: contacto?.nombre ?? null,
      ultimoMensaje: ultimos.get(c.id) ?? "",
      ultimoMensajeAt: c.ultimo_mensaje_at,
      ultimoEntranteAt: c.ultimo_entrante_at,
      noLeidos: Number(c.no_leidos ?? 0),
    };
  });
}

export async function getMensajes(conversacionId: string): Promise<MensajeChat[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("wa_mensajes")
    .select(
      "id, direccion, contenido, estado, error_mensaje, media_tipo, mime_type, nombre_archivo, media_path, plantilla, enviado_por, timestamp"
    )
    .eq("conversacion_id", conversacionId)
    .order("timestamp", { ascending: true })
    .limit(500);
  if (error) throw new Error(`mensajes: ${error.message}`);
  // Abrir el hilo lo marca como leído.
  await db.from("wa_conversaciones").update({ no_leidos: 0 }).eq("id", conversacionId);

  const urls = await firmarMedios((data ?? []).map((m) => m.media_path as string | null).filter((p): p is string => !!p));

  return (data ?? []).map((m) => ({
    id: m.id,
    direccion: m.direccion as "entrante" | "saliente",
    contenido: m.contenido,
    estado: m.estado,
    errorMensaje: m.error_mensaje,
    mediaTipo: m.media_tipo,
    mimeType: m.mime_type,
    nombreArchivo: m.nombre_archivo,
    mediaUrl: m.media_path ? urls.get(m.media_path) ?? null : null,
    plantilla: m.plantilla,
    enviadoPor: m.enviado_por,
    timestamp: m.timestamp,
  }));
}
