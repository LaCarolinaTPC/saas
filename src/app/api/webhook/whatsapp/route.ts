import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCanal, marcarLeido, parseWebhook } from "@/lib/comunicaciones/whatsapp";
import { archivarMedioDeMeta } from "@/lib/comunicaciones/medios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de la WhatsApp Cloud API (portado de Varylo, un solo canal):
 * GET = verificación de Meta; POST = mensajes entrantes y estados de entrega.
 * Siempre responde 200 a los POST válidos: Meta reintenta ante cualquier otra
 * cosa y el dedup por wamid absorbe los reintentos.
 */

function firmaValida(rawBody: Buffer, firma: string | null, secreto: string | null): boolean {
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const esperada = Buffer.from(
    `sha256=${createHmac("sha256", secreto).update(rawBody).digest("hex")}`,
    "utf8"
  );
  const recibida = Buffer.from(firma, "utf8");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const canal = await getCanal();
  if (
    sp.get("hub.mode") === "subscribe" &&
    canal?.verifyToken &&
    sp.get("hub.verify_token") === canal.verifyToken &&
    sp.get("hub.challenge")
  ) {
    return new NextResponse(sp.get("hub.challenge"), { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer());
  const canal = await getCanal();
  if (!firmaValida(rawBody, req.headers.get("x-hub-signature-256"), canal?.appSecret ?? null)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  const { mensajes, estados } = parseWebhook(body);
  const db = createAdminClient();

  for (const m of mensajes) {
    try {
      // Contacto por teléfono (actualiza el nombre si Meta lo trae).
      const { data: contacto, error: eCont } = await db
        .from("wa_contactos")
        .upsert(
          {
            telefono: m.telefono,
            ...(m.nombre ? { nombre: m.nombre } : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "telefono" }
        )
        .select("id")
        .single();
      if (eCont || !contacto) throw new Error(eCont?.message ?? "sin contacto");

      // Una conversación por contacto (índice único sobre contacto_id).
      const { data: conv, error: eConv } = await db
        .from("wa_conversaciones")
        .upsert({ contacto_id: contacto.id }, { onConflict: "contacto_id" })
        .select("id, no_leidos")
        .single();
      if (eConv || !conv) throw new Error(eConv?.message ?? "sin conversación");

      // Dedup por wamid: Meta reenvía el webhook si no confirmamos a tiempo.
      // Se comprueba antes de descargar medios para no repetir la descarga.
      const { data: previo } = await db
        .from("wa_mensajes")
        .select("id")
        .eq("wamid", m.wamid)
        .maybeSingle();
      if (previo) continue;

      // Copia local del medio: Meta lo borra a los 30 días.
      let mediaPath: string | null = null;
      let mimeType = m.mimeType;
      let nombreArchivo = m.nombreArchivo;
      if (m.mediaId) {
        const archivado = await archivarMedioDeMeta(conv.id, m.mediaId, m.nombreArchivo);
        if (archivado) {
          mediaPath = archivado.ruta;
          mimeType = archivado.mimeType;
          nombreArchivo = archivado.nombreArchivo;
        }
      }

      const { error: eMsj } = await db.from("wa_mensajes").insert({
        conversacion_id: conv.id,
        direccion: "entrante",
        contenido: m.contenido,
        wamid: m.wamid,
        media_tipo: m.mediaTipo,
        media_id: m.mediaId,
        mime_type: mimeType,
        nombre_archivo: nombreArchivo,
        media_path: mediaPath,
        timestamp: m.timestamp.toISOString(),
      });
      if (eMsj) {
        if (eMsj.code === "23505") continue; // duplicado: reintento de Meta
        throw new Error(eMsj.message);
      }

      await db
        .from("wa_conversaciones")
        .update({
          estado: "abierta",
          ultimo_entrante_at: m.timestamp.toISOString(),
          ultimo_mensaje_at: m.timestamp.toISOString(),
          no_leidos: Number(conv.no_leidos ?? 0) + 1,
        })
        .eq("id", conv.id);

      await marcarLeido(m.wamid);
    } catch (e) {
      console.error("webhook whatsapp (mensaje):", e);
    }
  }

  for (const s of estados) {
    try {
      await db
        .from("wa_mensajes")
        .update({
          estado: s.estado,
          ...(s.errorCodigo != null ? { error_codigo: s.errorCodigo } : {}),
          ...(s.errorMensaje ? { error_mensaje: s.errorMensaje } : {}),
        })
        .eq("wamid", s.wamid);
    } catch (e) {
      console.error("webhook whatsapp (estado):", e);
    }
  }

  return NextResponse.json({ ok: true });
}
