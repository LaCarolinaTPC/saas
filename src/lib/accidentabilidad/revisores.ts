/**
 * A quién se notifica un reporte de accidente: quienes pueden evaluarlo
 * (`accidentabilidad.evaluar`, que el administrador tiene por ser super) y
 * siguen activos. Antes lo decidía `profiles.role` admin/rrhh, del sistema de
 * roles anterior (retirado el 2026-11-10). Solo servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { usuariosConPermiso } from "@/lib/permisos/fuente";

export async function revisoresDeAccidentes(db: SupabaseClient): Promise<{ id: string }[]> {
  const ids = await usuariosConPermiso(db, "accidentabilidad.evaluar");
  if (!ids.length) return [];
  const { data } = await db.from("profiles").select("id").in("id", ids).eq("is_active", true);
  return (data ?? []) as { id: string }[];
}
