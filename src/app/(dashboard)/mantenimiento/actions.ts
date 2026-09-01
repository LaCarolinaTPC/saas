"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";

export type ReporteMantenimientoInput = {
  placa: string;
  cedula: string;
  conceptoId: string;
  descripcion: string;
  fecha: string;
};

export type BusetaMantenimientoInput = {
  placa: string;
  numeroInterno: string;
  descripcion: string;
};

export type CierreAlertaMantenimientoInput = {
  alertaId: string;
  ordenTaller: string;
  notasCierre: string;
};

async function requireEditorMantenimiento() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "mantenimiento") || !perms.puedeEditar) {
    throw new Error("No tienes permiso para gestionar mantenimiento.");
  }
  return perms;
}

export async function crearReporteMantenimiento(input: ReporteMantenimientoInput) {
  try {
    const perms = await requireEditorMantenimiento();
    const placa = input.placa.trim().toUpperCase();
    const cedula = input.cedula.replace(/\D/g, "");
    if (!placa || !cedula || !input.conceptoId || !input.fecha) {
      throw new Error("Completa vehículo, conductor, concepto y fecha.");
    }
    const fecha = new Date(input.fecha);
    if (Number.isNaN(fecha.getTime())) throw new Error("La fecha no es válida.");

    const db = createAdminClient();
    const [{ data: buseta }, { data: conductor }, { data: concepto }] = await Promise.all([
      db.from("busetas").select("placa").eq("placa", placa).eq("activa", true).maybeSingle(),
      db.from("conductores").select("cedula").eq("cedula", cedula).maybeSingle(),
      db.from("mantenimiento_conceptos").select("id").eq("id", input.conceptoId).eq("activo", true).maybeSingle(),
    ]);
    if (!buseta) throw new Error("La buseta no existe o está inactiva.");
    if (!conductor) throw new Error("El conductor no existe en Gestivo.");
    if (!concepto) throw new Error("El concepto seleccionado no está disponible.");

    const { data, error } = await db.from("mantenimiento_reportes").insert({
      placa_buseta: placa,
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
      detalle: { placa, cedula, concepto_id: input.conceptoId },
      user_id: perms.userId,
      user_email: perms.userEmail,
    });
    revalidatePath("/mantenimiento");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo guardar el reporte." };
  }
}

export async function crearBusetaMantenimiento(input: BusetaMantenimientoInput) {
  try {
    const perms = await requireEditorMantenimiento();
    const placa = input.placa.trim().toUpperCase();
    const numeroInterno = input.numeroInterno.trim();
    if (!placa) throw new Error("La placa es obligatoria.");

    const db = createAdminClient();
    const { error } = await db.from("busetas").insert({
      placa,
      numero_interno: numeroInterno || null,
      descripcion: input.descripcion.trim() || null,
      activa: true,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Ya existe una buseta con esa placa o número interno.");
      throw new Error(error.message);
    }
    await db.from("mantenimiento_auditoria").insert({
      accion: "buseta_creada",
      detalle: { placa, numero_interno: numeroInterno || null },
      user_id: perms.userId,
      user_email: perms.userEmail,
    });
    revalidatePath("/mantenimiento");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo crear la buseta." };
  }
}

export async function cerrarAlertaMantenimiento(input: CierreAlertaMantenimientoInput) {
  try {
    const perms = await requireEditorMantenimiento();
    const alertaId = input.alertaId.trim();
    if (!alertaId) throw new Error("La alerta no es válida.");

    const db = createAdminClient();
    const { data: alerta, error: readError } = await db
      .from("mantenimiento_alertas")
      .select("id, estado, placa_buseta, concepto_id")
      .eq("id", alertaId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!alerta || alerta.estado !== "abierta") throw new Error("La alerta ya no está abierta.");

    const { error: updateError } = await db
      .from("mantenimiento_alertas")
      .update({
        estado: "cerrada",
        orden_taller: input.ordenTaller.trim() || null,
        notas_cierre: input.notasCierre.trim() || null,
        cerrada_por: perms.userId,
        cerrada_at: new Date().toISOString(),
      })
      .eq("id", alertaId);
    if (updateError) throw new Error(updateError.message);

    await db.from("mantenimiento_auditoria").insert({
      alerta_id: alertaId,
      accion: "alerta_cerrada",
      detalle: {
        placa: alerta.placa_buseta,
        concepto_id: alerta.concepto_id,
        orden_taller: input.ordenTaller.trim() || null,
      },
      user_id: perms.userId,
      user_email: perms.userEmail,
    });
    revalidatePath("/mantenimiento");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo cerrar la alerta." };
  }
}
