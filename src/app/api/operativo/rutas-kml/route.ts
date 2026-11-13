import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { eliminarArchivo, guardarArchivoEn } from "@/lib/operativo/archivos";
import { extensionKml, textoKml } from "@/lib/operativo/rutas-kml-archivo";
import { KML_MAX_BYTES, procesarKml } from "@/lib/operativo/rutas-kml-reglas";
import { buscarRuta, insertarVersion } from "@/lib/operativo/rutas-kml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIME = { kml: "application/vnd.google-earth.kml+xml", kmz: "application/vnd.google-earth.kmz" } as const;

/**
 * Carga del KML (o KMZ) de una ruta. Va por ruta y no por server action
 * porque las actions tienen un cuerpo máximo de 1 MB.
 *
 * multipart/form-data: ruta (nombre exacto de GEMA), archivo (obligatorios);
 * observaciones.
 * El servidor vuelve a validar el KML aunque el navegador ya mostró la vista
 * previa. El original queda en el bucket `operativo` y la versión nueva queda
 * vigente; si la fila falla, el archivo se borra.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    return NextResponse.json({ ok: false, error: "Sin permiso para el módulo Operativo." }, { status: 403 });
  }
  if (!puedeEditarEn(perms, "operativo")) {
    return NextResponse.json({ ok: false, error: "Tu tipo de usuario es de solo consulta." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el formulario." }, { status: 400 });
  }

  const ruta = String(form.get("ruta") ?? "").trim();
  if (!ruta || ruta.length > 120) {
    return NextResponse.json({ ok: false, error: "Ruta no válida." }, { status: 400 });
  }
  const observaciones = String(form.get("observaciones") ?? "").trim() || null;
  if (observaciones && observaciones.length > 500) {
    return NextResponse.json({ ok: false, error: "Las observaciones no pueden pasar de 500 caracteres." }, { status: 400 });
  }

  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ ok: false, error: "Adjunta el archivo KML o KMZ." }, { status: 400 });
  }
  const ext = extensionKml(archivo.name);
  if (!ext) {
    return NextResponse.json({ ok: false, error: "Solo se aceptan archivos .kml o .kmz." }, { status: 415 });
  }
  if (archivo.size > KML_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `El archivo supera los ${KML_MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  const { existe, id_ruta: idRuta } = await buscarRuta(ruta);
  if (!existe) {
    return NextResponse.json({ ok: false, error: "La ruta no aparece en la programación ni en el despacho de GEMA." }, { status: 404 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  let resultado;
  try {
    resultado = procesarKml(await textoKml(buffer));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `No se pudo abrir el archivo: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    );
  }
  if (!resultado.ok) return NextResponse.json({ ok: false, error: resultado.error }, { status: 400 });

  // Carpeta legible por ruta; el nombre del archivo lleva marca de tiempo, así
  // que dos rutas que solo difieren en guiones no se pisan.
  const carpeta = ruta.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "ruta";
  const archivoRuta = `rutas-kml/${carpeta}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  if (!(await guardarArchivoEn(archivoRuta, buffer, MIME[ext]))) {
    return NextResponse.json({ ok: false, error: "No se pudo guardar el archivo en Storage." }, { status: 500 });
  }

  try {
    const version = await insertarVersion({
      ruta,
      idRuta,
      archivoRuta,
      archivoNombre: archivo.name.slice(0, 200),
      archivoTamano: archivo.size,
      procesada: resultado.ruta,
      observaciones,
      userId: perms.userId,
      userEmail: perms.userEmail,
    });
    revalidatePath("/operativo/rutas");
    return NextResponse.json({ ok: true, version, advertencias: resultado.ruta.advertencias });
  } catch (e) {
    // Sin fila no debe quedar el archivo huérfano.
    await eliminarArchivo(archivoRuta);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
