"use server";

/** Estado de los servicios externos para Selección › Tiempos y reglas (24-nov-2026). Leer exige entrar a Candidatos. */
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { leerEstadoServicios, olvidarEstadoServicios, type EstadoServicio } from "@/lib/estado-servicios";
import { enviarAlertaDePrueba } from "@/lib/alerta-servicios";

export async function estadoServiciosAccion(actualizar = false): Promise<EstadoServicio[] | { error: string }> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) return { error: "No tienes permiso para ver los candidatos." };
  if (actualizar) olvidarEstadoServicios();
  return leerEstadoServicios();
}

/** Envía un correo de prueba de la alerta a los destinatarios configurados. Exige editar la configuración de Selección. */
export async function alertaDePruebaAccion(): Promise<{ ok: boolean; error?: string; para?: string[]; copia?: string[] }> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !puedeEditarEn(perms, "candidatos.seleccion_config")) return { ok: false, error: "No tienes permiso para cambiar la configuración de Selección." };
  return enviarAlertaDePrueba();
}
