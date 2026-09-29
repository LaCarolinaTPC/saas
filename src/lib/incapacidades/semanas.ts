/**
 * Acreditación de las semanas cotizadas (migración 20260929221301), lado
 * servidor. Las reglas puras están en semanas-reglas.ts.
 *
 * RRHH acredita cuando el trabajador sí tenía las semanas porque cotizaba con
 * otro empleador sin interrupción: exige motivo y un soporte vigente del
 * expediente (el certificado de la EPS). La base solo reconoce la acreditación
 * mientras ese soporte no esté anulado. Escritura con control de versión.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExpedienteVista } from "./expedientes";
import { ConflictoVersion, type Actor } from "./liquidacion";
import { acreditacionValida, puedeAcreditar } from "./semanas-reglas";

async function leerVista(id: string): Promise<ExpedienteVista> {
  const { data, error } = await createAdminClient().from("vw_incapacidad_expedientes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("El expediente no existe.");
  return data as ExpedienteVista;
}

async function actualizar(id: string, version: number, cambios: Record<string, unknown>) {
  const { data, error } = await createAdminClient()
    .from("incapacidad_expedientes")
    .update(cambios)
    .eq("id", id)
    .eq("version", version)
    .is("eliminado_at", null)
    .select("version");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ConflictoVersion();
}

async function bitacora(expedienteId: string, accion: string, antes: unknown, despues: unknown, email: string | null) {
  try {
    await createAdminClient().from("ausentismo_log").insert({ registro_id: expedienteId, accion, datos_anteriores: antes ?? null, datos_nuevos: despues ?? null, user_email: email });
  } catch (e) {
    console.error("[incapacidades] no se pudo escribir la bitácora:", e);
  }
}

export async function acreditarSemanas(id: string, version: number, d: { motivo: string | null; adjunto_id: string | null }, actor: Actor): Promise<void> {
  const v = await leerVista(id);
  if (v.version !== version) throw new ConflictoVersion();
  if (!puedeAcreditar(v)) throw new Error("Este expediente no necesita acreditar semanas: cumple el requisito o lo paga la ARL.");
  const invalido = acreditacionValida(d.motivo, d.adjunto_id);
  if (invalido) throw new Error(invalido);

  const { data: adj, error } = await createAdminClient()
    .from("incapacidad_adjuntos")
    .select("id, archivo_nombre")
    .eq("id", d.adjunto_id!)
    .eq("expediente_id", id)
    .is("anulado_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!adj) throw new Error("El soporte elegido no está vigente en este expediente.");

  const motivo = d.motivo!.replace(/\s+/g, " ").trim();
  await actualizar(id, version, {
    semanas_acreditadas_at: new Date().toISOString(),
    semanas_acreditadas_por_email: actor.email,
    semanas_acreditadas_motivo: motivo,
    semanas_acreditadas_adjunto_id: adj.id,
  });
  await bitacora(id, "semanas_acreditadas", { requisito_semanas: v.requisito_semanas, dias_previos_vinculacion: v.dias_previos_vinculacion },
    { motivo, adjunto_id: adj.id, adjunto: adj.archivo_nombre }, actor.email);
}

export async function retirarAcreditacion(id: string, version: number, motivo: string | null, actor: Actor): Promise<void> {
  const v = await leerVista(id);
  if (v.version !== version) throw new ConflictoVersion();
  if (!v.semanas_acreditadas_at) throw new Error("El expediente no tiene semanas acreditadas.");
  const m = (motivo ?? "").replace(/\s+/g, " ").trim();
  if (m.length < 5) throw new Error("Escribe el motivo del retiro (mínimo 5 caracteres).");
  await actualizar(id, version, {
    semanas_acreditadas_at: null,
    semanas_acreditadas_por_email: null,
    semanas_acreditadas_motivo: null,
    semanas_acreditadas_adjunto_id: null,
  });
  await bitacora(id, "semanas_acreditacion_retirada",
    { motivo: v.semanas_acreditadas_motivo, adjunto_id: v.semanas_acreditadas_adjunto_id, por: v.semanas_acreditadas_por_email },
    { motivo: m }, actor.email);
}
