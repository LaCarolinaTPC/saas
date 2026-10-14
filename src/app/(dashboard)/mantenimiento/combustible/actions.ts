"use server";

import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { reversarCarga } from "@/lib/mantenimiento/combustible-data";

const RUTA = "/mantenimiento/combustible";

/** Borra los tanqueos cuya última carga fue esta. La carga queda en la lista como reversada. */
export async function reversarCargaCombustible(id: string): Promise<{ success: boolean; error?: string; tanqueos?: number }> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin && !canAccess(perms, "combustible")) throw new Error("No tienes acceso a Combustible.");
    if (!perms.isAdmin && !perms.puedeEditar) throw new Error("Tu tipo de usuario es de solo consulta.");
    const r = await reversarCarga(id, perms.userEmail);
    revalidatePath(RUTA);
    revalidatePath(`${RUTA}/historial`);
    return { success: true, tanqueos: r.tanqueos };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
