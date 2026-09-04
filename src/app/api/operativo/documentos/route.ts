import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { eliminarArchivo, guardarArchivo } from "@/lib/operativo/archivos";
import { ARCHIVO_LIMITE_BYTES, ARCHIVO_MIMES } from "@/lib/operativo/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Carga de un documento del vehículo (SOAT, técnico-mecánica, póliza, tarjeta
 * de operación). Va por ruta y no por server action porque las actions tienen
 * un cuerpo máximo de 1 MB por defecto y aquí viaja el PDF.
 *
 * multipart/form-data: codigo, tipo, fecha_vencimiento (obligatorios);
 * numero, entidad, fecha_expedicion, observaciones y archivo (opcionales).
 * El archivo se guarda en el bucket privado "operativo" y la fila queda en
 * `operativo_vehiculo_documentos`; si la fila falla, el archivo se borra.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !perms.modules.includes("operativo")) {
    return NextResponse.json({ ok: false, error: "Sin permiso para el módulo Operativo." }, { status: 403 });
  }
  if (!perms.isAdmin && !perms.puedeEditar) {
    return NextResponse.json({ ok: false, error: "Tu tipo de usuario es de solo consulta." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el formulario." }, { status: 400 });
  }

  const texto = (k: string, max: number) => {
    const v = String(form.get(k) ?? "").trim();
    if (v.length > max) throw new Error(`El campo ${k} no puede pasar de ${max} caracteres.`);
    return v || null;
  };
  let codigo: string, tipo: string, fechaVencimiento: string;
  let numero: string | null, entidad: string | null, fechaExpedicion: string | null, observaciones: string | null;
  try {
    codigo = String(form.get("codigo") ?? "").trim();
    tipo = String(form.get("tipo") ?? "").trim();
    fechaVencimiento = String(form.get("fecha_vencimiento") ?? "").trim();
    numero = texto("numero", 120);
    entidad = texto("entidad", 120);
    fechaExpedicion = texto("fecha_expedicion", 10);
    observaciones = texto("observaciones", 1000);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  if (!/^[A-Za-z0-9-]{1,20}$/.test(codigo)) {
    return NextResponse.json({ ok: false, error: "Código de vehículo no válido." }, { status: 400 });
  }
  if (!/^[a-z0-9_]{1,40}$/.test(tipo)) {
    return NextResponse.json({ ok: false, error: "Tipo de documento no válido." }, { status: 400 });
  }
  if (!FECHA_RE.test(fechaVencimiento)) {
    return NextResponse.json({ ok: false, error: "Indica la fecha de vencimiento (AAAA-MM-DD)." }, { status: 400 });
  }
  if (fechaExpedicion && !FECHA_RE.test(fechaExpedicion)) {
    return NextResponse.json({ ok: false, error: "Fecha de expedición no válida." }, { status: 400 });
  }
  if (fechaExpedicion && fechaExpedicion > fechaVencimiento) {
    return NextResponse.json({ ok: false, error: "La expedición no puede ser después del vencimiento." }, { status: 400 });
  }

  const archivo = form.get("archivo");
  let buffer: Buffer | null = null;
  let mimeType: string | null = null;
  let nombreArchivo: string | null = null;
  if (archivo instanceof File && archivo.size > 0) {
    mimeType = (archivo.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
    if (!ARCHIVO_MIMES[mimeType]) {
      return NextResponse.json(
        { ok: false, error: "Solo se aceptan PDF o imágenes JPG, PNG o WebP." },
        { status: 415 }
      );
    }
    if (archivo.size > ARCHIVO_LIMITE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `El archivo supera los ${Math.round(ARCHIVO_LIMITE_BYTES / 1024 / 1024)} MB. Comprime el PDF o reduce la foto.` },
        { status: 413 }
      );
    }
    buffer = Buffer.from(await archivo.arrayBuffer());
    nombreArchivo = archivo.name || `documento.${ARCHIVO_MIMES[mimeType]}`;
  }

  const db = createAdminClient();
  const [{ data: vehiculo }, { data: tipoCat }] = await Promise.all([
    db.from("vehiculos").select("codigo, estado").eq("codigo", codigo).maybeSingle(),
    db.from("operativo_documento_tipos").select("key, activo").eq("key", tipo).maybeSingle(),
  ]);
  if (!vehiculo) {
    return NextResponse.json({ ok: false, error: "El vehículo no existe en el maestro de Gestivo." }, { status: 404 });
  }
  if (vehiculo.estado !== 1) {
    return NextResponse.json({ ok: false, error: "El vehículo no está activo en el maestro." }, { status: 400 });
  }
  if (!tipoCat || !tipoCat.activo) {
    return NextResponse.json({ ok: false, error: "El tipo de documento no existe o está inactivo." }, { status: 400 });
  }

  let ruta: string | null = null;
  if (buffer && mimeType) {
    ruta = await guardarArchivo(codigo, tipo, buffer, mimeType);
    if (!ruta) {
      return NextResponse.json({ ok: false, error: "No se pudo guardar el archivo en Storage." }, { status: 500 });
    }
  }

  const { data, error } = await db
    .from("operativo_vehiculo_documentos")
    .insert({
      codigo_vehiculo: codigo,
      tipo,
      numero,
      entidad,
      fecha_expedicion: fechaExpedicion,
      fecha_vencimiento: fechaVencimiento,
      archivo_ruta: ruta,
      archivo_nombre: nombreArchivo,
      archivo_mime: mimeType,
      archivo_tamano: buffer?.length ?? null,
      observaciones,
      created_by: perms.userId,
      created_by_email: perms.userEmail,
    })
    .select("id")
    .single();
  if (error) {
    // Sin fila no debe quedar el archivo huérfano.
    if (ruta) await eliminarArchivo(ruta);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  revalidatePath("/operativo");
  revalidatePath("/operativo/vehiculos");
  revalidatePath(`/operativo/vehiculos/${codigo}`);
  return NextResponse.json({ ok: true, id: data.id });
}
