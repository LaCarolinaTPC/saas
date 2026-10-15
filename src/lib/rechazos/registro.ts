/**
 * Registro de rechazos de candidatos (solo servidor).
 *
 * Lo usan las dos vías que rechazan: el pipeline (Kanban y tabla, en
 * src/lib/actions.ts) y Procesos de contratación (src/lib/contratacion/
 * actions.ts). Las tablas tienen RLS sin políticas: se escriben con el
 * cliente admin después de verificar permisos en la acción que llama.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { CAUSA_MAX, normalizarCausa } from "./causas";

type Admin = ReturnType<typeof createAdminClient>;

export type OrigenRechazo = "pipeline" | "tabla" | "procesos";

/** Causa del catálogo con ese nombre (sin importar mayúsculas ni tildes); si no existe, la crea. */
export async function obtenerOCrearCausa(
  admin: Admin,
  texto: string,
  email: string | null
): Promise<{ id: string; nombre: string }> {
  const nombre = texto.trim().replace(/\s+/g, " ").slice(0, CAUSA_MAX);
  const norm = normalizarCausa(nombre);
  const buscar = () =>
    admin.from("causas_rechazo").select("id, nombre").eq("nombre_normalizado", norm).maybeSingle();

  const { data: existente } = await buscar();
  if (existente) return existente;

  const { data, error } = await admin
    .from("causas_rechazo")
    .insert({ nombre, nombre_normalizado: norm, creado_por_email: email })
    .select("id, nombre")
    .single();
  if (data) return data;
  // Otro usuario la creó al mismo tiempo: el índice único la rechaza y se usa la suya.
  const { data: carrera } = await buscar();
  if (carrera) return carrera;
  throw new Error(`No se pudo registrar la causa: ${error?.message ?? "error desconocido"}`);
}

/** Rechazo vigente (sin revertir) del candidato en la vacante, si lo hay. */
async function rechazoAbierto(admin: Admin, candidateId: string | null, vacancyId: string | null, procesoId?: string | null) {
  let q = admin.from("rechazos_candidato").select("id").is("revertido_at", null).limit(1);
  if (candidateId) {
    q = q.eq("candidate_id", candidateId);
    q = vacancyId ? q.eq("vacancy_id", vacancyId) : q.is("vacancy_id", null);
  } else if (procesoId) {
    q = q.eq("proceso_id", procesoId);
  } else {
    return null;
  }
  const { data } = await q.maybeSingle();
  return data;
}

export async function registrarRechazo(
  admin: Admin,
  p: {
    candidateId: string | null;
    vacancyId: string | null;
    candidateVacancyId?: string | null;
    procesoId?: string | null;
    /** Clave de la etapa del pipeline en que estaba; null si no se sabe. */
    faseOrigen: string | null;
    causa: string;
    nota?: string | null;
    origen: OrigenRechazo;
    email: string | null;
    /** Copia de nombre y cédula cuando no hay candidato (procesos sin candidato). */
    nombre?: string | null;
    cedula?: string | null;
  }
) {
  // Un candidato ya rechazado en la vacante no se registra dos veces
  // (p. ej. un proceso que se guarda de nuevo en cierre).
  if (await rechazoAbierto(admin, p.candidateId, p.vacancyId, p.procesoId)) return;

  const [causa, cand, vac, fase, cv] = await Promise.all([
    obtenerOCrearCausa(admin, p.causa, p.email),
    p.candidateId
      ? admin.from("candidates").select("full_name, document_number").eq("id", p.candidateId).maybeSingle()
      : Promise.resolve({ data: null }),
    p.vacancyId
      ? admin.from("vacancies").select("title").eq("id", p.vacancyId).maybeSingle()
      : Promise.resolve({ data: null }),
    p.faseOrigen
      ? admin.from("pipeline_stages").select("label").eq("key", p.faseOrigen).maybeSingle()
      : Promise.resolve({ data: null }),
    p.candidateVacancyId === undefined && p.candidateId && p.vacancyId
      ? admin.from("candidate_vacancy").select("id").eq("candidate_id", p.candidateId).eq("vacancy_id", p.vacancyId).maybeSingle()
      : Promise.resolve({ data: p.candidateVacancyId ? { id: p.candidateVacancyId } : null }),
  ]);

  const nota = p.nota?.trim() || null;
  const { error } = await admin.from("rechazos_candidato").insert({
    candidate_id: p.candidateId,
    vacancy_id: p.vacancyId,
    candidate_vacancy_id: cv.data?.id ?? null,
    proceso_id: p.procesoId ?? null,
    nombre: cand.data?.full_name ?? p.nombre ?? null,
    cedula: cand.data?.document_number ?? p.cedula ?? null,
    vacante: vac.data?.title ?? null,
    fase_origen: p.faseOrigen,
    fase_origen_label: fase.data?.label ?? p.faseOrigen,
    causa_id: causa.id,
    causa: causa.nombre,
    nota,
    origen: p.origen,
    registrado_por_email: p.email,
  });
  if (error) throw new Error(`No se pudo registrar el rechazo: ${error.message}`);
}

/** Corrige la causa del rechazo vigente (al editar un proceso que sigue en cierre). */
export async function corregirCausaRechazo(
  admin: Admin,
  p: { candidateId: string | null; vacancyId: string | null; procesoId: string; causa: string; email: string | null }
) {
  const abierto = await rechazoAbierto(admin, p.candidateId, p.vacancyId, p.procesoId);
  if (!abierto) return;
  const causa = await obtenerOCrearCausa(admin, p.causa, p.email);
  await admin.from("rechazos_candidato").update({ causa_id: causa.id, causa: causa.nombre }).eq("id", abierto.id);
}

/**
 * El candidato se reactivó: el rechazo no se borra, queda como revertido con
 * quién, cuándo y a qué fase volvió, y deja de contar en el reporte.
 */
export async function revertirRechazos(
  admin: Admin,
  p: { candidateId: string | null; vacancyId: string | null; procesoId?: string | null; aFase: string; email: string | null }
) {
  let q = admin
    .from("rechazos_candidato")
    .update({ revertido_at: new Date().toISOString(), revertido_por_email: p.email, revertido_a_fase: p.aFase })
    .is("revertido_at", null);
  if (p.candidateId) {
    q = q.eq("candidate_id", p.candidateId);
    q = p.vacancyId ? q.eq("vacancy_id", p.vacancyId) : q.is("vacancy_id", null);
  } else if (p.procesoId) {
    q = q.eq("proceso_id", p.procesoId);
  } else {
    return;
  }
  const { error } = await q;
  if (error) console.error("[rechazos] no se pudo marcar el rechazo como revertido:", error.message);
}

/** Tipo de cada etapa del pipeline pedida ("normal" | "ganado" | "perdido"). */
export async function tiposDeEtapa(admin: Admin, keys: string[]): Promise<Map<string, string>> {
  const { data } = await admin.from("pipeline_stages").select("key, tipo").in("key", keys.filter(Boolean));
  return new Map((data ?? []).map((e: { key: string; tipo: string }) => [e.key, e.tipo]));
}
