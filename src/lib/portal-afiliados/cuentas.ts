/** Lectura de las cuentas del portal para Tesorería (solo servidor, sin hashes). */
import { createAdminClient } from "@/lib/supabase/admin";

export interface CuentaResumen {
  id: string;
  email: string;
  nombre: string | null;
  activo: boolean;
  debeCambiarClave: boolean;
  bloqueadoHasta: string | null;
  ultimoIngresoAt: string | null;
  createdAt: string;
  createdPorEmail: string | null;
}

export interface AccesoResumen {
  evento: string;
  email: string | null;
  actorEmail: string | null;
  ip: string | null;
  createdAt: string;
}

/**
 * Cuentas de un propietario y sus últimos 15 eventos. Si la migración del
 * portal (20260925203623) no está aplicada, devuelve `disponible: false`.
 */
export async function getCuentasDePropietario(cedula: string): Promise<{
  disponible: boolean;
  cuentas: CuentaResumen[];
  accesos: AccesoResumen[];
}> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("afiliado_cuentas")
    .select("id, email, nombre, activo, debe_cambiar_clave, bloqueado_hasta, ultimo_ingreso_at, created_at, created_por_email")
    .eq("cedula_propietario", cedula)
    .order("created_at");
  if (error) return { disponible: false, cuentas: [], accesos: [] };
  const cuentas = (data ?? []).map((c) => ({
    id: c.id, email: c.email, nombre: c.nombre, activo: c.activo, debeCambiarClave: c.debe_cambiar_clave,
    bloqueadoHasta: c.bloqueado_hasta, ultimoIngresoAt: c.ultimo_ingreso_at, createdAt: c.created_at,
    createdPorEmail: c.created_por_email,
  }));
  if (!cuentas.length) return { disponible: true, cuentas, accesos: [] };
  const { data: acc } = await db
    .from("afiliado_accesos")
    .select("evento, email, actor_email, ip, created_at")
    .in("cuenta_id", cuentas.map((c) => c.id))
    .order("created_at", { ascending: false })
    .limit(15);
  return {
    disponible: true,
    cuentas,
    accesos: (acc ?? []).map((a) => ({ evento: a.evento, email: a.email, actorEmail: a.actor_email, ip: a.ip, createdAt: a.created_at })),
  };
}
