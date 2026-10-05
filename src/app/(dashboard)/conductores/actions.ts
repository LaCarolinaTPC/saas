"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { causaLabel, validarRetiro, type RetiroRegistrado } from "@/lib/conductores/retiro";
import { RETIRO_SELECT, mapRetiro, type RetiroRow } from "@/lib/conductores/retiro-data";

/**
 * Registra o corrige la causa y la nota del retiro vigente de un conductor
 * RETIRADO. Una fila por cédula y fecha de retiro (la de `conductores` en
 * este momento); si ya existe, se actualiza y el cambio queda en la bitácora.
 */
export async function guardarCausaRetiro(input: {
  cedula: string;
  causa: string;
  nota: string;
}): Promise<{ success: boolean; error?: string; retiro?: RetiroRegistrado }> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.isAdmin && !canAccess(perms, "conductores")) throw new Error("No tienes acceso al módulo Conductores.");
    if (!perms.isAdmin && !perms.puedeEditar) throw new Error("Tu tipo de usuario es de solo consulta.");

    const cedula = String(input.cedula ?? "").trim();
    if (!cedula) throw new Error("Falta la cédula del conductor.");
    const causa = String(input.causa ?? "").trim();
    const nota = String(input.nota ?? "").trim();
    const invalido = validarRetiro(causa, nota);
    if (invalido) throw new Error(invalido);

    const db = createAdminClient();
    const { data: conductor, error: errC } = await db
      .from("conductores")
      .select("cedula, nombre, estado, fecha_retiro")
      .eq("cedula", cedula)
      .maybeSingle();
    if (errC) throw new Error(errC.message);
    if (!conductor) throw new Error("El conductor no existe.");
    if (String(conductor.estado ?? "").toUpperCase() !== "RETIRADO") {
      throw new Error("Solo se registra la causa de retiro de conductores en estado RETIRADO.");
    }
    const fechaRetiro = (conductor.fecha_retiro as string | null) ?? null;

    let q = db.from("conductores_retiro").select(RETIRO_SELECT).eq("cedula", cedula);
    q = fechaRetiro ? q.eq("fecha_retiro", fechaRetiro) : q.is("fecha_retiro", null);
    const { data: previo, error: errP } = await q.maybeSingle();
    if (errP) throw new Error(errP.message);
    const anterior = previo as RetiroRow | null;
    const ahora = new Date().toISOString();

    const { data, error } = anterior
      ? await (() => {
          let u = db
            .from("conductores_retiro")
            .update({ causa, nota: nota || null, actualizado_por_email: perms.userEmail, actualizado_at: ahora })
            .eq("cedula", cedula);
          u = fechaRetiro ? u.eq("fecha_retiro", fechaRetiro) : u.is("fecha_retiro", null);
          return u.select(RETIRO_SELECT).single();
        })()
      : await db
          .from("conductores_retiro")
          .insert({
            cedula,
            fecha_retiro: fechaRetiro,
            causa,
            nota: nota || null,
            registrado_por_email: perms.userEmail,
            actualizado_por_email: perms.userEmail,
          })
          .select(RETIRO_SELECT)
          .single();
    if (error) throw new Error(error.message);
    const retiro = mapRetiro(data as RetiroRow);

    await logTesoreriaAudit({
      accion: anterior ? "retiro_causa_editada" : "retiro_causa_registrada",
      modulo: "conductores",
      cedulaConductor: cedula,
      conductorNombre: (conductor.nombre as string | null) ?? null,
      rol: perms.userType,
      valorAnterior: anterior ? `${causaLabel(anterior.causa)}${anterior.nota ? ` · ${anterior.nota}` : ""}` : null,
      valorNuevo: `${causaLabel(causa)}${nota ? ` · ${nota}` : ""}`,
      detalle: { fecha_retiro: fechaRetiro, causa, causa_anterior: anterior?.causa ?? null },
    });

    revalidatePath("/conductores");
    revalidatePath(`/conductores/${cedula}`);
    return { success: true, retiro };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
