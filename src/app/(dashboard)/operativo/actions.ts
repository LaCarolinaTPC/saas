"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";

/** Todas las acciones exigen el módulo en el servidor (no solo en la UI). */
async function assertOperativo(editar: boolean) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    throw new Error("No tienes acceso al módulo Operativo.");
  }
  if (editar && !perms.isAdmin && !perms.puedeEditar) {
    throw new Error("Tu tipo de usuario es de solo consulta.");
  }
  return perms;
}

function revalidarOperativo(codigo?: string) {
  revalidatePath("/operativo");
  revalidatePath("/operativo/vehiculos");
  if (codigo) revalidatePath(`/operativo/vehiculos/${codigo}`);
}

/** Anula un documento cargado con motivo; la fila y el archivo se conservan como rastro. */
export async function anularDocumento(
  id: string,
  motivo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertOperativo(true);
    const m = motivo.trim();
    if (m.length < 5) throw new Error("Indica el motivo de la anulación (mínimo 5 caracteres).");
    if (m.length > 200) throw new Error("El motivo no puede pasar de 200 caracteres.");
    const db = createAdminClient();
    const { data, error } = await db
      .from("operativo_vehiculo_documentos")
      .update({ anulado_en: new Date().toISOString(), anulado_por_email: perms.userEmail, motivo_anulacion: m })
      .eq("id", id)
      .is("anulado_en", null)
      .select("codigo_vehiculo");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("El documento no existe o ya estaba anulado.");
    revalidarOperativo(data[0].codigo_vehiculo);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Cambia los umbrales de aviso de un tipo de documento (días antes del vencimiento). */
export async function actualizarUmbrales(input: {
  tipo: string;
  diasProximo: number;
  diasCritico: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertOperativo(true);
    const proximo = Math.trunc(Number(input.diasProximo));
    const critico = Math.trunc(Number(input.diasCritico));
    if (!Number.isFinite(proximo) || proximo < 1 || proximo > 365) {
      throw new Error("Los días de 'próximo a vencer' deben estar entre 1 y 365.");
    }
    if (!Number.isFinite(critico) || critico < 0 || critico > 365) {
      throw new Error("Los días de 'crítico' deben estar entre 0 y 365.");
    }
    if (critico > proximo) throw new Error("El umbral crítico no puede ser mayor que el de próximo a vencer.");
    const db = createAdminClient();
    const { data, error } = await db
      .from("operativo_documento_tipos")
      .update({ dias_proximo: proximo, dias_critico: critico, updated_by_email: perms.userEmail, updated_at: new Date().toISOString() })
      .eq("key", input.tipo)
      .select("key");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("El tipo de documento no existe.");
    revalidarOperativo();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
