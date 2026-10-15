/**
 * Operaciones internas del Plan Padrino (solo servidor, sin "use server": no
 * se exponen como acciones). Quien las llama ya verificó los permisos.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "./datos";

type Actor = { userId: string | null; userEmail: string | null };

export async function bitacora(referidoId: string, accion: string, detalle: Record<string, unknown>, actor: Actor) {
  const { error } = await createAdminClient().from("padrino_eventos").insert({
    referido_id: referidoId,
    accion,
    detalle,
    user_id: actor.userId,
    usuario_email: actor.userEmail,
  });
  if (error) console.error("[padrino] no se pudo escribir la bitácora:", error.message);
}

/**
 * Si el proceso del referido elegible ya está en "contratado", lo pasa a
 * Contratado con la fecha de ingreso: la de contrato del proceso; si no la
 * tiene, la de (re)ingreso del conductor; si tampoco, hoy. La llaman la
 * decisión de elegibilidad y Procesos de contratación al guardar. Nunca
 * lanza: un fallo aquí no debe impedir guardar el proceso.
 */
export async function sincronizarConProceso(procesoId: string | null, actor: Actor) {
  if (!procesoId) return;
  try {
    const admin = createAdminClient();
    const { data: refs, error } = await admin
      .from("padrino_referidos")
      .select("id, cedula_referido")
      .eq("proceso_id", procesoId)
      .eq("estado", "elegible")
      .is("anulado_at", null);
    // Sin la migración aplicada la tabla no existe: no hay nada que sincronizar.
    if (error || !refs?.length) return;
    const { data: p } = await admin.from("procesos_contratacion").select("estado, fecha_contrato").eq("id", procesoId).maybeSingle();
    if (p?.estado !== "contratado") return;
    for (const r of refs) {
      const { data: c } = await admin.from("conductores").select("fecha_ingreso, fecha_reingreso").eq("cedula", r.cedula_referido).maybeSingle();
      const fecha = (p.fecha_contrato as string | null) ?? (c?.fecha_reingreso as string | null) ?? (c?.fecha_ingreso as string | null) ?? hoyBogota();
      const fuente = p.fecha_contrato ? "fecha de contrato del proceso" : c?.fecha_reingreso || c?.fecha_ingreso ? "ingreso del conductor" : "fecha de hoy";
      const { error: e } = await admin
        .from("padrino_referidos")
        .update({ estado: "contratado", fecha_ingreso: fecha, updated_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("estado", "elegible");
      if (!e) await bitacora(r.id as string, "contratado", { fecha_ingreso: fecha, fuente }, actor);
    }
    revalidatePath("/candidatos/plan-padrino");
  } catch (e) {
    console.error("[padrino] no se pudo sincronizar con el proceso:", e);
  }
}
