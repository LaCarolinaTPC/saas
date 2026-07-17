import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Auditoría de Tesorería (tesoreria_audit_log): quién hizo qué y con qué
 * valores. Nunca debe tumbar la operación de negocio: si el insert falla
 * (p. ej. la migración 032/034 aún no está aplicada), solo se deja
 * constancia en el log del servidor.
 */

export type AccionAudit =
  | "entrega_registrada"
  | "segundo_pago_autorizado"
  | "devolucion"
  | "bloqueo_conductor"
  | "desbloqueo_conductor"
  | "traslado_gema"
  | "base_diaria"
  | "fecha_operativa"
  | "login_exitoso"
  | "login_fallido"
  | "cierre_sesion"
  | "cambio_password"
  | "usuario_creado"
  | "cambio_rol"
  | "cambio_permisos"
  | "reporte_generado"
  | "exportacion"
  | "sincronizacion_gema";

/** IP y equipo (user-agent) de la petición actual, para la bitácora. */
export async function getRequestMeta(): Promise<{ ip: string | null; equipo: string | null }> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return {
      ip: fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip"),
      equipo: h.get("user-agent"),
    };
  } catch {
    return { ip: null, equipo: null };
  }
}

export async function logTesoreriaAudit(entry: {
  accion: AccionAudit;
  cedulaConductor?: string | null;
  conductorNombre?: string | null;
  valor?: number | null;
  detalle?: Record<string, unknown>;
  modulo?: string;
  resultado?: "exitoso" | "fallido";
  rol?: string | null;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  /** Para eventos sin sesión (p. ej. intento fallido de login). */
  userEmailOverride?: string | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { ip, equipo } = await getRequestMeta();
    const admin = createAdminClient();
    const { error } = await admin.from("tesoreria_audit_log").insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? entry.userEmailOverride ?? null,
      accion: entry.accion,
      cedula_conductor: entry.cedulaConductor ?? null,
      conductor_nombre: entry.conductorNombre ?? null,
      valor: entry.valor ?? null,
      detalle: entry.detalle ?? {},
      ip,
      equipo,
      modulo: entry.modulo ?? "tesoreria",
      resultado: entry.resultado ?? "exitoso",
      rol: entry.rol ?? null,
      valor_anterior: entry.valorAnterior ?? null,
      valor_nuevo: entry.valorNuevo ?? null,
    });
    if (error) throw error;
  } catch (e) {
    console.error("[tesoreria_audit_log] no se pudo registrar la auditoría:", e);
  }
}

export interface AuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  accion: string;
  cedula_conductor: string | null;
  conductor_nombre: string | null;
  valor: number | null;
  detalle: Record<string, unknown>;
  ip: string | null;
  equipo: string | null;
  modulo: string | null;
  resultado: string | null;
  rol: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  created_at: string;
}

/** Últimos movimientos de auditoría (para la pantalla de consulta). */
export async function getTesoreriaAudit(limit = 200): Promise<AuditRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tesoreria_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[tesoreria_audit_log] no se pudo leer la auditoría:", error);
    return [];
  }
  return (data ?? []) as AuditRow[];
}
