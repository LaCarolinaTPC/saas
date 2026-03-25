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
      .insert({
        source: slug,
        payload: body,
        status: "procesando",
      })
      .select("id")
      .single();

    if (logError) {
      console.error(`[Webhook ${slug}] Error logging:`, logError);
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

      return NextResponse.json({
        success: true,
        message: "Evento registrado",
        data: { source: config.name },
      });
    }

    // 4. Find or create candidate
    let candidateId: string | null = null;
    let isNewCandidate = false;

    if (candidatePhone) {
      const { data } = await supabase
        .from("candidates").select("id").eq("phone", candidatePhone).limit(1);
      if (data?.length) candidateId = data[0].id;
    }
    if (!candidateId && candidateDocument) {
      const { data } = await supabase
        .from("candidates").select("id").eq("document_number", candidateDocument).limit(1);
      if (data?.length) candidateId = data[0].id;
    }
    if (!candidateId && candidateEmail) {
      const { data } = await supabase
        .from("candidates").select("id").eq("email", candidateEmail).limit(1);
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

    // Link webhook log to candidate
    await supabase.from("webhook_logs").update({ candidate_id: candidateId }).eq("id", webhookLogId);

    // 5. Auto-link to vacancy if position mapped
    if (candidatePosition) {
      const { data: vacancies } = await supabase
        .from("vacancies")
        .select("id")
        .ilike("title", `%${candidatePosition}%`)
        .eq("status", "activa")
        .limit(1);

      if (vacancies?.length) {
        const { data: existing } = await supabase
          .from("candidate_vacancy")
          .select("id")
          .eq("candidate_id", candidateId)
          .eq("vacancy_id", vacancies[0].id)
          .limit(1);

        if (!existing?.length) {
          await supabase.from("candidate_vacancy").insert({
            candidate_id: candidateId,
            vacancy_id: vacancies[0].id,
            current_stage: "recibido",
          });
        }
      }
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

    // 7. Process documents if mapped
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
    if (candidatePosition) actions.push(`Cargo: ${candidatePosition}`);
    if (docsCreated.length > 0) actions.push(`${docsCreated.length} documento(s)`);
    actions.push("Registrado");

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
