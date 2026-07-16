import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Auditoría de Tesorería (tesoreria_audit_log): quién hizo qué y con qué
 * valores. Nunca debe tumbar la operación de negocio: si el insert falla
 * (p. ej. la migración 032 aún no está aplicada), solo se deja constancia
 * en el log del servidor.
 */
export async function logTesoreriaAudit(entry: {
  accion: "entrega_registrada" | "traslado_gema" | "base_diaria" | "fecha_operativa";
  cedulaConductor?: string | null;
  conductorNombre?: string | null;
  valor?: number | null;
  detalle?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const admin = createAdminClient();
    const { error } = await admin.from("tesoreria_audit_log").insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      accion: entry.accion,
      cedula_conductor: entry.cedulaConductor ?? null,
      conductor_nombre: entry.conductorNombre ?? null,
      valor: entry.valor ?? null,
      detalle: entry.detalle ?? {},
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
