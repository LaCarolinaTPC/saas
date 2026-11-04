"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess, canAccessSub, tienePermiso } from "@/lib/permissions";
import { nowBogotaISO } from "@/lib/utils";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { cargarCruce, getPeriodo } from "./data";

const RUTA = "/tesoreria/otros-devengados";
const MODULO_AUDIT = "otros_devengados";

/** Devuelve el mensaje de error (o null) en vez de lanzar: ver error #441. */
async function faltaPermisoEditar() {
  const perms = await getCurrentPermissions();
  if (
    !canAccess(perms, "tesoreria") ||
    !canAccessSub(perms, "tesoreria", "otros_devengados") ||
    !tienePermiso(perms, "tesoreria.otros_devengados.editar")
  ) {
    return { perms, error: "No tienes permisos para entregar otros devengados." };
  }
  return { perms, error: null };
}

export interface EntregarInput {
  codPer: string;
  cedula: string;
  valor: number;
  observacion: string | null;
}

export async function entregarOtrosDevengados(
  input: EntregarInput
): Promise<{ ok: true; saldoDespues: number } | { ok: false; error: string; disponible?: number }> {
  try {
    const { perms, error: sinPermiso } = await faltaPermisoEditar();
    if (sinPermiso) return { ok: false, error: sinPermiso };

    const valor = Math.round(Number(input.valor) * 100) / 100;
    if (!Number.isFinite(valor) || valor <= 0) {
      return { ok: false, error: "El valor a entregar debe ser mayor que cero." };
    }
    const cedula = String(input.cedula).replace(/\D/g, "");
    const db = createAdminClient();

    const periodo = await getPeriodo(db, String(input.codPer));
    if (!periodo) return { ok: false, error: "El período no es de la nómina de conductores desde octubre de 2026." };
    if (!periodo.cerrada) {
      return { ok: false, error: `La nómina ${periodo.codigo} todavía no está cerrada en MGX: no se puede entregar.` };
    }

    // El cruce se recalcula en el servidor; del cliente solo llega la cédula.
    const cruce = await cargarCruce(db, periodo);
    const fila = cruce.filas.find((f) => f.cedula === cedula);
    if (!fila) return { ok: false, error: "El conductor no está en la nómina de conductores de este período." };
    if (valor > fila.porEntregar) {
      return {
        ok: false,
        disponible: fila.porEntregar,
        error:
          fila.porEntregar <= 0
            ? "El conductor no tiene saldo por entregar en esta quincena."
            : `El valor supera el saldo por entregar ($${fila.porEntregar.toLocaleString("es-CO")}).`,
      };
    }

    const fecha = nowBogotaISO().slice(0, 10);
    const { data, error } = await db.rpc("registrar_entrega_otros_devengados", {
      p_fecha: fecha,
      p_cod_per: periodo.codigo,
      p_periodo: periodo.quincena.periodo,
      p_quincena: periodo.quincena.quincena,
      p_cedula: cedula,
      p_codigo: fila.codigo,
      p_nombre: fila.nombre,
      p_valor: valor,
      p_otros_devengados: fila.otrosDevengados,
      p_observacion: input.observacion?.trim() || null,
      p_user_id: perms.userId,
      p_user_email: perms.userEmail,
    });
    if (error) {
      if (error.message.includes("supera_disponible")) {
        return { ok: false, error: "Otra entrega simultánea agotó el saldo. Consulta de nuevo." };
      }
      return { ok: false, error: `No se pudo registrar la entrega: ${error.message}` };
    }
    const r = (Array.isArray(data) ? data[0] : data) as { id: string; saldo_antes: number; saldo_despues: number } | null;

    await logTesoreriaAudit({
      accion: "otros_devengados_entrega",
      modulo: MODULO_AUDIT,
      cedulaConductor: cedula,
      conductorNombre: fila.nombre,
      valor,
      rol: perms.userType,
      valorAnterior: r ? String(r.saldo_antes) : null,
      valorNuevo: r ? String(r.saldo_despues) : null,
      detalle: {
        entrega_id: r?.id ?? null,
        cod_per: periodo.codigo,
        quincena: `${periodo.quincena.periodo} Q${periodo.quincena.quincena}`,
        produccion: fila.produccion,
        nomina_devengo: fila.nominaDevengo,
        otros_devengados: fila.otrosDevengados,
      },
    });

    revalidatePath(RUTA);
    return { ok: true, saldoDespues: Number(r?.saldo_despues ?? 0) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function anularEntregaOtrosDevengados(input: {
  id: string;
  motivo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { perms, error: sinPermiso } = await faltaPermisoEditar();
    if (sinPermiso) return { ok: false, error: sinPermiso };
    const motivo = String(input.motivo ?? "").trim();
    if (motivo.length < 5) return { ok: false, error: "Escribe el motivo de la anulación." };

    const db = createAdminClient();
    const { data: entrega } = await db
      .from("otros_devengados_entregas")
      .select("id, cedula_conductor, conductor_nombre, valor_entregado, cod_per")
      .eq("id", input.id)
      .maybeSingle();
    if (!entrega) return { ok: false, error: "La entrega no existe." };

    const { error } = await db.rpc("anular_entrega_otros_devengados", {
      p_id: input.id,
      p_motivo: motivo,
      p_user_id: perms.userId,
      p_user_email: perms.userEmail,
    });
    if (error) {
      if (error.message.includes("entrega_ya_anulada")) return { ok: false, error: "La entrega ya estaba anulada." };
      return { ok: false, error: `No se pudo anular: ${error.message}` };
    }

    await logTesoreriaAudit({
      accion: "otros_devengados_anulacion",
      modulo: MODULO_AUDIT,
      cedulaConductor: entrega.cedula_conductor,
      conductorNombre: entrega.conductor_nombre,
      valor: Number(entrega.valor_entregado),
      rol: perms.userType,
      detalle: { entrega_id: input.id, cod_per: entrega.cod_per, motivo },
    });

    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
