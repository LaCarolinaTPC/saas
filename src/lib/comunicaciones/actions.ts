"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import {
  contarVariables,
  enviarPlantilla,
  enviarTexto,
  listarPlantillas,
  probarCredenciales,
  renderizarPlantilla,
  type Plantilla,
} from "./whatsapp";
import { cifrar } from "./cifrado";
import {
  mensajeDeError,
  normalizarTelefono,
  obtenerOCrearConversacion,
  registrarSaliente,
  telefonoDeConversacion,
} from "./registro";

async function permisoComunicaciones(): Promise<{ ok: true; email: string | null } | { ok: false; error: string }> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !perms.modules.includes("comunicaciones")) {
    return { ok: false, error: "Sin permiso para el módulo Comunicaciones." };
  }
  return { ok: true, email: perms.userEmail ?? null };
}

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

  const permiso = await permisoComunicaciones();
  if (!permiso.ok) return permiso;

  const telefono = await telefonoDeConversacion(conversacionId);
  if (!telefono) return { ok: false, error: "Conversación no encontrada." };

  const envio = await enviarTexto(telefono, limpio);
  await registrarSaliente(conversacionId, envio, { contenido: limpio }, permiso.email);

  revalidatePath("/comunicaciones");
  if (!envio.ok) return { ok: false, error: mensajeDeError(envio) };
  return { ok: true };
}

/** Plantillas aprobadas del WABA, para el selector de la bandeja. */
export async function obtenerPlantillas(): Promise<
  { ok: true; plantillas: Plantilla[] } | { ok: false; error: string }
> {
  const permiso = await permisoComunicaciones();
  if (!permiso.ok) return permiso;
  try {
    return await listarPlantillas();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudieron leer las plantillas." };
  }
}

/**
 * Envía una plantilla a una conversación existente o a un teléfono nuevo
 * (crea contacto y conversación). Es la única forma de escribir fuera de la
 * ventana de 24h; la ventana no se abre hasta que el contacto responda.
 */
export async function enviarMensajePlantilla(input: {
  conversacionId?: string;
  telefono?: string;
  nombreContacto?: string;
  plantilla: Plantilla;
  encabezado: string[];
  cuerpo: string[];
}): Promise<{ ok: boolean; error?: string; conversacionId?: string }> {
  const permiso = await permisoComunicaciones();
  if (!permiso.ok) return permiso;

  let conversacionId = input.conversacionId ?? null;
  let telefono: string | null = null;

  if (conversacionId) {
    telefono = await telefonoDeConversacion(conversacionId);
    if (!telefono) return { ok: false, error: "Conversación no encontrada." };
  } else {
    telefono = normalizarTelefono(input.telefono ?? "");
    if (!telefono) return { ok: false, error: "Teléfono inválido: usa el celular de 10 dígitos o el número internacional." };
    conversacionId = await obtenerOCrearConversacion(telefono, input.nombreContacto?.trim() || null);
    if (!conversacionId) return { ok: false, error: "No se pudo crear la conversación." };
  }

  const cabecera = input.plantilla.componentes.find((c) => c.type === "HEADER");
  const cuerpoComp = input.plantilla.componentes.find((c) => c.type === "BODY");
  if (cabecera && cabecera.format && cabecera.format !== "TEXT") {
    return { ok: false, error: "Esta plantilla lleva un encabezado con archivo; por ahora solo se envían plantillas de texto." };
  }
  const encabezado = input.encabezado.map((v) => v.trim()).slice(0, contarVariables(cabecera?.text));
  const cuerpo = input.cuerpo.map((v) => v.trim()).slice(0, contarVariables(cuerpoComp?.text));
  if (encabezado.some((v) => !v) || cuerpo.some((v) => !v)) {
    return { ok: false, error: "Completa todas las variables de la plantilla." };
  }

  const envio = await enviarPlantilla(telefono, {
    nombre: input.plantilla.nombre,
    idioma: input.plantilla.idioma,
    encabezado,
    cuerpo,
  });

  const textoCabecera = cabecera?.text ? renderizarPlantilla(cabecera.text, encabezado) : "";
  const textoCuerpo = cuerpoComp?.text ? renderizarPlantilla(cuerpoComp.text, cuerpo) : "";
  const contenido = [textoCabecera, textoCuerpo].filter(Boolean).join("\n\n") || `[Plantilla ${input.plantilla.nombre}]`;
  await registrarSaliente(
    conversacionId,
    envio,
    { contenido, plantilla: input.plantilla.nombre },
    permiso.email
  );

  revalidatePath("/comunicaciones");
  if (!envio.ok) return { ok: false, error: mensajeDeError(envio), conversacionId };
  return { ok: true, conversacionId };
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

/**
 * Guarda en la conversación el proceso de contratación creado desde el panel
 * del contacto, para mostrar la etiqueta "Candidato" y enlazar a su ficha.
 */
export async function vincularProcesoAConversacion(
  conversacionId: string,
  procesoId: string
): Promise<{ ok: boolean; error?: string }> {
  const permiso = await permisoComunicaciones();
  if (!permiso.ok) return permiso;
  const db = createAdminClient();
  const { error } = await db
    .from("wa_conversaciones")
    .update({ proceso_id: procesoId })
    .eq("id", conversacionId);
  if (error) return { ok: false, error: `No se pudo vincular el candidato: ${error.message}` };
  revalidatePath("/comunicaciones");
  return { ok: true };
}
