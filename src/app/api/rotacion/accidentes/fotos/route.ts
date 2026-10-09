import { NextRequest, NextResponse } from "next/server";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
// El navegador reduce la foto antes de subirla; esto solo frena un archivo
// sin comprimir que se cuele (Vercel corta el cuerpo en 4,5 MB).
const LIMITE_BYTES = 4 * 1024 * 1024;

/**
 * Sube una foto del accidente al bucket privado `accidentes` (carpeta fotos/)
 * y devuelve su ruta. Va por ruta y no por server action porque las actions
 * tienen un cuerpo máximo de 1 MB. La ruta se guarda en `accidentes.fotos`
 * al guardar el reporte o al agregar fotos desde el detalle.
 *
 * multipart/form-data: foto (obligatorio).
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "accidentabilidad")) {
    return NextResponse.json({ error: "Sin acceso a Accidentabilidad." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    return NextResponse.json({ error: "No se recibió la foto." }, { status: 400 });
  }
  const ext = MIMES[foto.type];
  if (!ext) {
    return NextResponse.json({ error: "Solo se aceptan fotos JPG, PNG o WebP." }, { status: 400 });
  }
  if (foto.size > LIMITE_BYTES) {
    return NextResponse.json({ error: "La foto pesa más de 4 MB." }, { status: 400 });
  }

  const path = `fotos/${crypto.randomUUID()}.${ext}`;
  const { error } = await createAdminClient()
    .storage.from("accidentes")
    .upload(path, await foto.arrayBuffer(), { contentType: foto.type, upsert: false });
  if (error) {
    return NextResponse.json({ error: `No se pudo guardar la foto: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ path });
}
