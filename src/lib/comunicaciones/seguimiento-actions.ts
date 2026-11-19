"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPermissions } from "@/lib/permissions";
import { validarSeguimiento, type ConfigSeguimiento } from "./seguimiento";
import { escribirConfigSeguimiento } from "./seguimiento-ejecutar";

/** Guarda la configuración del seguimiento a quien no responde (solo administradores). */
export async function guardarSeguimiento(datos: ConfigSeguimiento): Promise<{ ok: boolean; error?: string }> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) return { ok: false, error: "Solo el administrador puede configurar el seguimiento." };
  const v = validarSeguimiento(datos);
  if (!v.ok) return { ok: false, error: v.error };
  const r = await escribirConfigSeguimiento(v.config, perms.userEmail ?? null);
  if (!r.ok) return r;
  revalidatePath("/comunicaciones/configuracion");
  revalidatePath("/candidatos/seleccion");
  return { ok: true };
}
