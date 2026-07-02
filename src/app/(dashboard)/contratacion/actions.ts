"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";

export interface ProcesoInput {
  fecha_creacion: string;
  nombre: string;
  cedula: string;
  celular: string | null;
  reingreso: boolean;
  estado: string;
  causa_no_contrato: string | null;
  observacion: string | null;
  simit: string | null;
  simit_valor: number;
  antecedentes: string | null;
  licencia_categoria: string | null;
  medio_postulacion: string | null;
  fecha_citacion: string | null;
  fecha_examenes: string | null;
  fecha_prueba_manejo: string | null;
  fecha_contrato: string | null;
}

async function assertEditor() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !perms.puedeEditar) {
    throw new Error("No tienes permisos para gestionar procesos de contratación.");
  }
  return perms;
}

/**
 * Todo proceso de contratación es un candidato: busca por cédula y, si no
 * existe, lo crea para que aparezca en el módulo de Candidatos.
 */
async function ensureCandidateId(row: {
  cedula: string;
  nombre: string;
  celular: string | null;
  medio_postulacion: string | null;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("candidates")
    .select("id")
    .eq("document_number", row.cedula)
    .maybeSingle();
  if (data) return data.id;

  const { data: created, error } = await admin
    .from("candidates")
    .insert({
      full_name: row.nombre,
      document_number: row.cedula,
      phone: row.celular,
      source: row.medio_postulacion ?? "contratacion",
    })
    .select("id")
    .single();
  // La creación del candidato no debe bloquear el guardado del proceso.
  if (error) return null;
  return created.id;
}

function sanitize(input: ProcesoInput) {
  return {
    fecha_creacion: input.fecha_creacion,
    nombre: input.nombre.trim().toUpperCase(),
    cedula: input.cedula.trim(),
    celular: input.celular?.trim() || null,
    reingreso: input.reingreso,
    estado: input.estado,
    causa_no_contrato: input.estado === "cierre" ? input.causa_no_contrato?.trim() || null : null,
    observacion: input.observacion?.trim() || null,
    simit: input.simit || null,
    simit_valor: Number.isFinite(input.simit_valor) ? input.simit_valor : 0,
    antecedentes: input.antecedentes || null,
    licencia_categoria: input.licencia_categoria?.trim() || null,
    medio_postulacion: input.medio_postulacion || null,
    fecha_citacion: input.fecha_citacion || null,
    fecha_examenes: input.fecha_examenes || null,
    fecha_prueba_manejo: input.fecha_prueba_manejo || null,
    fecha_contrato: input.fecha_contrato || null,
  };
}

export async function createProceso(input: ProcesoInput) {
  const perms = await assertEditor();
  if (!input.nombre.trim() || !input.cedula.trim()) {
    throw new Error("Nombre y cédula son obligatorios.");
  }
  const admin = createAdminClient();
  const row = sanitize(input);
  const { error } = await admin.from("procesos_contratacion").insert({
    ...row,
    candidate_id: await ensureCandidateId(row),
    created_by: perms.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/contratacion");
}

export async function updateProceso(id: string, input: ProcesoInput) {
  await assertEditor();
  const admin = createAdminClient();
  const row = sanitize(input);
  const { error } = await admin
    .from("procesos_contratacion")
    .update({ ...row, candidate_id: await ensureCandidateId(row) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contratacion");
}

/** Cambio rápido de estado desde la tabla (sin abrir el formulario). */
export async function updateProcesoEstado(id: string, estado: string) {
  await assertEditor();
  if (!PROCESO_ESTADOS.some((e) => e.value === estado)) throw new Error("Estado inválido.");
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { estado };
  if (estado !== "cierre") patch.causa_no_contrato = null;
  const { error } = await admin.from("procesos_contratacion").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contratacion");
}

export async function deleteProceso(id: string) {
  await assertEditor();
  const admin = createAdminClient();
  const { error } = await admin.from("procesos_contratacion").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contratacion");
}
