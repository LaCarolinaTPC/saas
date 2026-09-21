import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cargarArchivo, previsualizarArchivo } from "@/lib/financiera/cargar-contable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Un año de la flota son ~1.900 filas; 5 MB deja margen a un Excel con formato. */
const LIMITE_BYTES = 5 * 1024 * 1024;

/**
 * Archivo contable de Financiera (plan, 6.6). Va por ruta y no por server
 * action porque viaja un archivo. multipart/form-data:
 *   archivo  CSV o .xlsx
 *   accion   "previsualizar" (no escribe nada) | "cargar"
 * La carga vuelve a validar el archivo completo: la confirmación llega en otra
 * petición y el estado de los períodos pudo cambiar entre una y otra.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "financiera", "fin_datos")) {
    return NextResponse.json({ ok: false, error: "Tu tipo de usuario no puede cargar datos de Financiera." }, { status: 403 });
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
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ ok: false, error: "Adjunta el archivo CSV o Excel." }, { status: 400 });
  }
  if (archivo.size > LIMITE_BYTES) {
    return NextResponse.json({ ok: false, error: "El archivo supera los 5 MB." }, { status: 413 });
  }

  try {
    const datos = Buffer.from(await archivo.arrayBuffer());
    const nombre = archivo.name || "archivo";
    if (accion === "previsualizar") {
      const r = await previsualizarArchivo(nombre, datos);
      // Las filas válidas no viajan de vuelta: la confirmación reenvía el archivo.
      return NextResponse.json({
        ok: true,
        previsualizacion: {
          errorArchivo: r.errorArchivo,
          validas: r.validas.length,
          rechazadas: r.rechazadas.slice(0, 200),
          rechazadasTotal: r.rechazadas.length,
          celdasVacias: r.celdasVacias,
          porPeriodo: r.porPeriodo,
          totalFilas: r.totalFilas,
          archivo: nombre,
        },
      });
    }
    const r = await cargarArchivo(nombre, datos, perms.userEmail ?? null);
    revalidatePath("/financiera/flota/datos");
    revalidatePath("/financiera");
    return NextResponse.json({ ok: true, carga: r });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[financiera contable]", e);
    return NextResponse.json({ ok: false, error: mensaje }, { status: 400 });
  }
}
