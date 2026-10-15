"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import type { CausaRechazo } from "./causas";

/** Catálogo vigente: primero las 9 base en su orden, luego las creadas por el equipo. */
export async function listarCausasRechazo(): Promise<CausaRechazo[]> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("causas_rechazo")
    .select("id, nombre, base")
    .eq("activo", true)
    .order("base", { ascending: false })
    .order("orden")
    .order("nombre");
  return (data ?? []) as CausaRechazo[];
}
