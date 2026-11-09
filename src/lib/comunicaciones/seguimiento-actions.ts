"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { validarSeguimiento, type ConfigSeguimiento } from "./seguimiento";

/** Guarda la configuración del seguimiento a quien no responde (solo administradores). */
export async function guardarSeguimiento(datos: ConfigSeguimiento): Promise<{ ok: boolean; error?: string }> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) return { ok: false, error: "Solo el administrador puede configurar el seguimiento." };
  const v = validarSeguimiento(datos);
  if (!v.ok) return { ok: false, error: v.error };
  const c = v.config;
  const { error } = await createAdminClient().from("wa_seguimiento").upsert({
    id: 1,
    activo: c.activo,
    horas_espera: c.horasEspera,
    mensaje: c.mensaje,
    hora_desde: c.horaDesde,
    hora_hasta: c.horaHasta,
    horas_escalar: c.horasEscalar,
    actualizado_por: perms.userEmail ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return {
      ok: false,
      error: /wa_seguimiento|does not exist|schema cache/i.test(error.message)
        ? "Falta aplicar la migración 20261109221237 (seguimiento a quien no responde)."
        : error.message,
    };
  }
  revalidatePath("/comunicaciones/configuracion");
  return { ok: true };
}
