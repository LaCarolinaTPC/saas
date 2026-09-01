"use server";

import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { cargarReportesDeAlerta, type ReporteDano } from "@/lib/mantenimiento/danos";

/** Los reportes que originaron una alerta, para revisarla antes de cerrarla. */
export async function verReportesDeAlerta(alertaId: string): Promise<{ reportes: ReporteDano[]; error?: string }> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin && !canAccess(perms, "mantenimiento")) {
      throw new Error("No tienes permiso para ver esta alerta.");
    }
    if (!alertaId.trim()) throw new Error("La alerta no es válida.");

    const { data, error } = await cargarReportesDeAlerta(alertaId.trim());
    if (error) throw new Error(error.message);
    return { reportes: data ?? [] };
  } catch (error) {
    return { reportes: [], error: error instanceof Error ? error.message : "No se pudieron cargar los reportes." };
  }
}
