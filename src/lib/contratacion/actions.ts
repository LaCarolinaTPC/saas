"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { PROCESO_ESTADOS, campoFecha } from "@/lib/contratacion/constants";
import { normalizarCausa, validarRechazo } from "@/lib/rechazos/causas";
import { corregirCausaRechazo, registrarRechazo, revertirRechazos } from "@/lib/rechazos/registro";

export interface ProcesoInput {
  fecha_creacion: string;
  nombre: string;
  cedula: string;
  vacancy_id: string | null;
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
  fecha_examenes_fase2: string | null;
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
    vacancy_id: input.vacancy_id || null,
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
    fecha_examenes_fase2: input.fecha_examenes_fase2 || null,
    fecha_prueba_manejo: input.fecha_prueba_manejo || null,
    fecha_contrato: input.fecha_contrato || null,
  };
}

/** El pipeline usa los estados del proceso; solo difieren estos dos. */
const ESTADO_TO_STAGE: Record<string, string> = {
  pendiente: "recibido",
  cierre: "rechazado",
};
const stageForEstado = (estado: string) => ESTADO_TO_STAGE[estado] ?? estado;

/**
 * Vincula el candidato a la vacante en el pipeline (idempotente) y
 * sincroniza la etapa con el estado del proceso. Si la etapa cambia, lo deja
 * en stage_history como cualquier otro movimiento del pipeline.
 */
async function linkCandidateToVacancy(
  candidateId: string | null,
  vacancyId: string | null,
  estado: string,
  userId: string | null
) {
  if (!candidateId || !vacancyId) return;
  const admin = createAdminClient();
  // El vínculo al pipeline no debe bloquear el guardado del proceso.
  await admin
    .from("candidate_vacancy")
    .upsert(
      { candidate_id: candidateId, vacancy_id: vacancyId },
      { onConflict: "candidate_id,vacancy_id", ignoreDuplicates: true }
    );
  const { data: cv } = await admin
    .from("candidate_vacancy")
    .select("id, current_stage")
    .eq("candidate_id", candidateId)
    .eq("vacancy_id", vacancyId)
    .maybeSingle();
  const stage = stageForEstado(estado);
  if (!cv || cv.current_stage === stage) return;
  await admin.from("candidate_vacancy").update({ current_stage: stage }).eq("id", cv.id);
  await admin.from("stage_history").insert({
    candidate_vacancy_id: cv.id,
    from_stage: cv.current_stage,
    to_stage: stage,
    changed_by: userId,
    notes: "Desde Procesos de contratación",
  });
}

/**
 * Deja el rechazo trazable cuando un proceso entra a "cierre" (con la fase
 * en que estaba), corrige su causa si sigue cerrado, o lo marca revertido si
 * se reabre.
 */
async function sincronizarRechazo(p: {
  procesoId: string;
  candidateId: string | null;
  vacancyId: string | null;
  nombre: string;
  cedula: string;
  estadoAnterior: string | null;
  causaAnterior: string | null;
  estado: string;
  causa: string | null;
  nota: string | null;
  email: string | null;
}) {
  const admin = createAdminClient();
  const base = { candidateId: p.candidateId, vacancyId: p.vacancyId, procesoId: p.procesoId, email: p.email };
  if (p.estado === "cierre" && p.estadoAnterior !== "cierre") {
    await registrarRechazo(admin, {
      ...base,
      // Un proceso que nace cerrado se rechazó en la recepción.
      faseOrigen: stageForEstado(p.estadoAnterior ?? "pendiente"),
      causa: p.causa!,
      nota: p.nota,
      origen: "procesos",
      nombre: p.nombre,
      cedula: p.cedula,
    });
  } else if (p.estado === "cierre" && normalizarCausa(p.causa ?? "") !== normalizarCausa(p.causaAnterior ?? "")) {
    await corregirCausaRechazo(admin, { ...base, causa: p.causa! });
  } else if (p.estado !== "cierre" && p.estadoAnterior === "cierre") {
    await revertirRechazos(admin, { ...base, aFase: stageForEstado(p.estado) });
  }
}

/** El cierre exige causa; se valida en el servidor aunque el formulario ya lo haga. */
function validarCierre(row: { estado: string; causa_no_contrato: string | null }) {
  if (row.estado !== "cierre") return;
  const error = validarRechazo(row.causa_no_contrato);
  if (error) throw new Error(error);
}

/**
 * Alta automática al pasar a "contratado": si la vacante es de conducción
 * el candidato se crea como CONDUCTOR (rotación); si no, como EMPLEADO.
 * Nunca duplica (busca por cédula) y no bloquea el guardado del proceso:
 * GEMA completará/actualizará los datos del conductor/empleado en el
 * siguiente sync (upsert por cédula/código).
 */
async function ensureAltaContratado(p: {
  cedula: string;
  nombre: string;
  celular: string | null;
  licencia_categoria: string | null;
  fecha_contrato: string | null;
  vacancy_id: string | null;
  candidate_id?: string | null;
}) {
  try {
    const admin = createAdminClient();

    let vacTitle: string | null = null;
    let vacDepartment: string | null = null;
    if (p.vacancy_id) {
      const { data: vac } = await admin
        .from("vacancies")
        .select("title, department_id")
        .eq("id", p.vacancy_id)
        .maybeSingle();
      vacTitle = vac?.title ?? null;
      vacDepartment = vac?.department_id ?? null;
    }
    const esConductor = (vacTitle ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .includes("conductor");

    const fechaIngreso =
      p.fecha_contrato ||
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

    if (esConductor) {
      const { data: existente } = await admin
        .from("conductores")
        .select("id, estado")
        .eq("cedula", p.cedula)
        .maybeSingle();
      if (existente) {
        // Reingreso: reactivar sin pisar el histórico que mantiene GEMA.
        if (existente.estado !== "ACTIVO") {
          await admin
            .from("conductores")
            .update({ estado: "ACTIVO", fecha_reingreso: fechaIngreso, fecha_retiro: null })
            .eq("id", existente.id);
        }
      } else {
        await admin.from("conductores").insert({
          cedula: p.cedula,
          nombre: p.nombre,
          celular: p.celular,
          licencia: p.licencia_categoria,
          fecha_ingreso: fechaIngreso,
          estado: "ACTIVO",
          observacion: "Creado automáticamente al contratar (módulo Candidatos)",
        });
      }
    } else {
      const { data: existente } = await admin
        .from("employees")
        .select("id, status")
        .eq("document_number", p.cedula)
        .limit(1)
        .maybeSingle();
      if (existente) {
        if (existente.status === "retirado" || existente.status === "inactivo") {
          await admin
            .from("employees")
            .update({ status: "activo", end_date: null })
            .eq("id", existente.id);
        }
      } else {
        await admin.from("employees").insert({
          full_name: p.nombre,
          document_number: p.cedula,
          phone: p.celular,
          position: vacTitle ?? "Por definir",
          department_id: vacDepartment,
          hire_date: fechaIngreso,
          status: "activo",
          candidate_id: p.candidate_id ?? null,
          observations: "Creado automáticamente al contratar (módulo Candidatos)",
        });
      }
    }
    revalidatePath(esConductor ? "/conductores" : "/empleados");
  } catch (e) {
    // El alta automática nunca debe impedir guardar el proceso.
    console.error("[contratacion] no se pudo crear el empleado/conductor:", e);
  }
}

/** Crea el proceso (y el candidato si no existe). Devuelve el id del proceso. */
export async function createProceso(input: ProcesoInput): Promise<{ id: string }> {
  const perms = await assertEditor();
  if (!input.nombre.trim() || !input.cedula.trim()) {
    throw new Error("Nombre y cédula son obligatorios.");
  }
  const admin = createAdminClient();
  const row = sanitize(input);
  validarCierre(row);
  const candidateId = await ensureCandidateId(row);
  const { data, error } = await admin
    .from("procesos_contratacion")
    .insert({
      ...row,
      candidate_id: candidateId,
      created_by: perms.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await linkCandidateToVacancy(candidateId, row.vacancy_id, row.estado, perms.userId);
  await sincronizarRechazo({
    procesoId: data.id as string,
    candidateId,
    vacancyId: row.vacancy_id,
    nombre: row.nombre,
    cedula: row.cedula,
    estadoAnterior: null,
    causaAnterior: null,
    estado: row.estado,
    causa: row.causa_no_contrato,
    nota: null,
    email: perms.userEmail,
  });
  if (row.estado === "contratado") {
    await ensureAltaContratado({ ...row, candidate_id: candidateId });
  }
  revalidatePath("/candidatos");
  return { id: data.id as string };
}

export async function updateProceso(id: string, input: ProcesoInput) {
  const perms = await assertEditor();
  const admin = createAdminClient();
  const row = sanitize(input);
  validarCierre(row);
  const { data: antes } = await admin
    .from("procesos_contratacion")
    .select("estado, causa_no_contrato")
    .eq("id", id)
    .maybeSingle();
  const candidateId = await ensureCandidateId(row);
  const { error } = await admin
    .from("procesos_contratacion")
    .update({ ...row, candidate_id: candidateId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await linkCandidateToVacancy(candidateId, row.vacancy_id, row.estado, perms.userId);
  await sincronizarRechazo({
    procesoId: id,
    candidateId,
    vacancyId: row.vacancy_id,
    nombre: row.nombre,
    cedula: row.cedula,
    estadoAnterior: antes?.estado ?? null,
    causaAnterior: antes?.causa_no_contrato ?? null,
    estado: row.estado,
    causa: row.causa_no_contrato,
    nota: null,
    email: perms.userEmail,
  });
  if (row.estado === "contratado") {
    await ensureAltaContratado({ ...row, candidate_id: candidateId });
  }
  revalidatePath("/candidatos");
}

/** Cambio rápido de estado desde la tabla (sin abrir el formulario). */
export async function updateProcesoEstado(id: string, estado: string) {
  const perms = await assertEditor();
  if (!PROCESO_ESTADOS.some((e) => e.value === estado)) throw new Error("Estado inválido.");
  // El cierre pide causa: solo se hace desde el formulario.
  if (estado === "cierre") throw new Error("Para cerrar el proceso use el formulario: la causa es obligatoria.");
  const admin = createAdminClient();
  const { data: antes } = await admin
    .from("procesos_contratacion")
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  const { data: proc, error } = await admin
    .from("procesos_contratacion")
    .update({ estado, causa_no_contrato: null })
    .eq("id", id)
    .select("candidate_id, vacancy_id, nombre, cedula, celular, licencia_categoria, fecha_contrato")
    .single();
  if (error) throw new Error(error.message);
  await linkCandidateToVacancy(proc.candidate_id, proc.vacancy_id, estado, perms.userId);
  await sincronizarRechazo({
    procesoId: id,
    candidateId: proc.candidate_id,
    vacancyId: proc.vacancy_id,
    nombre: proc.nombre,
    cedula: proc.cedula,
    estadoAnterior: antes?.estado ?? null,
    causaAnterior: null,
    estado,
    causa: null,
    nota: null,
    email: perms.userEmail,
  });
  if (estado === "contratado") {
    await ensureAltaContratado(proc);
  }
  revalidatePath("/candidatos");
}

export async function deleteProceso(id: string) {
  await assertEditor();
  const admin = createAdminClient();
  const { error } = await admin.from("procesos_contratacion").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/candidatos");
}

export interface ExportFilters {
  q?: string;
  estado?: string;
  medio?: string;
  /** Campo de fecha que segmenta el rango: creacion (por defecto) | citacion. */
  campo?: string;
  desde?: string;
  hasta?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_MAX = 5000;

/**
 * Filas para la exportación a Excel de la relación de procesos: mismos
 * filtros de la pantalla pero SIN paginar (la tabla pagina de a 50).
 * Solo lectura; requiere acceso al módulo candidatos.
 */
export async function exportarProcesos(
  f: ExportFilters
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) {
    return { rows: [], error: "Sin permisos para exportar candidatos." };
  }
  const admin = createAdminClient();
  const campo = campoFecha(f.campo);
  let q = admin
    .from("procesos_contratacion")
    .select("*, vacancies(title)")
    .order(campo.columna, { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(EXPORT_MAX);
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`nombre.ilike.%${term}%,cedula.ilike.%${term}%,celular.ilike.%${term}%`);
  }
  if (f.estado && f.estado !== "todos") q = q.eq("estado", f.estado);
  if (f.medio && f.medio !== "todos") q = q.eq("medio_postulacion", f.medio);
  if (f.desde && DATE_RE.test(f.desde)) q = q.gte(campo.columna, f.desde);
  if (f.hasta && DATE_RE.test(f.hasta)) q = q.lte(campo.columna, f.hasta);
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as Record<string, unknown>[] };
}
