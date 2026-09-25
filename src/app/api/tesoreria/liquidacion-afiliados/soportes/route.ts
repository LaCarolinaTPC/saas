import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentPermissions, canAccessSub } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { guardarSoporte, vehiculoDelAfiliadoEseDia } from "@/lib/tesoreria/soportes";
import { SOPORTE_LIMITE_BYTES, esTipoSoporte, tipoPorContenido } from "@/lib/tesoreria/soportes-reglas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Carga de UN soporte (multipart: cedula, vehiculo, fecha, tipo, concepto,
 * valor opcional, archivo). Va por ruta y no por server action por el tamaño
 * del cuerpo; un archivo por petición porque Vercel corta hacia los 4,5 MB.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "liq_afiliados_soportes")) {
    return NextResponse.json({ ok: false, error: "Sin permiso para subir soportes de afiliados." }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el formulario (¿archivo de más de 4 MB?)." }, { status: 400 });
  }
  const cedula = String(form.get("cedula") ?? "").trim();
  const vehiculo = String(form.get("vehiculo") ?? "").trim();
  const fecha = String(form.get("fecha") ?? "").trim();
  const tipo = String(form.get("tipo") ?? "").trim();
  const concepto = String(form.get("concepto") ?? "").trim();
  const valorTxt = String(form.get("valor") ?? "").replace(/[^\d]/g, "");
  const valor = valorTxt ? Number(valorTxt) : null;
  if (!/^[\w.-]{3,20}$/.test(cedula) || !/^[\w-]{1,10}$/.test(vehiculo) || !FECHA_RE.test(fecha)) {
    return NextResponse.json({ ok: false, error: "Afiliado, vehículo o fecha no válidos." }, { status: 400 });
  }
  if (!esTipoSoporte(tipo)) return NextResponse.json({ ok: false, error: "Tipo de soporte no válido." }, { status: 400 });
  if (concepto.length < 3 || concepto.length > 200) {
    return NextResponse.json({ ok: false, error: "Escriba el concepto (3 a 200 caracteres)." }, { status: 400 });
  }
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ ok: false, error: "Adjunte un archivo." }, { status: 400 });
  if (archivo.size > SOPORTE_LIMITE_BYTES) {
    return NextResponse.json({ ok: false, error: `«${archivo.name}» supera los 4 MB.` }, { status: 413 });
  }
  const buffer = Buffer.from(await archivo.arrayBuffer());
  // El tipo se decide por el contenido, no por la extensión ni por el navegador.
  const mime = tipoPorContenido(buffer.subarray(0, 16));
  if (!mime) {
    return NextResponse.json({ ok: false, error: `«${archivo.name}» no es un PDF ni una imagen JPG, PNG o WebP.` }, { status: 415 });
  }
  if (!(await vehiculoDelAfiliadoEseDia(cedula, vehiculo, fecha))) {
    return NextResponse.json({ ok: false, error: `El vehículo ${vehiculo} no figura a nombre de este afiliado el ${fecha}.` }, { status: 409 });
  }
  try {
    const id = await guardarSoporte({
      cedula, vehiculo, fecha, tipo, concepto, valor, nombre: archivo.name || "soporte", mime, buffer, actorEmail: perms.userEmail,
    });
    await logTesoreriaAudit({
      accion: "soporte_afiliado_subido", modulo: "liq_afiliados", valor,
      detalle: { soporte_id: id, cedula, vehiculo, fecha, tipo, concepto, archivo: archivo.name, tamano: archivo.size },
    });
    revalidatePath("/tesoreria/liquidacion-afiliados");
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      error: /afiliado_soportes|Bucket not found/i.test(msg) ? "Falta aplicar la migración 20260925223057 (soportes) en la base." : msg,
    }, { status: 500 });
  }
}
