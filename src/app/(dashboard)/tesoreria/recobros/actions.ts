"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPermissions } from "@/lib/permissions";
import { getEventosSolicitud, type EventoSolicitud } from "@/lib/tesoreria/recobros-camaras-data";
import { rolRecobros } from "@/lib/tesoreria/recobros-acceso";
import { refrescarRecobrosDelDia, type RefrescoRecobros } from "@/lib/gema/recobros-al-dia";

/** Eventos de la línea de tiempo de un recobro (toma, resolución, cobros, correcciones…). */
export async function obtenerEventosRecobro(id: string): Promise<{ ok: boolean; error?: string; eventos?: EventoSolicitud[] }> {
  try {
    const perms = await getCurrentPermissions();
    if (!rolRecobros(perms).ve) return { ok: false, error: "No tienes acceso a los recobros." };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Recobro no válido." };
    return { ok: true, eventos: await getEventosSolicitud(id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** «Actualizar desde GEMA» de la página: abonos, despacho y recaudo del día. */
export async function actualizarRecobrosPagina(): Promise<{ ok: boolean; error?: string; refresco?: RefrescoRecobros }> {
  const perms = await getCurrentPermissions();
  if (!rolRecobros(perms).ve) return { ok: false, error: "No tienes acceso a los recobros." };
  const refresco = await refrescarRecobrosDelDia({ forzar: true });
  revalidatePath("/tesoreria/recobros");
  return { ok: !refresco.error, error: refresco.error, refresco };
}
