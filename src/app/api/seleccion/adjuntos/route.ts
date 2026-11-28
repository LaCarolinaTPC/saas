import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { actorUsuario, registrarEvento } from "@/lib/contratacion/servidor";
import { deQuienEsElTexto } from "@/lib/seleccion/documento-de-quien";
import { ADJUNTO_LIMITE_BYTES, ADJUNTO_MIMES, TIPOS_FIJOS, guardarAdjuntoSeleccion, itemsCarpeta, tipoDeItem } from "@/lib/seleccion/carpeta-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Carga de un archivo del proceso de selección (carpeta, exámenes). Va por
 * ruta y no por server action porque las actions tienen un cuerpo máximo de
 * 1 MB y aquí viaja el PDF o la foto (entrega 3).
 *
 * multipart/form-data: proceso_id, tipo (un ítem de la carpeta como
 * «carpeta:hoja-de-vida», o examen_f1, examen_f2, otro) y archivo. Queda en el
 * bucket privado `seleccion` y la fila en `seleccion_adjuntos`.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !puedeEditarEn(perms, "candidatos")) {
    return NextResponse.json({ ok: false, error: "No tienes permiso para subir archivos al proceso." }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el formulario." }, { status: 400 });
  }
  const procesoId = String(form.get("proceso_id") ?? "").trim();
  const tipo = String(form.get("tipo") ?? "").trim();
  if (!UUID_RE.test(procesoId)) return NextResponse.json({ ok: false, error: "Proceso no válido." }, { status: 400 });
  const tiposValidos = new Set([...Object.keys(TIPOS_FIJOS), ...(await itemsCarpeta()).map(tipoDeItem)]);
  if (!tiposValidos.has(tipo)) return NextResponse.json({ ok: false, error: "Tipo de archivo no válido." }, { status: 400 });

  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ ok: false, error: "Adjunta un archivo." }, { status: 400 });
  const mime = (archivo.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!ADJUNTO_MIMES[mime]) return NextResponse.json({ ok: false, error: "Solo se aceptan PDF o imágenes JPG, PNG o WebP." }, { status: 415 });
  if (archivo.size > ADJUNTO_LIMITE_BYTES) {
    return NextResponse.json({ ok: false, error: `El archivo supera los ${Math.round(ADJUNTO_LIMITE_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }

  const { data: p, error } = await createAdminClient().from("procesos_contratacion").select("id, nombre, cedula").eq("id", procesoId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!p) return NextResponse.json({ ok: false, error: "El proceso no existe." }, { status: 404 });

  const buffer = Buffer.from(await archivo.arrayBuffer());
  // 27-nov-2026: ¿el PDF es del aspirante? Si trae otra cédula u otro nombre, se pide confirmar antes de guardarlo.
  const confirmado = String(form.get("confirmar") ?? "") === "1";
  let deOtro: string | null = null;
  if (mime === "application/pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const { text } = await extractText(await getDocumentProxy(new Uint8Array(buffer)), { mergePages: true });
      const r = deQuienEsElTexto(String(text), { nombre: (p.nombre as string | null) ?? null, cedula: (p.cedula as string | null) ?? null });
      if (r.estado === "otro") deOtro = r.motivo;
    } catch {
      // Un PDF que no se deja leer se guarda igual: lo revisa una persona.
    }
  }
  if (deOtro && !confirmado) {
    return NextResponse.json({ ok: false, confirmar: true, error: `¿Es de otra persona? ${deOtro}` }, { status: 409 });
  }

  try {
    const actor = actorUsuario(perms);
    const id = await guardarAdjuntoSeleccion({ procesoId, tipo, nombre: archivo.name || `archivo.${ADJUNTO_MIMES[mime]}`, mime, buffer }, actor);
    if (deOtro) await registrarEvento(procesoId, { tipo: "carpeta", detalle: { archivo: archivo.name, tipo, subido_aunque_no_coincide: deOtro } }, actor);
    revalidatePath("/candidatos");
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
