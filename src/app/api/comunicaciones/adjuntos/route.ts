import { NextRequest, NextResponse } from "next/server";
import { getCurrentPermissions } from "@/lib/permissions";
import { enviarMedio, subirMedioAMeta } from "@/lib/comunicaciones/whatsapp";
import { guardarEnStorage, LIMITES, tipoPorMime } from "@/lib/comunicaciones/medios";
import { mensajeDeError, registrarSaliente, telefonoDeConversacion } from "@/lib/comunicaciones/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Envío de adjuntos desde la bandeja. Va por ruta y no por server action
 * porque las actions tienen un cuerpo máximo de 1 MB por defecto.
 *
 * multipart/form-data: conversacionId, archivo, texto (pie opcional).
 * El archivo se guarda en Storage (copia nuestra) y se sube a Meta para
 * enviarlo por id; el mensaje queda registrado aunque Meta lo rechace.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !perms.modules.includes("comunicaciones")) {
    return NextResponse.json({ ok: false, error: "Sin permiso para el módulo Comunicaciones." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el archivo." }, { status: 400 });
  }

  const conversacionId = String(form.get("conversacionId") ?? "");
  const texto = String(form.get("texto") ?? "").trim();
  const archivo = form.get("archivo");
  if (!conversacionId || !(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ ok: false, error: "Falta el archivo o la conversación." }, { status: 400 });
  }

  const mimeType = archivo.type || "application/octet-stream";
  const tipo = tipoPorMime(mimeType);
  if (archivo.size > LIMITES[tipo]) {
    const mb = Math.round(LIMITES[tipo] / 1024 / 1024);
    return NextResponse.json(
      { ok: false, error: `El archivo supera el máximo de ${mb} MB que acepta WhatsApp para este tipo.` },
      { status: 413 }
    );
  }
  if (texto.length > 1024) {
    return NextResponse.json({ ok: false, error: "El texto del adjunto no puede superar 1024 caracteres." }, { status: 400 });
  }

  const telefono = await telefonoDeConversacion(conversacionId);
  if (!telefono) {
    return NextResponse.json({ ok: false, error: "Conversación no encontrada." }, { status: 404 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const nombreArchivo = archivo.name || `adjunto.${mimeType.split("/")[1] ?? "bin"}`;

  const mediaPath = await guardarEnStorage(conversacionId, buffer, mimeType, nombreArchivo);
  if (!mediaPath) {
    return NextResponse.json({ ok: false, error: "No se pudo guardar el archivo en Storage." }, { status: 500 });
  }

  const subida = await subirMedioAMeta(buffer, mimeType, nombreArchivo);
  const envio = subida.ok
    ? await enviarMedio(telefono, {
        mediaId: subida.mediaId,
        tipo,
        caption: tipo === "audio" ? undefined : texto,
        nombreArchivo,
      })
    : { ok: false as const, errorMensaje: `Meta no aceptó el archivo: ${subida.error}` };

  await registrarSaliente(
    conversacionId,
    envio,
    {
      contenido: texto,
      mediaTipo: tipo,
      mediaId: subida.ok ? subida.mediaId : null,
      mimeType,
      nombreArchivo,
      mediaPath,
    },
    perms.userEmail ?? null
  );

  if (!envio.ok) return NextResponse.json({ ok: false, error: mensajeDeError(envio) });
  return NextResponse.json({ ok: true });
}
