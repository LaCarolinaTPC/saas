/**
 * Soportes de descuentos de afiliados (solo servidor). Bucket privado
 * `afiliados-soportes` + tabla `afiliado_soportes` (migración
 * 20260925223057). Los archivos nunca van en la página: se sirven por una ruta
 * que revisa el permiso y redirige a una URL firmada de un minuto.
 */
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVehiculosAfiliados } from "./liquidacion-afiliados-data";
import { SOPORTE_MIMES, type SoporteVista, type TipoSoporte } from "./soportes-reglas";

export const BUCKET_SOPORTES = "afiliados-soportes";
const URL_FIRMADA_SEG = 60;

interface FilaSoporte {
  id: string;
  cedula_propietario: string;
  codigo_vehiculo: string;
  fecha: string;
  tipo: TipoSoporte;
  concepto: string;
  valor: number | null;
  archivo_ruta: string;
  archivo_nombre: string;
  archivo_mime: string;
  archivo_tamano: number;
  subido_por_email: string | null;
  created_at: string;
  anulado_at: string | null;
}

const aVista = (r: FilaSoporte): SoporteVista => ({
  id: r.id,
  codigoVehiculo: r.codigo_vehiculo,
  fecha: r.fecha,
  tipo: r.tipo,
  concepto: r.concepto,
  valor: r.valor === null ? null : Number(r.valor),
  archivoNombre: r.archivo_nombre,
  archivoMime: r.archivo_mime,
  archivoTamano: r.archivo_tamano,
  subidoPorEmail: r.subido_por_email,
  createdAt: r.created_at,
});

/**
 * ¿GEMA liquidó ese vehículo a nombre de ese afiliado ese día? Es la misma
 * condición con la que el afiliado ve el vehículo en su liquidación.
 */
export async function vehiculoDelAfiliadoEseDia(cedula: string, vehiculo: string, fecha: string): Promise<boolean> {
  const [afiliados, { data }] = await Promise.all([
    getVehiculosAfiliados(),
    createAdminClient()
      .from("ingreso_tercero")
      .select("id")
      .eq("cedula_propietario", cedula)
      .eq("codigo_vehiculo", vehiculo)
      .eq("fecha", fecha)
      .eq("tipo_propietario", "AFILIADO")
      .limit(1),
  ]);
  return afiliados.has(vehiculo) && (data ?? []).length > 0;
}

/** Sube el archivo y registra la fila; si la fila falla, borra el archivo. */
export async function guardarSoporte(d: {
  cedula: string;
  vehiculo: string;
  fecha: string;
  tipo: TipoSoporte;
  concepto: string;
  valor: number | null;
  nombre: string;
  mime: string;
  buffer: Buffer;
  actorEmail: string | null;
}): Promise<string> {
  const db = createAdminClient();
  const ruta = `${d.cedula}/${d.vehiculo}/${d.fecha}/${Date.now()}-${randomBytes(6).toString("hex")}.${SOPORTE_MIMES[d.mime]}`;
  const { error: e1 } = await db.storage.from(BUCKET_SOPORTES).upload(ruta, d.buffer, { contentType: d.mime, upsert: false });
  if (e1) throw new Error(`No se pudo guardar el archivo: ${e1.message}`);
  const { data, error } = await db
    .from("afiliado_soportes")
    .insert({
      cedula_propietario: d.cedula,
      codigo_vehiculo: d.vehiculo,
      fecha: d.fecha,
      tipo: d.tipo,
      concepto: d.concepto,
      valor: d.valor,
      archivo_ruta: ruta,
      archivo_nombre: d.nombre.slice(0, 200),
      archivo_mime: d.mime,
      archivo_tamano: d.buffer.byteLength,
      subido_por_email: d.actorEmail,
    })
    .select("id")
    .single();
  if (error) {
    await db.storage.from(BUCKET_SOPORTES).remove([ruta]).catch(() => undefined);
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

/**
 * Soportes vigentes de un afiliado en un rango de fechas. Si la migración no
 * está aplicada, `disponible: false` y lista vacía: la liquidación se sigue viendo.
 */
export async function listarSoportes(cedula: string, desde: string, hasta: string): Promise<{ disponible: boolean; soportes: SoporteVista[] }> {
  const { data, error } = await createAdminClient()
    .from("afiliado_soportes")
    .select("*")
    .eq("cedula_propietario", cedula)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .is("anulado_at", null)
    .order("fecha")
    .order("created_at")
    .range(0, 999);
  if (error) return { disponible: false, soportes: [] };
  return { disponible: true, soportes: ((data ?? []) as FilaSoporte[]).map(aVista) };
}

/** Un soporte vigente con su ruta interna (para servir el archivo). */
export async function leerSoporte(id: string): Promise<(SoporteVista & { cedula: string; ruta: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient().from("afiliado_soportes").select("*").eq("id", id).is("anulado_at", null).maybeSingle();
  if (!data) return null;
  const r = data as FilaSoporte;
  return { ...aVista(r), cedula: r.cedula_propietario, ruta: r.archivo_ruta };
}

/** URL firmada de un minuto; con `descargar`, el navegador lo baja con su nombre. */
export async function urlSoporte(ruta: string, nombre: string, descargar: boolean): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET_SOPORTES)
    .createSignedUrl(ruta, URL_FIRMADA_SEG, descargar ? { download: nombre } : undefined);
  if (error) {
    console.error("[soportes] no se pudo firmar la URL:", error.message);
    return null;
  }
  return data.signedUrl;
}

export async function anularSoporte(id: string, motivo: string, actorEmail: string | null): Promise<{ cedula: string; nombre: string }> {
  const { data, error } = await createAdminClient()
    .from("afiliado_soportes")
    .update({ anulado_at: new Date().toISOString(), anulado_por_email: actorEmail, motivo_anulacion: motivo })
    .eq("id", id)
    .is("anulado_at", null)
    .select("cedula_propietario, archivo_nombre")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("El soporte no existe o ya está anulado.");
  return { cedula: data.cedula_propietario as string, nombre: data.archivo_nombre as string };
}
