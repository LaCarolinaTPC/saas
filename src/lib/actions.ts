"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const supabase = await createClient();
  const [candidates, vacancies, hires, applications] = await Promise.all([
    supabase.from("candidates").select("*", { count: "exact", head: true }),
    supabase.from("vacancies").select("*", { count: "exact", head: true }).eq("status", "activa"),
    supabase.from("employees").select("*", { count: "exact", head: true }),
    supabase
      .from("candidate_vacancy")
      .select("*, candidates(*), vacancies(title)")
      .order("applied_at", { ascending: false })
      .limit(5),
  ]);

  return {
    totalCandidates: candidates.count ?? 0,
    openVacancies: vacancies.count ?? 0,
    totalEmployees: hires.count ?? 0,
    recentApplications: applications.data ?? [],
  };
}

// ── Vacancies ─────────────────────────────────────────────────────────────────

export async function getVacancies(status?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("vacancies")
    .select("*, departments(name), candidate_vacancy(count)")
    .order("created_at", { ascending: false });

  if (status && status !== "todas") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getVacancy(id: string) {
  const supabase = await createClient();
  const [vacancyRes, candidatesRes] = await Promise.all([
    supabase.from("vacancies").select("*, departments(name)").eq("id", id).single(),
    supabase
      .from("candidate_vacancy")
      .select("*, candidates(*)")
      .eq("vacancy_id", id)
      .order("applied_at", { ascending: false })
      .limit(5),
  ]);

  if (vacancyRes.error) throw vacancyRes.error;
  return {
    vacancy: vacancyRes.data,
    candidates: candidatesRes.data ?? [],
    candidateCount: candidatesRes.data?.length ?? 0,
  };
}

export async function createVacancy(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const status = formData.get("action") === "publish" ? "activa" : "borrador";

  const { error } = await supabase.from("vacancies").insert({
    title: formData.get("title") as string,
    department_id: formData.get("department_id") as string,
    description: formData.get("description") as string,
    requirements: formData.get("requirements") as string,
    location: formData.get("location") as string,
    modality: formData.get("modality") as string,
    contract_type: formData.get("contract_type") as string,
    salary_min: formData.get("salary_min") ? Number(formData.get("salary_min")) : null,
    salary_max: formData.get("salary_max") ? Number(formData.get("salary_max")) : null,
    status,
    created_by: user?.id,
    published_at: status === "activa" ? new Date().toISOString() : null,
  });

  if (error) throw error;
  revalidatePath("/vacantes");
  return { success: true };
}

export async function updateVacancyStatus(id: string, status: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("vacancies").update({ status }).eq("id", id);
  if (error) throw error;
  revalidatePath(`/vacantes/${id}`);
  revalidatePath("/vacantes");
}

export async function deleteVacancy(id: string) {
  const supabase = await createClient();

  // Delete related candidate_vacancy records and their stage_history
  const { data: cvs } = await supabase.from("candidate_vacancy").select("id").eq("vacancy_id", id);
  if (cvs?.length) {
    for (const cv of cvs) {
      await supabase.from("stage_history").delete().eq("candidate_vacancy_id", cv.id);
    }
    await supabase.from("candidate_vacancy").delete().eq("vacancy_id", id);
  }

  const { error } = await supabase.from("vacancies").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/vacantes");
}

// ── Candidates ────────────────────────────────────────────────────────────────

export async function getCandidatesPipeline() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("candidate_vacancy")
      .select("*, candidates(*), vacancies(title)")
      .order("applied_at", { ascending: false });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getAllCandidates() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("candidates")
      .select("*, candidate_vacancy(id, current_stage, vacancies(title))")
      .order("created_at", { ascending: false });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getCandidate(id: string) {
  const supabase = await createClient();

  const { data: candidate } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (!candidate) return null;

  const [applicationsRes, notesRes, docsRes, historyRes] = await Promise.all([
    supabase.from("candidate_vacancy").select("*, vacancies(title)").eq("candidate_id", id),
    supabase.from("notes").select("*, profiles:author_id(full_name)").eq("entity_type", "candidate").eq("entity_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select("*, document_categories(name)").eq("candidate_id", id),
    supabase.from("stage_history").select("*, profiles:changed_by(full_name)").in(
      "candidate_vacancy_id",
      (await supabase.from("candidate_vacancy").select("id").eq("candidate_id", id)).data?.map((cv: { id: string }) => cv.id) ?? []
    ).order("created_at", { ascending: false }),
  ]);

  return {
    candidate,
    applications: applicationsRes.data ?? [],
    notes: notesRes.data ?? [],
    documents: docsRes.data ?? [],
    history: historyRes.data ?? [],
  };
}

export async function assignCandidateToVacancy(candidateId: string, vacancyId: string) {
  const supabase = await createClient();

  // Check if already assigned
  const { data: existing } = await supabase
    .from("candidate_vacancy")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("vacancy_id", vacancyId)
    .limit(1);

  if (existing?.length) return { success: true, message: "Ya asignado" };

  const { error } = await supabase.from("candidate_vacancy").insert({
    candidate_id: candidateId,
    vacancy_id: vacancyId,
    current_stage: "recibido",
  });

  if (error) throw error;

  // Log stage history
  const { data: cv } = await supabase
    .from("candidate_vacancy")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("vacancy_id", vacancyId)
    .single();

  if (cv) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("stage_history").insert({
      candidate_vacancy_id: cv.id,
      to_stage: "recibido",
      changed_by: user?.id,
      notes: "Asignado manualmente",
    });
  }

  revalidatePath("/candidatos");
  return { success: true };
}

export async function getActiveVacancies() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vacancies")
    .select("id, title, departments(name)")
    .eq("status", "activa")
    .order("title");
  return data ?? [];
}

export async function hireCandidate(candidateId: string, vacancyId: string) {
  const supabase = await createClient();

  // Get candidate data
  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .single();
  if (candError || !candidate) throw new Error("Candidato no encontrado");

  // Get vacancy for department and position
  const { data: vacancy } = await supabase
    .from("vacancies")
    .select("title, department_id, contract_type, salary_min")
    .eq("id", vacancyId)
    .single();

  // Create employee
  const { error: empError } = await supabase.from("employees").insert({
    candidate_id: candidateId,
    full_name: candidate.full_name,
    document_number: candidate.document_number,
    email: candidate.email,
    phone: candidate.phone,
    department_id: vacancy?.department_id ?? null,
    position: vacancy?.title ?? "Sin cargo",
    status: "activo",
    hire_date: new Date().toISOString().split("T")[0],
    contract_type: vacancy?.contract_type ?? "indefinido",
    salary: vacancy?.salary_min ?? null,
    location: candidate.location,
  });

  if (empError) throw new Error(`Error creando empleado: ${empError.message}`);

  // Move candidate_vacancy docs to employee
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("candidate_id", candidateId)
    .single();

  if (employee) {
    // Transfer documents to employee
    await supabase
      .from("documents")
      .update({ employee_id: employee.id, candidate_id: null })
      .eq("candidate_id", candidateId);

    // Transfer notes to employee
    await supabase
      .from("notes")
      .update({ entity_type: "employee", entity_id: employee.id })
      .eq("entity_type", "candidate")
      .eq("entity_id", candidateId);
  }

  // Clean up candidate data (remove from pipeline)
  const { data: cvs } = await supabase.from("candidate_vacancy").select("id").eq("candidate_id", candidateId);
  if (cvs?.length) {
    for (const cv of cvs) {
      await supabase.from("stage_history").delete().eq("candidate_vacancy_id", cv.id);
    }
    await supabase.from("candidate_vacancy").delete().eq("candidate_id", candidateId);
  }

  // Delete candidate record (now exists as employee)
  await supabase.from("whatsapp_messages").delete().eq("candidate_id", candidateId);
  await supabase.from("webhook_logs").update({ candidate_id: null }).eq("candidate_id", candidateId);
  await supabase.from("candidates").delete().eq("id", candidateId);

  // Log in audit
  if (employee) {
    await logEmployeeAudit(employee.id, "Empleado contratado", {
      resumen: `Contratado desde candidato. Cargo: ${vacancy?.title ?? "—"}`,
      candidato_origen: candidate.full_name,
    });
  }

  revalidatePath("/candidatos");
  revalidatePath("/empleados");
  return { success: true, employeeId: employee?.id };
}

export async function updateCandidateStage(candidateVacancyId: string, newStage: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("candidate_vacancy")
    .select("current_stage, candidate_id")
    .eq("id", candidateVacancyId)
    .single();

  const [updateRes, historyRes] = await Promise.all([
    supabase.from("candidate_vacancy").update({ current_stage: newStage }).eq("id", candidateVacancyId),
    supabase.from("stage_history").insert({
      candidate_vacancy_id: candidateVacancyId,
      from_stage: current?.current_stage,
      to_stage: newStage,
      changed_by: user?.id,
    }),
  ]);

  if (updateRes.error) throw updateRes.error;
  revalidatePath("/candidatos");
  return { success: true };
}

export async function updateCandidate(id: string, data: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.from("candidates").update(data).eq("id", id);
  if (error) throw error;
  revalidatePath(`/candidatos/${id}`);
  revalidatePath("/candidatos");
}

export async function deleteCandidate(id: string) {
  try {
    const supabase = createAdminClient();
    await supabase.from("whatsapp_messages").delete().eq("candidate_id", id);
    await supabase.from("documents").update({ candidate_id: null }).eq("candidate_id", id);
    await supabase.from("notes").delete().eq("entity_type", "candidate").eq("entity_id", id);
    await supabase.from("webhook_logs").update({ candidate_id: null }).eq("candidate_id", id);
    await supabase.from("employees").update({ candidate_id: null }).eq("candidate_id", id);

    const { data: cvs } = await supabase.from("candidate_vacancy").select("id").eq("candidate_id", id);
    if (cvs?.length) {
      for (const cv of cvs) {
        await supabase.from("stage_history").delete().eq("candidate_vacancy_id", cv.id);
      }
      await supabase.from("candidate_vacancy").delete().eq("candidate_id", id);
    }

    await supabase.from("candidates").delete().eq("id", id);
  } catch (err) {
    console.error("Error deleting candidate:", err);
  }

  revalidatePath("/candidatos");
  return { success: true };
}

export async function addNote(entityType: string, entityId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from("notes").insert({
    entity_type: entityType,
    entity_id: entityId,
    author_id: user?.id,
    content,
  });

  if (error) throw error;
  revalidatePath(`/candidatos/${entityId}`);
  revalidatePath(`/empleados/${entityId}`);
}

// ── Employees ─────────────────────────────────────────────────────────────────

export async function getEmployees(department?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("employees")
    .select("*, departments(name)")
    .order("created_at", { ascending: false });

  if (department && department !== "Todos") {
    query = query.eq("departments.name", department);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getEmployee(id: string) {
  const supabase = await createClient();
  const [empRes, eventsRes, descargosRes, docsRes, notesRes, auditRes] = await Promise.all([
    supabase.from("employees").select("*, departments(name)").eq("id", id).single(),
    supabase.from("employee_events").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("disciplinary_records").select("*, profiles:created_by(full_name)").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select("*, document_categories(name)").eq("employee_id", id),
    supabase.from("notes").select("*, profiles:author_id(full_name)").eq("entity_type", "employee").eq("entity_id", id).order("created_at", { ascending: false }),
    supabase.from("employee_audit_log").select("*, profiles:changed_by(full_name)").eq("employee_id", id).order("created_at", { ascending: false }),
  ]);

  if (empRes.error) throw empRes.error;
  return {
    employee: empRes.data,
    events: eventsRes.data ?? [],
    disciplinaryRecords: descargosRes.data ?? [],
    documents: docsRes.data ?? [],
    notes: notesRes.data ?? [],
    auditLog: auditRes.data ?? [],
  };
}

async function logEmployeeAudit(employeeId: string, action: string, details: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("employee_audit_log").insert({
    employee_id: employeeId,
    action,
    details,
    changed_by: user?.id,
  });
}

export async function addEmployeeEvent(employeeId: string, data: {
  type: string;
  description: string;
  start_date: string;
  end_date?: string;
  status?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("employee_events").insert({
    employee_id: employeeId,
    type: data.type,
    description: data.description,
    start_date: data.start_date,
    end_date: data.end_date || null,
    status: data.status || "aprobado",
    created_by: user?.id,
  });
  if (error) throw error;
  await logEmployeeAudit(employeeId, "Novedad creada", { tipo: data.type, descripcion: data.description, fecha_inicio: data.start_date, estado: data.status });
  revalidatePath(`/empleados/${employeeId}`);
}

export async function addDisciplinaryRecord(employeeId: string, data: {
  type: string;
  description: string;
  date: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("disciplinary_records").insert({
    employee_id: employeeId,
    type: data.type,
    description: data.description,
    date: data.date,
    status: "abierto",
    created_by: user?.id,
  });
  if (error) throw error;
  await logEmployeeAudit(employeeId, "Descargo creado", { tipo: data.type, descripcion: data.description, fecha: data.date });
  revalidatePath(`/empleados/${employeeId}`);
}

export async function updateDisciplinaryStatus(id: string, status: string, resolution?: string) {
  const supabase = await createClient();
  const updates: Record<string, unknown> = { status };
  if (resolution) updates.resolution = resolution;
  const { error } = await supabase.from("disciplinary_records").update(updates).eq("id", id);
  if (error) throw error;
  revalidatePath("/empleados");
}

export async function deleteDisciplinaryRecord(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("disciplinary_records").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/empleados");
}

export async function deleteEmployee(id: string) {
  const supabase = await createClient();
  // Delete related records first
  await supabase.from("employee_events").delete().eq("employee_id", id);
  await supabase.from("disciplinary_records").delete().eq("employee_id", id);
  await supabase.from("employee_audit_log").delete().eq("employee_id", id);
  await supabase.from("documents").update({ employee_id: null }).eq("employee_id", id);
  await supabase.from("notes").delete().eq("entity_type", "employee").eq("entity_id", id);
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/empleados");
}

export async function deleteEmployeeEvent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_events").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/empleados");
}

export async function updateEmployee(id: string, data: Record<string, unknown>) {
  const supabase = await createClient();

  // Get current values to detect changes
  const { data: current } = await supabase.from("employees").select("*").eq("id", id).single();

  const { error } = await supabase.from("employees").update(data).eq("id", id);
  if (error) throw error;

  // Log what changed
  const fieldLabels: Record<string, string> = {
    full_name: "Nombre", document_number: "Cedula", email: "Email", phone: "Telefono",
    position: "Cargo", salary: "Salario", contract_type: "Tipo de contrato", location: "Ubicacion",
    eps: "EPS", afp: "AFP", arl: "ARL", caja_compensacion: "Caja de Compensacion", status: "Estado",
    end_date: "Fecha de retiro",
  };

  const changes: Record<string, { antes: unknown; despues: unknown }> = {};
  if (current) {
    for (const [key, value] of Object.entries(data)) {
      const prev = (current as Record<string, unknown>)[key];
      if (String(prev ?? "") !== String(value ?? "")) {
        const label = fieldLabels[key] ?? key;
        changes[label] = { antes: prev ?? "—", despues: value ?? "—" };
      }
    }
  }

  if (Object.keys(changes).length > 0) {
    const summary = Object.entries(changes).map(([k, v]) => `${k}: ${v.antes} → ${v.despues}`).join(", ");
    await logEmployeeAudit(id, "Datos actualizados", { cambios: changes, resumen: summary });
  }

  revalidatePath(`/empleados/${id}`);
  revalidatePath("/empleados");
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function getDocuments(category?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select("*, document_categories(name, slug, color), profiles:assigned_to(full_name), candidates(full_name), employees(full_name)")
    .order("created_at", { ascending: false });

  if (category && category !== "Todos") {
    query = query.eq("document_categories.slug", category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function updateDocumentStatus(id: string, status: string) {
  const supabase = await createClient();
  const needsReview = status === "pendiente";
  const { error } = await supabase.from("documents").update({ status, needs_review: needsReview }).eq("id", id);
  if (error) throw error;
  revalidatePath("/documentos");
  revalidatePath("/integraciones");
}

export async function deleteDocument(id: string) {
  const supabase = await createClient();

  // Get document to find storage path
  const { data: doc } = await supabase.from("documents").select("file_path").eq("id", id).single();

  // Delete from storage if it's a Supabase Storage URL
  if (doc?.file_path?.includes("/storage/v1/object/public/documents/")) {
    const storagePath = doc.file_path.split("/storage/v1/object/public/documents/")[1];
    if (storagePath) {
      await supabase.storage.from("documents").remove([decodeURIComponent(storagePath)]);
    }
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/documentos");
}

export async function getDocumentStats() {
  const supabase = await createClient();
  const [total, pending, expiring] = await Promise.all([
    supabase.from("documents").select("*", { count: "exact", head: true }),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "pendiente"),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "vencido"),
  ]);

  return {
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    expiring: expiring.count ?? 0,
  };
}

// ── Integrations ──────────────────────────────────────────────────────────────

export async function getWebhookLogs() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("webhook_logs")
      .select("*, candidates(full_name)")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getWebhookStats() {
  try {
    const supabase = await createClient();
    const [messages, created, docs, pending] = await Promise.all([
      supabase.from("webhook_logs").select("*", { count: "exact", head: true }),
      supabase.from("candidates").select("*", { count: "exact", head: true }).neq("source", "manual"),
      supabase.from("documents").select("*", { count: "exact", head: true }).not("classification_confidence", "is", null),
      supabase.from("documents").select("*", { count: "exact", head: true }).eq("needs_review", true),
    ]);

    return {
      messages: messages.count ?? 0,
      candidatesCreated: created.count ?? 0,
      classifiedDocs: docs.count ?? 0,
      pendingReview: pending.count ?? 0,
    };
  } catch {
    return { messages: 0, candidatesCreated: 0, classifiedDocs: 0, pendingReview: 0 };
  }
}

export async function testWebhookConnection() {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase.from("webhook_logs").insert({
      source: "test",
      payload: { type: "connection_test", timestamp: new Date().toISOString() },
      status: "procesado",
      processing_result: { message: "Test de conexion exitoso" },
      processed_at: new Date().toISOString(),
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/integraciones");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Webhook Configs ───────────────────────────────────────────────────────────

export async function getWebhookConfigs() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("webhook_configs")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function createWebhookConfig(name: string, slug: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("webhook_configs").insert({
    name,
    slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    is_active: true,
    field_mappings: {
      candidate_name: "capturedData.nombre",
      candidate_phone: "capturedData.numero",
      candidate_email: "capturedData.email",
      candidate_document: "capturedData.cedula",
      candidate_position: "capturedData.cargo",
      documents_array: "documents",
      document_url: "url",
      document_name: "fileName",
      document_mime: "mimeType",
    },
  });
  if (error) throw error;
  revalidatePath("/integraciones");
}

export async function updateWebhookConfig(id: string, updates: Record<string, unknown>) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("webhook_configs").update(updates).eq("id", id);
  if (error) throw error;
  revalidatePath("/integraciones");
}

export async function deleteWebhookConfig(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("webhook_configs").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/integraciones");
}

// ── Departments ───────────────────────────────────────────────────────────────

export async function getDepartments() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("departments").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}
