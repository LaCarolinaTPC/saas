"use server";

import { revalidatePath } from "next/cache";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { consolidarAbiertos, type ResultadoConsolidacion } from "@/lib/financiera/consolidacion";
import { reversarContable, type ResultadoReversion } from "@/lib/financiera/cargar-contable";
import { esPeriodoValido } from "@/lib/financiera/motor";

export interface RespuestaConsolidar {
  success: boolean;
  error?: string;
  resultado?: ResultadoConsolidacion;
}

/**
 * «Consolidar ahora»: la misma corrida del cron, a demanda. Solo meses no
 * cerrados; nunca toca un período cerrado. Exige la sub-función fin_datos,
 * porque cambia lo que ven las demás pantallas del módulo.
 */
export async function consolidarAhora(): Promise<RespuestaConsolidar> {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccessSub(perms, "financiera", "fin_datos")) {
      throw new Error("Tu tipo de usuario no puede consolidar los datos de Financiera.");
    }
    const resultado = await consolidarAbiertos(perms.userEmail ?? null);
    revalidatePath("/financiera/flota/datos");
    revalidatePath("/financiera");
    return { success: true, resultado };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface RespuestaReversion {
  success: boolean;
  error?: string;
  resultado?: ResultadoReversion;
}

/**
 * Reversa el archivo contable de un período: borra solo los seis rubros y
 * deja la parte de GEMA intacta. En un mes cerrado exige reapertura previa.
 */
export async function reversarPeriodo(periodo: string): Promise<RespuestaReversion> {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccessSub(perms, "financiera", "fin_datos")) {
      throw new Error("Tu tipo de usuario no puede reversar datos de Financiera.");
    }
    if (!esPeriodoValido(periodo)) throw new Error("Período no válido.");
    const resultado = await reversarContable(periodo, perms.userEmail ?? null);
    revalidatePath("/financiera/flota/datos");
    revalidatePath("/financiera");
    return { success: true, resultado };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
