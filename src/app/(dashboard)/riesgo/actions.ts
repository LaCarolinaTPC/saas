"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { ejecutarCorrida } from "@/lib/riesgo/corrida";
import { hoyBogota } from "@/lib/riesgo/fechas";
import { guardarCorrida, guardarCorridaFallida } from "@/lib/riesgo/persistir";
import { auditarCorrida, auditarExportacion } from "@/lib/riesgo/auditoria";

export interface ResultadoRecalculo {
  success: boolean;
  error?: string;
  corridaId?: string;
  corte?: string;
}

/**
 * Recalcula el análisis a la fecha de hoy y guarda una corrida nueva. No
 * sobrescribe la anterior: cada corte queda para poder volver a él.
 *
 * Exige el módulo y permiso de edición: recalcular no es consultar, y cambia
 * lo que ve el resto.
 */
export async function recalcularRiesgo(): Promise<ResultadoRecalculo> {
  const corte = hoyBogota();
  let email: string | null = null;
  let rol: string | null = null;
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "riesgo")) {
      throw new Error("No tienes acceso al módulo de Riesgo.");
    }
    if (!perms.puedeEditar) {
      throw new Error("Tu tipo de usuario no puede recalcular el análisis.");
    }
    email = perms.userEmail;
    rol = perms.userType;

    const { resultado } = await ejecutarCorrida(createAdminClient(), { corte });
    const corridaId = await guardarCorrida(resultado, {
      origen: "manual",
      ejecutadaPorEmail: email,
    });
    await auditarCorrida({
      corridaId,
      corte,
      origen: "manual",
      observaciones: resultado.observaciones,
      conductores: resultado.puntuados.length,
      duracionMs: resultado.duracionMs,
      rol,
    });

    revalidatePath("/riesgo");
    return { success: true, corridaId, corte };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    // Solo se registra la corrida fallida si el fallo fue del cálculo, no del
    // permiso: un intento sin permiso no es una corrida.
    if (email) {
      await guardarCorridaFallida(corte, mensaje, { origen: "manual", ejecutadaPorEmail: email });
      await auditarCorrida({
        corridaId: null,
        corte,
        origen: "manual",
        resultado: "fallido",
        error: mensaje,
        rol,
      });
    }
    return { success: false, error: mensaje };
  }
}

/**
 * Deja constancia de una descarga. El archivo se genera en el navegador, así
 * que el rastro no puede salir de la ruta que lo produce: lo registra el
 * cliente al terminar. Nunca hace fallar la descarga.
 */
export async function registrarExportacion(datos: {
  corridaId: string | null;
  corte: string | null;
  formato: string;
  objetivo: string;
  filas: number;
}): Promise<void> {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "riesgo")) return;
    await auditarExportacion({ ...datos, rol: perms.userType });
  } catch (e) {
    console.error("[riesgo] no se pudo registrar la exportación:", e);
  }
}
