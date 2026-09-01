/**
 * Cliente de la WhatsApp Business Cloud API (Meta) — portado de Varylo y
 * recortado a uso interno: un solo número de la empresa, credenciales en
 * variables de entorno.
 *
 *   WHATSAPP_ACCESS_TOKEN    token permanente del sistema (Meta Business)
 *   WHATSAPP_PHONE_NUMBER_ID id del número emisor
 *   WHATSAPP_VERIFY_TOKEN    token propio para la verificación del webhook
 *   META_APP_SECRET          secreto de la app (firma X-Hub-Signature-256)
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export function getWaConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error(
      "Faltan WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID en el entorno."
    );
  }
  return { token, phoneNumberId };
}

export interface EnvioResultado {
  ok: boolean;
  wamid?: string;
  errorCodigo?: number;
  errorMensaje?: string;
}

/** Envía un mensaje de texto libre (requiere ventana de 24h abierta). */
export async function enviarTexto(telefono: string, texto: string): Promise<EnvioResultado> {
  const { token, phoneNumberId } = getWaConfig();
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
    const { token, phoneNumberId } = getWaConfig();
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
