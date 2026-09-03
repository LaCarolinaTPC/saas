/**
 * Registro de mensajes salientes y resolución de conversaciones: lo que
 * comparten las server actions (texto, plantillas) y la ruta de adjuntos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { EnvioResultado } from "./whatsapp";

/** Solo dígitos; un celular colombiano de 10 cifras recibe el indicativo 57. */
export function normalizarTelefono(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, "");
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (digitos.length >= 10 && digitos.length <= 15) return digitos;
  return null;
}

export async function telefonoDeConversacion(conversacionId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data: conv } = await db
    .from("wa_conversaciones")
    .select("id, wa_contactos(telefono)")
    .eq("id", conversacionId)
    .maybeSingle();
  const contacto = (Array.isArray(conv?.wa_contactos) ? conv?.wa_contactos[0] : conv?.wa_contactos) as
    | { telefono: string }
    | null;
  return contacto?.telefono ?? null;
}

/** Contacto y conversación por teléfono; los crea si no existen. */
export async function obtenerOCrearConversacion(
  telefono: string,
  nombre?: string | null
): Promise<string | null> {
  const db = createAdminClient();
  const { data: contacto } = await db
    .from("wa_contactos")
    .upsert(
      { telefono, ...(nombre ? { nombre } : {}), updated_at: new Date().toISOString() },
      { onConflict: "telefono" }
    )
    .select("id")
    .single();
  if (!contacto) return null;
  const { data: conv } = await db
    .from("wa_conversaciones")
    .upsert({ contacto_id: contacto.id }, { onConflict: "contacto_id" })
    .select("id")
    .single();
  return conv?.id ?? null;
}

export interface DatosSaliente {
  contenido: string;
  mediaTipo?: string | null;
  mediaId?: string | null;
  mimeType?: string | null;
  nombreArchivo?: string | null;
  mediaPath?: string | null;
  plantilla?: string | null;
}

/** Guarda el saliente (enviado o fallido) y actualiza la conversación. */
export async function registrarSaliente(
  conversacionId: string,
  envio: EnvioResultado,
  datos: DatosSaliente,
  enviadoPor: string | null
): Promise<void> {
  const db = createAdminClient();
  const ahora = new Date().toISOString();
  await db.from("wa_mensajes").insert({
    conversacion_id: conversacionId,
    direccion: "saliente",
    contenido: datos.contenido,
    wamid: envio.wamid ?? null,
    estado: envio.ok ? "sent" : "failed",
    error_codigo: envio.errorCodigo ?? null,
    error_mensaje: envio.errorMensaje ?? null,
    media_tipo: datos.mediaTipo ?? null,
    media_id: datos.mediaId ?? null,
    mime_type: datos.mimeType ?? null,
    nombre_archivo: datos.nombreArchivo ?? null,
    media_path: datos.mediaPath ?? null,
    plantilla: datos.plantilla ?? null,
    enviado_por: enviadoPor,
    timestamp: ahora,
  });
  await db.from("wa_conversaciones").update({ ultimo_mensaje_at: ahora }).eq("id", conversacionId);
}

/** Error de Meta en lenguaje claro (131047 = ventana de 24h cerrada). */
export function mensajeDeError(envio: EnvioResultado): string {
  if (envio.errorCodigo === 131047) {
    return "La ventana de 24 horas está cerrada: usa una plantilla o espera a que el contacto escriba.";
  }
  if (envio.errorCodigo === 132001) {
    return "Meta no encuentra esa plantilla en ese idioma; revisa que esté aprobada.";
  }
  if (envio.errorCodigo === 131026) {
    return "Ese número no tiene WhatsApp o no puede recibir mensajes.";
  }
  return envio.errorMensaje ?? "Meta rechazó el envío.";
}
