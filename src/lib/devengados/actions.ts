"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { setSettingValue } from "@/lib/settings";
import { nowBogotaISO } from "@/lib/utils";
import { getEstadoConductor, SETTING_BASE_DIARIA } from "./data";

async function assertEditor() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "tesoreria") || !perms.puedeEditar) {
    throw new Error("No tienes permisos para gestionar devengados.");
  }
  return perms;
}

export interface RegistrarEntregaInput {
  cedula: string;
  codigo: string | null;
  nombre: string | null;
  /** Números de viajes_recaudados que se liquidan en caja. */
  viajes: number[];
  valor: number;
  observacion: string | null;
}

export async function registrarEntrega(
  input: RegistrarEntregaInput
): Promise<{ success: boolean; error?: string; disponible?: number }> {
  try {
    const perms = await assertEditor();

    const valor = Math.round(Number(input.valor) * 100) / 100;
    if (!Number.isFinite(valor) || valor <= 0) {
      return { success: false, error: "El valor a entregar debe ser mayor que cero." };
    }

    // El día contable es SIEMPRE el día en que se ejecuta la transacción.
    const fecha = nowBogotaISO().slice(0, 10);

    // Recalcular en el servidor: la regla de oro no se confía al cliente.
    const estado = await getEstadoConductor(input.cedula, fecha);
    if (valor > estado.resumen.disponible) {
      return {
        success: false,
        disponible: estado.resumen.disponible,
        error:
          estado.resumen.disponible <= 0
            ? "Entrega bloqueada: el acumulado de la quincena no ha cubierto la base exigida."
            : `El valor supera el excedente disponible ($${estado.resumen.disponible.toLocaleString("es-CO")}).`,
      };
    }

    const yaLiquidados = new Set(estado.entregas.flatMap((e) => e.viajes));
    const repetidos = input.viajes.filter((n) => yaLiquidados.has(n));
    if (repetidos.length) {
      return {
        success: false,
        error: `Viajes ya liquidados en otra entrega: ${repetidos.join(", ")}.`,
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("devengados_entregas").insert({
      fecha,
      periodo: estado.quincena.periodo,
      quincena: estado.quincena.quincena,
      cedula_conductor: input.cedula,
      codigo_conductor: input.codigo,
      conductor_nombre: input.nombre,
      viajes: input.viajes,
      valor_entregado: valor,
      observacion: input.observacion,
      aprobada_por: perms.userId,
    });
    if (error) throw error;

    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/entregas");
    revalidatePath("/tesoreria/devengados/analisis");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Marca/desmarca una entrega como trasladada manualmente a GEMA. */
export async function marcarTrasladada(
  id: string,
  trasladada: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertEditor();
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("devengados_entregas")
      .update({
        trasladada_gema: trasladada,
        trasladada_at: trasladada ? new Date().toISOString() : null,
        trasladada_por: trasladada ? perms.userId : null,
      })
      .eq("id", id);
    if (error) throw error;
    revalidatePath("/tesoreria/devengados/entregas");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Actualiza la base diaria parametrizada (app_settings). */
export async function guardarBaseDiaria(
  valor: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertEditor();
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) {
      return { success: false, error: "La base diaria debe ser un valor mayor que cero." };
    }
    await setSettingValue(SETTING_BASE_DIARIA, String(Math.round(n)), perms.userId ?? undefined);
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/parametros");
    revalidatePath("/tesoreria/devengados/analisis");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
