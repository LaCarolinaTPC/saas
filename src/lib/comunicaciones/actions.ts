"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { enviarTexto, probarCredenciales } from "./whatsapp";
import { cifrar } from "./cifrado";

/**
 * Envía un texto a la conversación y lo registra. Devuelve un error legible
 * (p. ej. la ventana de 24h cerrada, código 131047 de Meta) sin lanzar.
 */
export async function enviarMensaje(
  conversacionId: string,
  texto: string
): Promise<{ ok: boolean; error?: string }> {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "Mensaje vacío." };
  if (limpio.length > 4096) return { ok: false, error: "Máximo 4096 caracteres." };

  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !perms.modules.includes("comunicaciones")) {
    return { ok: false, error: "Sin permiso para el módulo Comunicaciones." };
  }

  const db = createAdminClient();
  const { data: conv } = await db
    .from("wa_conversaciones")
    .select("id, wa_contactos(telefono)")
    .eq("id", conversacionId)
    .maybeSingle();
  const contacto = (Array.isArray(conv?.wa_contactos) ? conv?.wa_contactos[0] : conv?.wa_contactos) as
    | { telefono: string }
    | null;
  if (!contacto?.telefono) return { ok: false, error: "Conversación no encontrada." };

  const envio = await enviarTexto(contacto.telefono, limpio);

  const ahora = new Date().toISOString();
  await db.from("wa_mensajes").insert({
    conversacion_id: conversacionId,
    direccion: "saliente",
    contenido: limpio,
    wamid: envio.wamid ?? null,
    estado: envio.ok ? "sent" : "failed",
    error_codigo: envio.errorCodigo ?? null,
    error_mensaje: envio.errorMensaje ?? null,
    enviado_por: perms.userEmail ?? null,
    timestamp: ahora,
  });
  await db
    .from("wa_conversaciones")
    .update({ ultimo_mensaje_at: ahora })
    .eq("id", conversacionId);

  revalidatePath("/comunicaciones");
  if (!envio.ok) {
    // 131047: ventana de 24h cerrada — el error más común, en lenguaje claro.
    const detalle =
      envio.errorCodigo === 131047
        ? "La ventana de 24 horas está cerrada: el contacto debe escribir primero (o usar una plantilla, próximamente)."
        : envio.errorMensaje ?? "Meta rechazó el envío.";
    return { ok: false, error: detalle };
  }
  return { ok: true };
}

/**
 * Guarda las credenciales del canal (solo administradores). Antes de guardar
 * valida el token contra Meta; si el token llega vacío se conserva el actual.
 */
export async function guardarCanal(input: {
  phoneNumberId: string;
  wabaId?: string;
  accessToken?: string;
  appSecret?: string;
  verifyToken: string;
}): Promise<{ ok: boolean; error?: string; numero?: string; nombre?: string }> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) return { ok: false, error: "Solo el administrador puede configurar el canal." };

  const phoneNumberId = input.phoneNumberId.trim();
  const verifyToken = input.verifyToken.trim();
  if (!phoneNumberId || !verifyToken) {
    return { ok: false, error: "Phone number ID y verify token son obligatorios." };
  }

  const db = createAdminClient();
  const { data: actual } = await db.from("wa_canal").select("access_token, app_secret").eq("id", 1).maybeSingle();

  const tokenNuevo = input.accessToken?.trim();
  if (!tokenNuevo && !actual?.access_token) {
    return { ok: false, error: "El access token es obligatorio la primera vez." };
  }

  // Validar contra Meta antes de guardar (con el token nuevo o el vigente).
  const { descifrar } = await import("./cifrado");
  const tokenParaProbar = tokenNuevo || descifrar(actual!.access_token as string);
  const prueba = await probarCredenciales(tokenParaProbar, phoneNumberId);
  if (!prueba.ok) {
    return { ok: false, error: `Meta rechazó las credenciales: ${prueba.error}` };
  }

  const { error } = await db.from("wa_canal").upsert({
    id: 1,
    phone_number_id: phoneNumberId,
    waba_id: input.wabaId?.trim() || null,
    ...(tokenNuevo ? { access_token: cifrar(tokenNuevo) } : {}),
    ...(input.appSecret?.trim() ? { app_secret: cifrar(input.appSecret.trim()) } : {}),
    verify_token: verifyToken,
    numero_mostrado: prueba.numero ?? null,
    actualizado_por: perms.userEmail ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/comunicaciones/configuracion");
  revalidatePath("/comunicaciones");
  return { ok: true, numero: prueba.numero, nombre: prueba.nombre };
}
