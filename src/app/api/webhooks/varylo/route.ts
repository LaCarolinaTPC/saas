import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Types (Varylo real payload) ─────────────────────────────────────────────

interface VaryloContact {
  name?: string;
  phone?: string;
  email?: string;
}

interface VarloCapturedData {
  nombre?: string;
  cedula?: string;
  email?: string;
  cargo_aplicado?: string;
  [key: string]: unknown;
}

interface VaryloDocument {
  fieldName?: string;
  url: string;
  mimeType?: string;
  fileName?: string;
}

interface VaryloPayload {
  event: string;
  conversationId?: string;
  contactId?: string;
  contact?: VaryloContact;
  capturedData?: VarloCapturedData;
  documents?: VaryloDocument[];
  timestamp?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function validatePayload(body: unknown): body is VaryloPayload {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  // Varylo always sends "event" field
  if (typeof obj.event !== "string") return false;
  return true;
}

function extractCandidateInfo(payload: VaryloPayload) {
  const contact = payload.contact ?? {};
  const captured = payload.capturedData ?? {};

  return {
    full_name: captured.nombre ?? contact.name ?? null,
    phone: contact.phone ?? null,
    email: captured.email ?? contact.email ?? null,
    document_number: captured.cedula ?? null,
    source: "varylo" as const,
  };
}

// ── POST Handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  let webhookLogId: string | null = null;

  try {
    const body: unknown = await request.json();

    if (!validatePayload(body)) {
      return NextResponse.json(
        { success: false, error: "Payload invalido. Se requiere campo 'event'." },
        { status: 400 }
      );
    }

    // 1. Log the webhook
    const { data: webhookLog, error: logError } = await supabase
      .from("webhook_logs")
      .insert({
        source: "varylo",
        payload: body,
        status: "procesando",
      })
      .select("id")
      .single();

    if (logError) {
      console.error("[Varylo] Error logging webhook:", logError);
      return NextResponse.json(
        { success: false, error: "Error al registrar el webhook." },
        { status: 500 }
      );
    }

    webhookLogId = webhookLog.id;

    // 2. Extract candidate info from contact + capturedData
    const info = extractCandidateInfo(body);

    if (!info.full_name && !info.phone && !info.email) {
      // No candidate info to process, just log the event
      await supabase
        .from("webhook_logs")
        .update({
          status: "procesado",
          processing_result: { message: `Evento '${body.event}' registrado (sin datos de candidato)` },
          processed_at: new Date().toISOString(),
        })
        .eq("id", webhookLogId);

      return NextResponse.json({
        success: true,
        message: "Evento registrado",
        data: { event: body.event },
      });
    }

    // 3. Find or create candidate (by phone, then by document_number, then by email)
    let candidateId: string | null = null;
    let isNewCandidate = false;

    // Search by phone first
    if (info.phone) {
      const { data } = await supabase
        .from("candidates")
        .select("id")
        .eq("phone", info.phone)
        .limit(1);
      if (data && data.length > 0) candidateId = data[0].id;
    }

    // Search by document_number if not found
    if (!candidateId && info.document_number) {
      const { data } = await supabase
        .from("candidates")
        .select("id")
        .eq("document_number", info.document_number)
        .limit(1);
      if (data && data.length > 0) candidateId = data[0].id;
    }

    // Search by email if not found
    if (!candidateId && info.email) {
      const { data } = await supabase
        .from("candidates")
        .select("id")
        .eq("email", info.email)
        .limit(1);
      if (data && data.length > 0) candidateId = data[0].id;
    }

    if (candidateId) {
      // Update existing candidate with any new info
      const updates: Record<string, unknown> = {};
      if (info.full_name) updates.full_name = info.full_name;
      if (info.email) updates.email = info.email;
      if (info.phone) updates.phone = info.phone;
      if (info.document_number) updates.document_number = info.document_number;

      if (Object.keys(updates).length > 0) {
        await supabase.from("candidates").update(updates).eq("id", candidateId);
      }
    } else {
      // Create new candidate
      isNewCandidate = true;
      const { data: newCandidate, error: createError } = await supabase
        .from("candidates")
        .insert({
          full_name: info.full_name ?? "Sin nombre",
          phone: info.phone,
          email: info.email,
          document_number: info.document_number,
          source: "varylo",
        })
        .select("id")
        .single();

      if (createError) throw new Error(`Error creando candidato: ${createError.message}`);
      candidateId = newCandidate.id;
    }

    // Link webhook log to candidate
    await supabase
      .from("webhook_logs")
      .update({ candidate_id: candidateId })
      .eq("id", webhookLogId);

    // 4. If capturedData has cargo_aplicado, try to link to a vacancy
    const cargoAplicado = body.capturedData?.cargo_aplicado;
    if (cargoAplicado) {
      const { data: vacancies } = await supabase
        .from("vacancies")
        .select("id")
        .ilike("title", `%${cargoAplicado}%`)
        .eq("status", "activa")
        .limit(1);

      if (vacancies && vacancies.length > 0) {
        // Check if already applied
        const { data: existing } = await supabase
          .from("candidate_vacancy")
          .select("id")
          .eq("candidate_id", candidateId)
          .eq("vacancy_id", vacancies[0].id)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("candidate_vacancy").insert({
            candidate_id: candidateId,
            vacancy_id: vacancies[0].id,
            current_stage: "recibido",
          });
        }
      }
    }

    // 5. Log WhatsApp message
    await supabase.from("whatsapp_messages").insert({
      webhook_log_id: webhookLogId,
      candidate_id: candidateId,
      phone_number: info.phone ?? "",
      message_type: "text",
      content: JSON.stringify(body.capturedData ?? {}),
      direction: "inbound",
    });

    // 6. Process documents (CV, images, etc.)
    const docsCreated: string[] = [];
    if (body.documents && body.documents.length > 0) {
      for (const doc of body.documents) {
        const { error: docError } = await supabase.from("documents").insert({
          name: doc.fileName ?? `${doc.fieldName ?? "documento"} - ${info.full_name ?? "candidato"}`,
          file_path: doc.url,
          file_size: null,
          mime_type: doc.mimeType ?? null,
          candidate_id: candidateId,
          status: "pendiente",
          needs_review: true,
        });

        if (!docError) {
          docsCreated.push(doc.fileName ?? doc.fieldName ?? "documento");
        } else {
          console.error("[Varylo] Error creating document:", docError);
        }
      }
    }

    // 7. Build processing result
    const actions: string[] = [];
    if (isNewCandidate) actions.push("Candidato creado");
    else actions.push("Candidato actualizado");
    if (cargoAplicado) actions.push(`Cargo: ${cargoAplicado}`);
    if (docsCreated.length > 0) actions.push(`${docsCreated.length} documento(s) registrado(s)`);
    actions.push("Mensaje registrado");

    const processingResult = actions.join(" + ");

    // Update webhook log to processed
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
        candidate_id: candidateId,
        candidate_name: info.full_name,
        is_new_candidate: isNewCandidate,
        documents_created: docsCreated.length,
        processing_result: processingResult,
      },
    });
  } catch (error) {
    console.error("[Varylo] Error:", error);

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

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "GESTIVO Webhook - Varylo",
    endpoint: "/api/webhooks/varylo",
    methods: ["GET", "POST"],
    expected_event: "chatbot.data_captured",
    timestamp: new Date().toISOString(),
  });
}
