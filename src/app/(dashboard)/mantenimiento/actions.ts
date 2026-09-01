"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";

export type ReporteMantenimientoInput = {
  codigoVehiculo: string;
  cedula: string;
  conceptoId: string;
  descripcion: string;
  fecha: string;
};

export type CierreAlertaMantenimientoInput = {
  alertaId: string;
  ordenTaller: string;
  notasCierre: string;
  /**
   * Reportes que se cierran con la alerta. Los que quedan fuera se desvinculan:
   * siguen en el historial pero sueltos, de modo que puedan volver a disparar
   * una alerta más adelante. Es el caso de "no es reproceso", que aparece en
   * las notas de cierre reales del sistema que este módulo reemplaza.
   */
  reportesCerrados: string[];
};

async function requireEditorMantenimiento() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "mantenimiento") || !perms.puedeEditar) {
    throw new Error("No tienes permiso para gestionar mantenimiento.");
  }
  return perms;
}

/**
 * Registrar un daño es un módulo aparte, para poder dárselo a un conductor sin
 * abrirle el historial, las alertas ni los frenos. Quien tenga el área completa
 * también puede registrar.
 */
async function requireRegistroDano() {
  const perms = await getCurrentPermissions();
  const permitido = canAccess(perms, "registro_dano") || canAccess(perms, "mantenimiento");
  if (!permitido || !perms.puedeEditar) {
    throw new Error("No tienes permiso para registrar daños.");
  }
  return perms;
}

export async function crearReporteMantenimiento(input: ReporteMantenimientoInput) {
  try {
    const perms = await requireRegistroDano();
    const codigoVehiculo = input.codigoVehiculo.trim();
    const cedula = input.cedula.replace(/\D/g, "");
    if (!codigoVehiculo || !cedula || !input.conceptoId || !input.fecha) {
      throw new Error("Completa vehículo, conductor, concepto y fecha.");
    }
    const fecha = new Date(input.fecha);
    if (Number.isNaN(fecha.getTime())) throw new Error("La fecha no es válida.");

    const db = createAdminClient();
    const [{ data: vehiculo }, { data: conductor }, { data: concepto }] = await Promise.all([
      // El maestro lo sincroniza GEMA; aquí solo se comprueba que siga activo.
      db.from("vehiculos").select("codigo, placa").eq("codigo", codigoVehiculo).eq("estado", 1).maybeSingle(),
      db.from("conductores").select("cedula").eq("cedula", cedula).maybeSingle(),
      db.from("mantenimiento_conceptos").select("id").eq("id", input.conceptoId).eq("activo", true).maybeSingle(),
    ]);
    if (!vehiculo) throw new Error("El vehículo no existe en el maestro o no está activo.");
    if (!conductor) throw new Error("El conductor no existe en Gestivo.");
    if (!concepto) throw new Error("El concepto seleccionado no está disponible.");

    const { data, error } = await db.from("mantenimiento_reportes").insert({
      codigo_vehiculo: codigoVehiculo,
      cedula_conductor: cedula,
      concepto_id: input.conceptoId,
      descripcion: input.descripcion.trim() || null,
      fecha_reporte: fecha.toISOString(),
      created_by: perms.userId,
      created_by_email: perms.userEmail,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await db.from("mantenimiento_auditoria").insert({
      reporte_id: data.id,
      accion: "reporte_creado",
      detalle: { codigo_vehiculo: codigoVehiculo, placa: vehiculo.placa, cedula, concepto_id: input.conceptoId },
      user_id: perms.userId,
      user_email: perms.userEmail,
    });
    revalidatePath("/mantenimiento");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo guardar el reporte." };
  }
}

export async function cerrarAlertaMantenimiento(input: CierreAlertaMantenimientoInput) {
  try {
    const perms = await requireEditorMantenimiento();
    const alertaId = input.alertaId.trim();
    const ordenTaller = input.ordenTaller.trim();
    const notasCierre = input.notasCierre.trim();
    if (!alertaId) throw new Error("La alerta no es válida.");

    // En el sistema del que sale este módulo ambos son obligatorios: una alerta
    // cerrada sin orden ni explicación no deja rastro de qué se hizo.
    if (!ordenTaller) throw new Error("El número de orden de taller es obligatorio.");
    if (!notasCierre) throw new Error("Las notas de cierre son obligatorias.");
    if (input.reportesCerrados.length === 0) {
      throw new Error("Selecciona al menos un reporte para cerrar.");
    }

    const db = createAdminClient();
    const { data: alerta, error: readError } = await db
      .from("mantenimiento_alertas")
      .select("id, estado, codigo_vehiculo, concepto_id")
      .eq("id", alertaId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!alerta || alerta.estado !== "abierta") throw new Error("La alerta ya no está abierta.");

    // Los reportes que el usuario dejó sin marcar se sueltan de la alerta. El
    // filtro por alerta_id impide que un cliente manipulado desvincule
    // reportes de otra alerta.
    const { data: ligados, error: ligadosError } = await db
      .from("mantenimiento_reportes")
      .select("id")
      .eq("alerta_id", alertaId);
    if (ligadosError) throw new Error(ligadosError.message);

    const cerrados = new Set(input.reportesCerrados);
    const desvincular = (ligados ?? []).map((r) => r.id).filter((id) => !cerrados.has(id));
    if (desvincular.length > 0) {
      const { error } = await db
        .from("mantenimiento_reportes")
        .update({ alerta_id: null })
        .eq("alerta_id", alertaId)
        .in("id", desvincular);
      if (error) throw new Error(error.message);
    }

    const { error: updateError } = await db
      .from("mantenimiento_alertas")
      .update({
        estado: "cerrada",
        orden_taller: ordenTaller,
        notas_cierre: notasCierre,
        cerrada_por: perms.userId,
        cerrada_at: new Date().toISOString(),
      })
      .eq("id", alertaId)
      .eq("estado", "abierta");
    if (updateError) throw new Error(updateError.message);

    // `cantidad` no se recalcula a propósito: registra cuántos reportes
    // dispararon la alerta, no cuántos quedaron ligados al cerrarla. Además la
    // tabla exige cantidad >= 2 y cerrar con un solo reporte la violaría.
    await db.from("mantenimiento_auditoria").insert({
      alerta_id: alertaId,
      accion: "alerta_cerrada",
      detalle: {
        codigo_vehiculo: alerta.codigo_vehiculo,
        concepto_id: alerta.concepto_id,
        orden_taller: ordenTaller,
        reportes_cerrados: input.reportesCerrados.length,
        reportes_desvinculados: desvincular.length,
      },
      user_id: perms.userId,
      user_email: perms.userEmail,
    });

    revalidatePath("/mantenimiento");
    revalidatePath("/mantenimiento/alertas");
    revalidatePath("/mantenimiento/reportes");
    return { success: true, desvinculados: desvincular.length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo cerrar la alerta." };
  }
}
