import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { hoyBogota } from "@/lib/operativo/constants";
import { cargarArchivos, prepararArchivos, type ArchivoSubido } from "@/lib/mantenimiento/combustible-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Un archivo diario pesa ~50 KB; 5 MB deja margen a uno con formato. */
const LIMITE_BYTES = 5 * 1024 * 1024;
/** Un mes de archivos diarios en una sola subida. */
const MAX_ARCHIVOS = 31;

/**
 * Archivos diarios de combustible del proveedor. Va por ruta y no por server
 * action porque viajan archivos. multipart/form-data:
 *   archivos  uno o varios .xlsx
 *   accion    "previsualizar" (no escribe nada) | "cargar"
 * La carga vuelve a leer y clasificar todo: la confirmación llega en otra
 * petición y otro usuario pudo subir los mismos días entre una y otra.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "combustible")) {
    return NextResponse.json({ ok: false, error: "Tu tipo de usuario no tiene acceso a Combustible." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el formulario." }, { status: 400 });
  }
  const accion = String(form.get("accion") ?? "previsualizar");
  if (accion !== "previsualizar" && accion !== "cargar") {
    return NextResponse.json({ ok: false, error: "Acción no válida." }, { status: 400 });
  }
  if (accion === "cargar" && !puedeEditarEn(perms, "combustible")) {
    return NextResponse.json({ ok: false, error: "Tu tipo de usuario es de solo consulta." }, { status: 403 });
  }

  const entradas = form.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0);
  if (entradas.length === 0) {
    return NextResponse.json({ ok: false, error: "Adjunta al menos un archivo Excel del proveedor." }, { status: 400 });
  }
  if (entradas.length > MAX_ARCHIVOS) {
    return NextResponse.json({ ok: false, error: `Sube máximo ${MAX_ARCHIVOS} archivos a la vez.` }, { status: 400 });
  }
  const noExcel = entradas.find((a) => !/\.xlsx?$/i.test(a.name));
  if (noExcel) {
    return NextResponse.json({ ok: false, error: `«${noExcel.name}» no es un Excel (.xlsx).` }, { status: 400 });
  }
  const grande = entradas.find((a) => a.size > LIMITE_BYTES);
  if (grande) {
    return NextResponse.json({ ok: false, error: `«${grande.name}» supera los 5 MB.` }, { status: 413 });
  }

  try {
    const archivos: ArchivoSubido[] = await Promise.all(
      entradas.map(async (a) => ({ nombre: a.name || "archivo.xlsx", datos: Buffer.from(await a.arrayBuffer()) })),
    );
    const hoy = hoyBogota();
    if (accion === "previsualizar") {
      const preparados = await prepararArchivos(archivos, hoy);
      // Los tanqueos no viajan de vuelta: la confirmación reenvía los archivos.
      return NextResponse.json({ ok: true, archivos: preparados.map((p) => p.resumen) });
    }
    const cargas = await cargarArchivos(archivos, hoy, perms.userEmail ?? null);
    revalidatePath("/mantenimiento/combustible");
    revalidatePath("/mantenimiento/combustible/historial");
    return NextResponse.json({ ok: true, cargas });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[combustible]", e);
    return NextResponse.json({ ok: false, error: mensaje }, { status: 400 });
  }
}
