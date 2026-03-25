import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ── JSON path resolver ──────────────────────────────────────────────────────

function getByPath(obj: unknown, path: string): unknown {
  if (!path || !obj) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── Extract all text values from a JSON payload ─────────────────────────────

function extractAllTexts(obj: unknown, texts: string[] = []): string[] {
  if (typeof obj === "string" && obj.length > 1) {
    texts.push(obj.toLowerCase());
  } else if (Array.isArray(obj)) {
    for (const item of obj) extractAllTexts(item, texts);
  } else if (obj && typeof obj === "object") {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      extractAllTexts(value, texts);
    }
  }
  return texts;
}

// ── Smart vacancy matching ──────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function matchScore(vacancyTitle: string, payloadTexts: string[]): number {
  const normalizedTitle = normalizeText(vacancyTitle);
  const titleWords = normalizedTitle.split(/\s+/).filter(w => w.length > 2);

  let score = 0;

  for (const text of payloadTexts) {
    const normalizedText = normalizeText(text);

    // Exact title match in text
    if (normalizedText.includes(normalizedTitle)) return 100;

    // Word-level matching
    for (const word of titleWords) {
      if (normalizedText.includes(word)) {
        // Skip common words
        if (["para", "con", "del", "las", "los", "una", "uno"].includes(word)) continue;
        score += word.length > 4 ? 3 : 1; // longer words = more weight
      }
    }
  }

  return score;
}

async function findBestVacancy(
  supabase: ReturnType<typeof createAdminClient>,
  payloadTexts: string[],
  explicitPosition: string | undefined
) {
  const { data: vacancies } = await supabase
    .from("vacancies")
    .select("id, title")
    .eq("status", "activa");

  if (!vacancies?.length) return null;

  // If explicit position mapped, try exact match first
  if (explicitPosition) {
    const normalizedPos = normalizeText(explicitPosition);
    for (const v of vacancies) {
      if (normalizeText(v.title).includes(normalizedPos) || normalizedPos.includes(normalizeText(v.title))) {
        return v;
      }
    }
  }

  // Smart match: score each vacancy against all payload texts
  let bestVacancy = null;
  let bestScore = 0;

  for (const v of vacancies) {
    const score = matchScore(v.title, payloadTexts);
    if (score > bestScore) {
      bestScore = score;
      bestVacancy = v;
    }
  }

  // Only return if score is meaningful (at least one significant word matched)
  return bestScore >= 3 ? bestVacancy : null;
}

// ── POST Handler ───────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = createAdminClient();
  let webhookLogId: string | null = null;

  try {
    // 1. Find the webhook config by slug
    const { data: config, error: configError } = await supabase
      .from("webhook_configs")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: `Webhook '${slug}' no encontrado o inactivo.` },
        { status: 404 }
      );
    }

    const body: unknown = await request.json();
    const mappings = config.field_mappings as Record<string, string>;

    // 2. Log the webhook
    const { data: webhookLog, error: logError } = await supabase
      .from("webhook_logs")
      .insert({ source: slug, payload: body, status: "procesando" })
      .select("id")
      .single();

    if (logError) {
      return NextResponse.json(
        { success: false, error: "Error al registrar el webhook." },
        { status: 500 }
      );
    }

    webhookLogId = webhookLog.id;

    // 3. Extract candidate info using field mappings
    const candidateName = getByPath(body, mappings.candidate_name) as string | undefined;
    const candidatePhone = getByPath(body, mappings.candidate_phone) as string | undefined;
    const candidateEmail = getByPath(body, mappings.candidate_email) as string | undefined;
    const candidateDocument = getByPath(body, mappings.candidate_document) as string | undefined;
    const candidatePosition = getByPath(body, mappings.candidate_position) as string | undefined;

    if (!candidateName && !candidatePhone && !candidateEmail) {
      await supabase
        .from("webhook_logs")
        .update({
          status: "procesado",
          processing_result: { message: `Evento registrado desde ${config.name} (sin datos de candidato)` },
          processed_at: new Date().toISOString(),
        })
        .eq("id", webhookLogId);

      return NextResponse.json({ success: true, message: "Evento registrado" });
    }

    // 4. Find or create candidate
    let candidateId: string | null = null;
    let isNewCandidate = false;

    if (candidatePhone) {
      const { data } = await supabase.from("candidates").select("id").eq("phone", candidatePhone).limit(1);
      if (data?.length) candidateId = data[0].id;
    }
    if (!candidateId && candidateDocument) {
      const { data } = await supabase.from("candidates").select("id").eq("document_number", candidateDocument).limit(1);
      if (data?.length) candidateId = data[0].id;
    }
    if (!candidateId && candidateEmail) {
      const { data } = await supabase.from("candidates").select("id").eq("email", candidateEmail).limit(1);
      if (data?.length) candidateId = data[0].id;
    }

    if (candidateId) {
      const updates: Record<string, unknown> = {};
      if (candidateName) updates.full_name = candidateName;
      if (candidateEmail) updates.email = candidateEmail;
      if (candidatePhone) updates.phone = candidatePhone;
      if (candidateDocument) updates.document_number = candidateDocument;
      if (Object.keys(updates).length > 0) {
        await supabase.from("candidates").update(updates).eq("id", candidateId);
      }
    } else {
      isNewCandidate = true;
      const { data: newCandidate, error: createError } = await supabase
        .from("candidates")
        .insert({
          full_name: candidateName ?? "Sin nombre",
          phone: candidatePhone ?? null,
          email: candidateEmail ?? null,
          document_number: candidateDocument ?? null,
          source: slug,
        })
        .select("id")
        .single();

      if (createError) throw new Error(`Error creando candidato: ${createError.message}`);
      candidateId = newCandidate.id;
    }

    await supabase.from("webhook_logs").update({ candidate_id: candidateId }).eq("id", webhookLogId);

    // 5. SMART VACANCY DETECTION
    // Extract all text from the entire payload for intelligent matching
    const allPayloadTexts = extractAllTexts(body);
    const matchedVacancy = await findBestVacancy(supabase, allPayloadTexts, candidatePosition);

    let vacancyLinked: string | null = null;

    if (matchedVacancy) {
      // Check if already applied
      const { data: existing } = await supabase
        .from("candidate_vacancy")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("vacancy_id", matchedVacancy.id)
        .limit(1);

      if (!existing?.length) {
        await supabase.from("candidate_vacancy").insert({
          candidate_id: candidateId,
          vacancy_id: matchedVacancy.id,
          current_stage: "recibido",
        });

        // Log stage history
        const { data: cv } = await supabase
          .from("candidate_vacancy")
          .select("id")
          .eq("candidate_id", candidateId)
          .eq("vacancy_id", matchedVacancy.id)
          .single();

        if (cv) {
          await supabase.from("stage_history").insert({
            candidate_vacancy_id: cv.id,
            to_stage: "recibido",
            notes: `Ingreso automatico via webhook ${config.name}`,
          });
        }
      }

      vacancyLinked = matchedVacancy.title;
    }

    // 6. Log message
    await supabase.from("whatsapp_messages").insert({
      webhook_log_id: webhookLogId,
      candidate_id: candidateId,
      phone_number: candidatePhone ?? "",
      message_type: "text",
      content: JSON.stringify(body),
      direction: "inbound",
    });

    // 7. Process documents
    const docsCreated: string[] = [];
    const docsArrayPath = mappings.documents_array;
    const docUrlField = mappings.document_url ?? "url";
    const docNameField = mappings.document_name ?? "fileName";
    const docMimeField = mappings.document_mime ?? "mimeType";

    if (docsArrayPath) {
      const docsArray = getByPath(body, docsArrayPath) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(docsArray)) {
        for (const doc of docsArray) {
          const url = doc[docUrlField] as string | undefined;
          if (!url) continue;

          const fileName = (doc[docNameField] as string) ?? "documento";
          const mimeType = (doc[docMimeField] as string) ?? null;

          const { error: docError } = await supabase.from("documents").insert({
            name: `${fileName} - ${candidateName ?? "candidato"}`,
            file_path: url,
            mime_type: mimeType,
            candidate_id: candidateId,
            status: "pendiente",
            needs_review: true,
          });

          if (!docError) docsCreated.push(fileName);
        }
      }
    }

    // 8. Build result
    const actions: string[] = [];
    if (isNewCandidate) actions.push("Candidato creado");
    else actions.push("Candidato actualizado");
    if (vacancyLinked) actions.push(`Asignado a: ${vacancyLinked}`);
    else actions.push("Sin vacante detectada");
    if (docsCreated.length > 0) actions.push(`${docsCreated.length} documento(s)`);

    const processingResult = actions.join(" + ");

    await supabase
      .from("webhook_logs")
      .update({
        status: "procesado",
        processing_result: { message: processingResult },
        processed_at: new Date().toISOString(),
      })
      .eq("id", webhookLogId);

    return NextResponse.json({
      success: true,
      message: "Webhook procesado",
      data: {
        source: config.name,
        candidate_id: candidateId,
        candidate_name: candidateName,
        is_new_candidate: isNewCandidate,
        vacancy_matched: vacancyLinked,
        documents_created: docsCreated.length,
        processing_result: processingResult,
      },
    });
  } catch (error) {
    console.error(`[Webhook ${slug}] Error:`, error);

    if (webhookLogId) {
      await supabase
        .from("webhook_logs")
        .update({
          status: "error",
          error_message: error instanceof Error ? error.message : "Error desconocido",
          processed_at: new Date().toISOString(),
        })
        .eq("id", webhookLogId);
    }

    return NextResponse.json(
      { success: false, error: "Error interno al procesar el webhook." },
      { status: 500 }
    );
  }
}

// ── GET Handler (health check) ──────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: config } = await supabase
    .from("webhook_configs")
    .select("name, is_active")
    .eq("slug", slug)
    .single();

  return NextResponse.json({
    status: config?.is_active ? "active" : "inactive",
    service: config?.name ?? slug,
    endpoint: `/api/webhooks/${slug}`,
    methods: ["GET", "POST"],
    timestamp: new Date().toISOString(),
  });
}
