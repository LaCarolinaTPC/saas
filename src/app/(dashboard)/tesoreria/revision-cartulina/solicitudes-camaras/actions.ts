"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { hoyBogota } from "@/lib/operativo/constants";
import { validarCobro, type CobroInput } from "@/lib/tesoreria/recobros-camaras";
import { getEventosSolicitud, mapRecobro, SELECT_RECOBRO, type EventoSolicitud, type SolicitudRecobro } from "@/lib/tesoreria/recobros-camaras-data";

const RUTA = "/tesoreria/revision-cartulina";

function revalidar() {
  revalidatePath(`${RUTA}/solicitudes-camaras`);
  revalidatePath(RUTA);
  revalidatePath("/tesoreria/devengados");
}

/** El visto es de cartulina; el cobro, de caja. Las dos exigen poder editar. */
async function assertPuede(sub: "cartulina" | "caja") {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", sub)) {
    throw new Error(sub === "caja" ? "Solo caja registra el cobro del recobro." : "No tienes acceso a la revisión de cartulina.");
  }
  if (!perms.isAdmin && !perms.puedeEditar) throw new Error("Tu tipo de usuario es de solo consulta.");
  return perms;
}

async function leer(id: string): Promise<SolicitudRecobro> {
  const db = createAdminClient();
  const { data, error } = await db.from("tesoreria_camaras_solicitudes").select(SELECT_RECOBRO).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La solicitud no existe.");
  return mapRecobro(data as unknown as Record<string, unknown>);
}

/** Cartulina marca como vista la respuesta de cámaras: deja de contar en la alarma. */
export async function marcarRespuestaVista(id: string): Promise<{ success: boolean; error?: string; solicitud?: SolicitudRecobro }> {
  try {
    const perms = await assertPuede("cartulina");
    const sol = await leer(id);
    if (sol.estado !== "resuelto") throw new Error("Cámaras todavía no ha respondido esa solicitud.");
    if (sol.vistoAt) return { success: true, solicitud: sol };

    const db = createAdminClient();
    const ahora = new Date().toISOString();
    const { data, error } = await db
      .from("tesoreria_camaras_solicitudes")
      .update({ visto_at: ahora, visto_por_email: perms.userEmail })
      .eq("id", id)
      .is("visto_at", null)
      .select(SELECT_RECOBRO)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Otro usuario la marcó al mismo tiempo: se devuelve como quedó.
    if (!data) return { success: true, solicitud: await leer(id) };

    await db.from("tesoreria_camaras_solicitudes_eventos").insert({
      solicitud_id: id, accion: "visto", antes: null, despues: { visto_at: ahora }, usuario_email: perms.userEmail,
    });
    await logTesoreriaAudit({
      accion: "recobro_camaras_visto",
      modulo: "tesoreria",
      rol: perms.userType,
      cedulaConductor: sol.conductorCedula,
      conductorNombre: sol.conductorNombre,
      valorNuevo: `Visto · ${sol.resultado === "recobro" ? "Recobro" : "Normalidad de timbradas"}`,
      detalle: { solicitud_id: id, fecha: sol.fechaViaje, numero: sol.numero },
    });
    revalidar();
    return { success: true, solicitud: mapRecobro(data as unknown as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const fotoCobro = (s: SolicitudRecobro) => ({
  estado: s.cobroEstado, valor: s.cobroValor, fecha: s.cobroFecha, soporte: s.cobroSoporte, motivo: s.cobroMotivo, nota: s.cobroNota,
});

/** Caja registra (o corrige) si el recobro se cobró al conductor. Cada guardado queda en el historial. */
export async function registrarCobroRecobro(
  id: string,
  input: CobroInput,
): Promise<{ success: boolean; error?: string; solicitud?: SolicitudRecobro }> {
  try {
    const perms = await assertPuede("caja");
    const sol = await leer(id);
    if (sol.estado !== "resuelto" || sol.resultado !== "recobro") {
      throw new Error("Solo los recobros que cámaras ya resolvió llevan seguimiento de caja.");
    }
    const v = validarCobro(input, { fechaViaje: sol.fechaViaje, hoy: hoyBogota() });
    if (!v.ok) throw new Error(v.error);
    const c = v.cobro;

    const db = createAdminClient();
    const { data, error } = await db
      .from("tesoreria_camaras_solicitudes")
      .update({
        cobro_estado: c.estado,
        cobro_valor: c.valor,
        cobro_fecha: c.fecha,
        cobro_soporte: c.soporte,
        cobro_motivo: c.motivo,
        cobro_nota: c.nota,
        cobro_por_email: perms.userEmail,
        cobro_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(SELECT_RECOBRO)
      .single();
    if (error) throw new Error(error.message);

    const corrige = sol.cobroEstado != null;
    await db.from("tesoreria_camaras_solicitudes_eventos").insert({
      solicitud_id: id,
      accion: corrige ? "cobro_corregido" : "cobro_registrado",
      antes: corrige ? fotoCobro(sol) : null,
      despues: { ...c },
      usuario_email: perms.userEmail,
    });
    await logTesoreriaAudit({
      accion: "recobro_camaras_cobro",
      modulo: "tesoreria",
      rol: perms.userType,
      cedulaConductor: sol.conductorCedula,
      conductorNombre: sol.conductorNombre,
      valor: c.valor,
      valorAnterior: corrige ? (sol.cobroEstado === "cobrado" ? `Cobrado ${sol.cobroValor ?? ""}` : "No cobrado") : null,
      valorNuevo: c.estado === "cobrado" ? `Cobrado · recibo ${c.soporte}` : `No cobrado · ${c.motivo}`,
      detalle: { solicitud_id: id, fecha: sol.fechaViaje, numero: sol.numero, corregido: corrige },
    });
    revalidar();
    return { success: true, solicitud: mapRecobro(data as unknown as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Historial de una solicitud, para quien puede ver la pestaña. */
export async function listarEventosSolicitud(id: string): Promise<{ success: boolean; error?: string; eventos?: EventoSolicitud[] }> {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccessSub(perms, "tesoreria", "cartulina") && !canAccessSub(perms, "tesoreria", "caja")) {
      throw new Error("No tienes acceso a las solicitudes a cámaras.");
    }
    return { success: true, eventos: await getEventosSolicitud(id) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
