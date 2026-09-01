"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { hoyBogota } from "@/lib/mantenimiento/frenos";

export type GraduacionFrenosInput = {
  fecha: string;
  codigoVehiculo: string;
  graduacion: boolean;
  observacion: string;
};

export async function registrarGraduacionFrenos(input: GraduacionFrenosInput) {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "mantenimiento") || !perms.puedeEditar) {
      throw new Error("No tienes permiso para registrar graduaciones de frenos.");
    }

    const fecha = input.fecha.trim();
    const codigoVehiculo = input.codigoVehiculo.trim();
    const observacion = input.observacion.trim() || null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Selecciona la fecha del registro.");
    if (fecha > hoyBogota()) throw new Error("La fecha no puede ser futura.");
    if (!codigoVehiculo) throw new Error("Selecciona el vehículo.");
    // Misma regla que la restricción de la tabla, para dar un mensaje claro
    // antes de que la base la rechace.
    if (!input.graduacion && !observacion) {
      throw new Error("Si no se realizó la graduación, la observación es obligatoria.");
    }

    const db = createAdminClient();
    const { data: vehiculo } = await db
      .from("vehiculos").select("codigo").eq("codigo", codigoVehiculo).eq("estado", 1).maybeSingle();
    if (!vehiculo) throw new Error("El vehículo no existe en el maestro o no está activo.");

    const { error } = await db.from("mantenimiento_frenos").insert({
      fecha,
      codigo_vehiculo: codigoVehiculo,
      graduacion: input.graduacion,
      observacion,
      registrado_por: perms.userId,
      registrado_por_email: perms.userEmail,
    });
    if (error) {
      if (error.code === "23514") throw new Error("Si no se realizó la graduación, la observación es obligatoria.");
      throw new Error(error.message);
    }

    revalidatePath("/mantenimiento/frenos");
    revalidatePath("/mantenimiento/frenos/reportes");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo guardar el registro." };
  }
}

/**
 * Cuántos registros tiene ya ese vehículo en esa fecha. Se avisa sin bloquear:
 * repetir un día es válido, pero casi siempre es un descuido.
 */
export async function contarRegistrosDelDia(codigoVehiculo: string, fecha: string) {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "mantenimiento")) return { count: 0 };
    if (!codigoVehiculo || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { count: 0 };

    const db = createAdminClient();
    const { count } = await db
      .from("mantenimiento_frenos")
      .select("id", { count: "exact", head: true })
      .eq("codigo_vehiculo", codigoVehiculo)
      .eq("fecha", fecha);
    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}
