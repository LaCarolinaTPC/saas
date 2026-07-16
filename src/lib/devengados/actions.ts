"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess, canAccessSub } from "@/lib/permissions";
import { setSettingValue } from "@/lib/settings";
import { nowBogotaISO } from "@/lib/utils";
import {
  getEstadoConductor,
  getFechaOperativa,
  SETTING_BASE_DIARIA,
  SETTING_FECHA_OPERATIVA,
} from "./data";
import { logTesoreriaAudit } from "./audit";

async function assertEditor(sub: string) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "tesoreria") || !perms.puedeEditar) {
    throw new Error("No tienes permisos para gestionar devengados.");
  }
  if (!canAccessSub(perms, "tesoreria", sub)) {
    throw new Error("Tu tipo de usuario no tiene habilitada esta función de Tesorería.");
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
    const perms = await assertEditor("caja");

    const valor = Math.round(Number(input.valor) * 100) / 100;
    if (!Number.isFinite(valor) || valor <= 0) {
      return { success: false, error: "El valor a entregar debe ser mayor que cero." };
    }

    // El día contable es la fecha operativa del módulo: el día real, salvo
    // que un administrador la haya fijado en un día cerrado (modo prueba).
    const { fecha } = await getFechaOperativa();

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

    // La entrega es por día acumulado (hoja Simulacion_Diaria); los viajes
    // solo quedan como traza de soporte. El tope real es el disponible
    // recalculado arriba, que ya descuenta lo entregado en la quincena.
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

    await logTesoreriaAudit({
      accion: "entrega_registrada",
      cedulaConductor: input.cedula,
      conductorNombre: input.nombre,
      valor,
      detalle: {
        fecha,
        periodo: estado.quincena.periodo,
        quincena: estado.quincena.quincena,
        viajes: input.viajes,
        observacion: input.observacion,
        disponible: estado.resumen.disponible,
      },
    });

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
    const perms = await assertEditor("entregas");
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from("devengados_entregas")
      .update({
        trasladada_gema: trasladada,
        trasladada_at: trasladada ? new Date().toISOString() : null,
        trasladada_por: trasladada ? perms.userId : null,
      })
      .eq("id", id)
      .select("cedula_conductor, conductor_nombre, valor_entregado, fecha")
      .single();
    if (error) throw error;

    await logTesoreriaAudit({
      accion: "traslado_gema",
      cedulaConductor: row?.cedula_conductor,
      conductorNombre: row?.conductor_nombre,
      valor: row?.valor_entregado,
      detalle: { entregaId: id, trasladada, fechaEntrega: row?.fecha },
    });

    revalidatePath("/tesoreria/devengados/entregas");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fija o libera la fecha operativa del módulo (app_settings). Solo el
 * administrador puede moverla: con null vuelve al día real de Bogotá.
 */
export async function guardarFechaOperativa(
  fecha: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin) {
      return { success: false, error: "Solo el administrador puede mover la fecha operativa." };
    }
    const hoyReal = nowBogotaISO().slice(0, 10);
    if (fecha !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return { success: false, error: "Fecha inválida (formato YYYY-MM-DD)." };
      }
      if (fecha > hoyReal) {
        return { success: false, error: "La fecha operativa no puede ser futura." };
      }
    }
    await setSettingValue(SETTING_FECHA_OPERATIVA, fecha ?? "", perms.userId ?? undefined);
    await logTesoreriaAudit({
      accion: "fecha_operativa",
      detalle: { fecha: fecha ?? "automatica (día real)" },
    });
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/entregas");
    revalidatePath("/tesoreria/devengados/analisis");
    revalidatePath("/tesoreria/devengados/parametros");
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
    const perms = await assertEditor("parametros");
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) {
      return { success: false, error: "La base diaria debe ser un valor mayor que cero." };
    }
    await setSettingValue(SETTING_BASE_DIARIA, String(Math.round(n)), perms.userId ?? undefined);
    await logTesoreriaAudit({
      accion: "base_diaria",
      valor: Math.round(n),
    });
    revalidatePath("/tesoreria/devengados");
    revalidatePath("/tesoreria/devengados/parametros");
    revalidatePath("/tesoreria/devengados/analisis");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
