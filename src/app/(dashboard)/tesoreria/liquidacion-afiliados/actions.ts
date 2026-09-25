"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccessSub } from "@/lib/permissions";
import { esPlazo } from "@/lib/tesoreria/calendario-pago";

export interface CambioReglaPago {
  plazo: string;
  diaPago: number;
  diaPagoAlterno: number;
  correrSiLunesFestivo: boolean;
  correrSiDiaPagoFestivo: boolean;
}

/**
 * Cambia el día de pago y las reglas de festivo de un plazo. Lo mismo que
 * los parámetros de devengados: solo quien tiene Parámetros de Tesorería.
 * El corte (lunes a domingo, 1-15/16-fin) no se edita aquí: define qué es
 * una semana o una quincena y cambiarlo reescribiría periodos ya pagados.
 */
export async function guardarReglaPago(c: CambioReglaPago): Promise<{ ok: true } | { ok: false; error: string }> {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "parametros")) {
    return { ok: false, error: "Solo quien tiene Parámetros de Tesorería puede cambiar el calendario de pago." };
  }
  if (!esPlazo(c.plazo)) return { ok: false, error: "Plazo no válido." };
  const dia = (n: number) => Number.isInteger(n) && n >= 1 && n <= 7;
  if (!dia(c.diaPago) || !dia(c.diaPagoAlterno)) return { ok: false, error: "Día de la semana no válido." };
  if (c.diaPago === c.diaPagoAlterno) {
    return { ok: false, error: "El día alterno debe ser distinto del día de pago." };
  }
  const { error } = await createAdminClient()
    .from("tesoreria_calendario_pago")
    .update({
      dia_pago: c.diaPago,
      dia_pago_alterno: c.diaPagoAlterno,
      correr_si_lunes_festivo: !!c.correrSiLunesFestivo,
      correr_si_dia_pago_festivo: !!c.correrSiDiaPagoFestivo,
      updated_at: new Date().toISOString(),
      updated_por_email: perms.userEmail,
    })
    .eq("plazo", c.plazo);
  if (error) {
    return {
      ok: false,
      error: /tesoreria_calendario_pago/.test(error.message)
        ? "Falta aplicar la migración 20260925194027 (calendario de pago) en la base."
        : error.message,
    };
  }
  revalidatePath("/tesoreria/liquidacion-afiliados");
  return { ok: true };
}
