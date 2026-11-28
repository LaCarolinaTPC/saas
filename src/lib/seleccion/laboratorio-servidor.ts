/**
 * Contactos de laboratorio (entrega 3, M3). Un número marcado como
 * laboratorio no es un aspirante: el asistente, el seguimiento y la
 * reactivación lo saltan, para que no le lleguen «¿sigues interesado?» ni
 * se le cree un proceso con sus datos. Solo servidor.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type TipoContacto = "persona" | "laboratorio";

/** ¿El contacto de la conversación es un laboratorio? Sin la migración (o si falla), no. */
export async function esConversacionDeLaboratorio(conversacionId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("wa_conversaciones").select("wa_contactos(tipo)").eq("id", conversacionId).maybeSingle();
  if (error || !data) return false;
  const c = (Array.isArray(data.wa_contactos) ? data.wa_contactos[0] : data.wa_contactos) as { tipo?: string } | null;
  return c?.tipo === "laboratorio";
}

/** Ids de las conversaciones de laboratorio entre las dadas (para filtrar listas del cron). */
export async function conversacionesDeLaboratorio(ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await createAdminClient().from("wa_conversaciones").select("id, wa_contactos(tipo)").in("id", [...ids]);
  if (error) return new Set();
  return new Set(
    (data ?? [])
      .filter((f) => ((Array.isArray(f.wa_contactos) ? f.wa_contactos[0] : f.wa_contactos) as { tipo?: string } | null)?.tipo === "laboratorio")
      .map((f) => f.id as string)
  );
}

/** Tipo del contacto por su teléfono (como lo guarda Meta, sin «+»). Sin la migración, «persona». */
export async function tipoDeContacto(telefono: string): Promise<TipoContacto> {
  const { data, error } = await createAdminClient().from("wa_contactos").select("tipo").eq("telefono", telefono).maybeSingle();
  return !error && data?.tipo === "laboratorio" ? "laboratorio" : "persona";
}

export async function marcarTipoContacto(telefono: string, tipo: TipoContacto): Promise<{ ok: boolean; error?: string }> {
  if (tipo !== "persona" && tipo !== "laboratorio") return { ok: false, error: "Tipo no válido." };
  const { error } = await createAdminClient().from("wa_contactos").update({ tipo }).eq("telefono", telefono);
  if (error) return { ok: false, error: `No se pudo guardar (${error.message}). ¿Falta aplicar la migración de la entrega 3?` };
  return { ok: true };
}
