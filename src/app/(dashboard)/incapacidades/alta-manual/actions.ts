"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarAltaManual } from "@/lib/incapacidades/auditoria";
import { incorporarAltaManual } from "@/lib/incapacidades/expedientes";

const RUTA = "/incapacidades/alta-manual";

/**
 * Incorpora a la gestión una incapacidad anterior al corte (decisión 12.16).
 * El motivo es obligatorio; la base valida vigencia y duplicado y deja la
 * bitácora. Exige el módulo y permiso de edición.
 */
export async function incorporar(formData: FormData): Promise<void> {
  const ausentismoId = String(formData.get("ausentismo_id") ?? "");
  const cedula = String(formData.get("cedula") ?? "").replace(/\D/g, "");
  const nombre = String(formData.get("nombre") ?? "") || null;
  const motivo = String(formData.get("motivo") ?? "").replace(/\s+/g, " ").trim();

  let expedienteId: string | null = null;
  let error: string | null = null;
  let rol: string | null = null;
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "incapacidades")) throw new Error("No tienes acceso al módulo.");
    if (!perms.puedeEditar) throw new Error("Tu tipo de usuario no puede incorporar incapacidades.");
    rol = perms.userType;
    if (!/^[0-9a-f-]{36}$/i.test(ausentismoId)) throw new Error("Incapacidad no válida.");
    if (motivo.length < 10) throw new Error("Escribe un motivo de al menos 10 caracteres.");
    expedienteId = await incorporarAltaManual(ausentismoId, motivo, perms.userEmail);
    await auditarAltaManual({ expedienteId, ausentismoId, cedula, nombre, motivo, rol });
    revalidatePath("/incapacidades");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (rol) {
      await auditarAltaManual({ expedienteId: null, ausentismoId, cedula, nombre, motivo, resultado: "fallido", error, rol });
    }
  }

  if (expedienteId) redirect(`/incapacidades/${expedienteId}`);
  const q = new URLSearchParams({ cedula, error: error ?? "No se pudo incorporar." }).toString();
  redirect(`${RUTA}?${q}`);
}
