/**
 * Cliente de la WhatsApp Business Cloud API (Meta) — portado de Varylo y
 * recortado a uso interno: un solo número de la empresa.
 *
 * Las credenciales se registran desde Comunicaciones → Configuración y viven
 * en la tabla wa_canal (secretos cifrados); las variables de entorno
 * WHATSAPP_* / META_APP_SECRET quedan como respaldo si la tabla está vacía.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "./cifrado";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface CanalConfig {
  token: string;
  phoneNumberId: string;
  wabaId: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  numeroMostrado: string | null;
  origen: "db" | "env";
}

export async function getCanal(): Promise<CanalConfig | null> {
  const db = createAdminClient();
  const { data } = await db.from("wa_canal").select("*").eq("id", 1).maybeSingle();
  if (data?.access_token && data?.phone_number_id) {
    return {
      token: descifrar(data.access_token as string),
      phoneNumberId: data.phone_number_id as string,
      wabaId: (data.waba_id as string) ?? null,
      appSecret: data.app_secret ? descifrar(data.app_secret as string) : null,
      verifyToken: (data.verify_token as string) ?? null,
      numeroMostrado: (data.numero_mostrado as string) ?? null,
      origen: "db",
    };
  }
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (token && phoneNumberId) {
    return {
      token,
      phoneNumberId,
      wabaId: process.env.WHATSAPP_WABA_ID ?? null,
      appSecret: process.env.META_APP_SECRET ?? null,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? null,
      numeroMostrado: null,
      origen: "env",
    };
  }
  return null;
}

async function getCanalObligatorio(): Promise<CanalConfig> {
  const canal = await getCanal();
  if (!canal) {
    throw new Error("El canal de WhatsApp no está configurado (Comunicaciones → Configuración).");
  }
  return canal;
}

export interface EnvioResultado {
  ok: boolean;
  wamid?: string;
  errorCodigo?: number;
  errorMensaje?: string;
}

/** Envía un mensaje de texto libre (requiere ventana de 24h abierta). */
export async function enviarTexto(telefono: string, texto: string): Promise<EnvioResultado> {
  const { token, phoneNumberId } = await getCanalObligatorio();
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: telefono,
      type: "text",
      text: { preview_url: true, body: texto },
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { code?: number; message?: string };
  };
  if (!res.ok || !j.messages?.[0]?.id) {
    return {
      ok: false,
      errorCodigo: j.error?.code,
      errorMensaje: j.error?.message ?? `HTTP ${res.status}`,
    };
  }
  return { ok: true, wamid: j.messages[0].id };
}

/** Chulos azules: marca un mensaje entrante como leído (no crítico). */
export async function marcarLeido(wamid: string): Promise<void> {
  try {
    const { token, phoneNumberId } = await getCanalObligatorio();
    await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: wamid,
      }),
    });
  } catch {
    // No crítico: no bloquear la recepción si falla.
  }
}

/**
 * Valida unas credenciales contra Meta consultando el propio número.
 * Devuelve el número formateado y el nombre verificado si el token sirve.
 */
export async function probarCredenciales(
  token: string,
  phoneNumberId: string
): Promise<{ ok: boolean; numero?: string; nombre?: string; error?: string }> {
  try {
    const res = await fetch(
      `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    );
    const j = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: j.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, numero: j.display_phone_number, nombre: j.verified_name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sin respuesta de Meta." };
  }
}

// ── Parsing del webhook ─────────────────────────────────────────────────────

export interface MensajeEntrante {
  wamid: string;
  telefono: string;       // del remitente, E.164 sin '+'
  nombre: string | null;  // profile.name
  timestamp: Date;
  contenido: string;
  mediaTipo: string | null;
  mediaId: string | null;
  mimeType: string | null;
  nombreArchivo: string | null;
}

export interface EstadoMensaje {
  wamid: string;
  estado: string;          // sent | delivered | read | failed
  errorCodigo: number | null;
  errorMensaje: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Extrae mensajes entrantes y actualizaciones de estado del payload del
 * webhook de Meta. La estructura (entry[].changes[].value) y el manejo por
 * tipo de mensaje vienen probados de Varylo.
 */
export function parseWebhook(body: any): {
  mensajes: MensajeEntrante[];
  estados: EstadoMensaje[];
} {
  const mensajes: MensajeEntrante[] = [];
  const estados: EstadoMensaje[] = [];

  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;

      const nombres = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c?.wa_id && c?.profile?.name) nombres.set(String(c.wa_id), String(c.profile.name));
      }

      for (const m of value.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const tipo = String(m.type ?? "text");
        let contenido = "";
        let mediaTipo: string | null = null;
        let mediaId: string | null = null;
        let mimeType: string | null = null;
        let nombreArchivo: string | null = null;

        if (tipo === "text") {
          contenido = String(m.text?.body ?? "");
        } else if (["image", "video", "audio", "document", "sticker"].includes(tipo)) {
          const media = m[tipo];
          mediaTipo = tipo;
          mediaId = media?.id ?? null;
          mimeType = media?.mime_type ?? null;
          nombreArchivo = media?.filename ?? null;
          contenido = String(media?.caption ?? "");
        } else if (tipo === "location") {
          contenido = `📍 Ubicación: ${m.location?.latitude}, ${m.location?.longitude}`;
        } else if (tipo === "contacts") {
          contenido = "[Contacto compartido]";
        } else if (tipo === "reaction") {
          contenido = `Reaccionó ${m.reaction?.emoji ?? ""}`;
        } else if (tipo === "button" || tipo === "interactive") {
          contenido = String(
            m.button?.text ?? m.interactive?.button_reply?.title ??
            m.interactive?.list_reply?.title ?? "[Respuesta interactiva]"
          );
        } else {
          contenido = `[${tipo}]`;
        }

        mensajes.push({
          wamid: String(m.id),
          telefono: String(m.from),
          nombre: nombres.get(String(m.from)) ?? null,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          contenido,
          mediaTipo,
          mediaId,
          mimeType,
          nombreArchivo,
        });
      }

      for (const s of value.statuses ?? []) {
        if (!s?.id || !s?.status) continue;
        estados.push({
          wamid: String(s.id),
          estado: String(s.status),
          errorCodigo: s.errors?.[0]?.code ?? null,
          errorMensaje: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null,
        });
      }
    }
  }
  return { mensajes, estados };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
