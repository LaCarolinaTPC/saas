import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditarOperacion } from "@/lib/incapacidades/auditoria";
import {
  ADJUNTO_LIMITE_BYTES,
  ADJUNTO_MIMES,
  RELACIONADO_TIPOS,
  guardarAdjunto,
  type RelacionadoTipo,
} from "@/lib/incapacidades/adjuntos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Carga de un soporte del expediente. Va por ruta y no por server action
 * porque las actions tienen un cuerpo máximo de 1 MB por defecto y aquí viaja
 * el PDF o la foto.
 *
 * multipart/form-data: expediente_id, relacionado_tipo, archivo (obligatorios);
 * relacionado_id (opcional). El archivo queda en el bucket privado
 * `incapacidades` y la fila en `incapacidad_adjuntos`.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) {
    return NextResponse.json({ ok: false, error: "Sin permiso para el módulo de incapacidades." }, { status: 403 });
  }
  if (!perms.puedeEditar) {
    return NextResponse.json({ ok: false, error: "Tu tipo de usuario es de solo consulta." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el formulario." }, { status: 400 });
  }
  const expedienteId = String(form.get("expediente_id") ?? "").trim();
  const relacionadoTipo = String(form.get("relacionado_tipo") ?? "expediente").trim();
  const relacionadoId = String(form.get("relacionado_id") ?? "").trim() || null;
  if (!UUID_RE.test(expedienteId)) return NextResponse.json({ ok: false, error: "Expediente no válido." }, { status: 400 });
  if (!(RELACIONADO_TIPOS as readonly string[]).includes(relacionadoTipo)) {
    return NextResponse.json({ ok: false, error: "Tipo de soporte no válido." }, { status: 400 });
  }
  if (relacionadoId && !UUID_RE.test(relacionadoId)) return NextResponse.json({ ok: false, error: "Referencia no válida." }, { status: 400 });

  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ ok: false, error: "Adjunta un archivo." }, { status: 400 });
  }
  const mime = (archivo.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!ADJUNTO_MIMES[mime]) {
    return NextResponse.json({ ok: false, error: "Solo se aceptan PDF o imágenes JPG, PNG o WebP." }, { status: 415 });
  }
  if (archivo.size > ADJUNTO_LIMITE_BYTES) {
    return NextResponse.json({ ok: false, error: `El archivo supera los ${Math.round(ADJUNTO_LIMITE_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }

  const db = createAdminClient();
  const { data: exp, error } = await db.from("incapacidad_expedientes").select("id, estado, eliminado_at").eq("id", expedienteId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const e = exp as { id: string; estado: string; eliminado_at: string | null } | null;
  if (!e || e.eliminado_at) return NextResponse.json({ ok: false, error: "El expediente no existe." }, { status: 404 });

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const actor = { email: perms.userEmail, rol: perms.userType };
    const id = await guardarAdjunto({
      expedienteId,
      relacionadoTipo: relacionadoTipo as RelacionadoTipo,
      relacionadoId,
      nombre: archivo.name || `soporte.${ADJUNTO_MIMES[mime]}`,
      mime,
      buffer,
    }, actor);
    await auditarOperacion({ accion: "adjunto_subido", expedienteId, rol: perms.userType, valorNuevo: `${relacionadoTipo} · ${archivo.name}`, detalle: { adjunto_id: id, mime, tamano: archivo.size } });
    revalidatePath(`/incapacidades/${expedienteId}`);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
