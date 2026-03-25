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

// ── Candidates ────────────────────────────────────────────────────────────────

export async function getCandidatesPipeline() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_vacancy")
    .select("*, candidates(*), vacancies(title)")
    .order("applied_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getAllCandidates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*, candidate_vacancy(id, current_stage, vacancies(title))")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getCandidate(id: string) {
  const supabase = await createClient();
  const [candidateRes, applicationsRes, notesRes, docsRes, historyRes] = await Promise.all([
    supabase.from("candidates").select("*").eq("id", id).single(),
    supabase.from("candidate_vacancy").select("*, vacancies(title)").eq("candidate_id", id),
    supabase.from("notes").select("*, profiles:author_id(full_name)").eq("entity_type", "candidate").eq("entity_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select("*, document_categories(name)").eq("candidate_id", id),
    supabase.from("stage_history").select("*, profiles:changed_by(full_name)").in(
      "candidate_vacancy_id",
      (await supabase.from("candidate_vacancy").select("id").eq("candidate_id", id)).data?.map((cv: { id: string }) => cv.id) ?? []
    ).order("created_at", { ascending: false }),
  ]);

  if (candidateRes.error) throw candidateRes.error;
  return {
    candidate: candidateRes.data,
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

export async function deleteCandidate(id: string) {
  const supabase = createAdminClient();
  // Delete related records first (cascade should handle most, but be explicit)
  await supabase.from("whatsapp_messages").delete().eq("candidate_id", id);
  await supabase.from("documents").delete().eq("candidate_id", id);
  await supabase.from("notes").delete().eq("entity_type", "candidate").eq("entity_id", id);
  await supabase.from("webhook_logs").update({ candidate_id: null }).eq("candidate_id", id);

  // Delete candidate_vacancy (and stage_history via cascade)
  const { data: cvs } = await supabase.from("candidate_vacancy").select("id").eq("candidate_id", id);
  if (cvs?.length) {
    for (const cv of cvs) {
      await supabase.from("stage_history").delete().eq("candidate_vacancy_id", cv.id);
    }
    await supabase.from("candidate_vacancy").delete().eq("candidate_id", id);
  }

  const { error } = await supabase.from("candidates").delete().eq("id", id);
  if (error) throw error;

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
  const [empRes, eventsRes, descargosRes, docsRes, notesRes] = await Promise.all([
    supabase.from("employees").select("*, departments(name)").eq("id", id).single(),
    supabase.from("employee_events").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("disciplinary_records").select("*, profiles:created_by(full_name)").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select("*, document_categories(name)").eq("employee_id", id),
    supabase.from("notes").select("*, profiles:author_id(full_name)").eq("entity_type", "employee").eq("entity_id", id).order("created_at", { ascending: false }),
  ]);

  if (empRes.error) throw empRes.error;
  return {
    employee: empRes.data,
    events: eventsRes.data ?? [],
    disciplinaryRecords: descargosRes.data ?? [],
    documents: docsRes.data ?? [],
    notes: notesRes.data ?? [],
  };
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
      supabase.from("candidates").select("*", { count: "exact", head: true }).eq("source", "varylo"),
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
      source: "varylo",
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
      candidate_name: "",
      candidate_phone: "",
      candidate_email: "",
      candidate_document: "",
      candidate_position: "",
      documents_array: "",
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
