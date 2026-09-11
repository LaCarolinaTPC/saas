"use server";

import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarExportacion } from "@/lib/incapacidades/auditoria";

/**
 * Deja constancia de una descarga. El archivo se genera en el navegador, así
 * que el rastro lo registra el cliente al terminar. Nunca hace fallar la
 * descarga.
 */
export async function registrarExportacionIncapacidades(datos: {
  pantalla: string;
  formato: string;
  filas: number;
  archivo: string;
}): Promise<void> {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "incapacidades")) return;
    await auditarExportacion({ ...datos, rol: perms.userType });
  } catch (e) {
    console.error("[incapacidades] no se pudo registrar la exportación:", e);
  }
}
