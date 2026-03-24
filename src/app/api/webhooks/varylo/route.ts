import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Types ──────────────────────────────────────────────────────────────────────

interface VaryloWebhookPayload {
  from: string;
  name?: string;
  message_type: "text" | "image" | "document" | "audio" | "location" | "video";
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function validatePayload(body: unknown): body is VaryloWebhookPayload {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  if (typeof obj.from !== "string" || !obj.from) return false;
  if (typeof obj.message_type !== "string" || !obj.message_type) return false;
  if (typeof obj.content !== "string") return false;
  return true;
}

// ── POST Handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let webhookLogId: string | null = null;

  try {
    const body: unknown = await request.json();

    // 1. Validate payload
    if (!validatePayload(body)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payload invalido. Se requiere: from (string), message_type (string), content (string).",
        },
        { status: 400 }
      );
    }

    // 2. Log the webhook to webhook_logs (initial status: "procesando")
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
      console.error("[Webhook Varylo] Error logging webhook:", logError);
      return NextResponse.json(
        { success: false, error: "Error al registrar el webhook." },
        { status: 500 }
      );
    }

    webhookLogId = webhookLog.id;

    // 3. Find or create candidate by phone number
    const phone = body.from;
    const { data: existingCandidates, error: searchError } = await supabase
      .from("candidates")
      .select("id, full_name, phone")
      .eq("phone", phone)
      .limit(1);

    if (searchError) {
      throw new Error(`Error buscando candidato: ${searchError.message}`);
    }

    let candidateId: string;
    let candidateName: string | null;
    let isNewCandidate = false;

    if (existingCandidates && existingCandidates.length > 0) {
      // Candidate found
      const existing = existingCandidates[0];
      candidateId = existing.id;
      candidateName = existing.full_name;

      // Update name if provided and candidate had no name
      if (body.name && !existing.full_name) {
        await supabase
          .from("candidates")
          .update({ full_name: body.name })
          .eq("id", candidateId);
        candidateName = body.name;
      }
    } else {
      // Create new candidate
      isNewCandidate = true;
      const { data: newCandidate, error: createError } = await supabase
        .from("candidates")
        .insert({
          full_name: body.name ?? null,
          phone: phone,
          source: "varylo",
        })
        .select("id, full_name")
        .single();

      if (createError) {
        throw new Error(`Error creando candidato: ${createError.message}`);
      }

      candidateId = newCandidate.id;
      candidateName = newCandidate.full_name;
    }

    // Update webhook_log with candidate_id
    await supabase
      .from("webhook_logs")
      .update({ candidate_id: candidateId })
      .eq("id", webhookLogId);

    // 4. Log WhatsApp message
    const { error: msgError } = await supabase.from("whatsapp_messages").insert({
      candidate_id: candidateId,
      from_number: phone,
      message_type: body.message_type,
      content: body.content,
      raw_payload: body,
      source: "varylo",
    });

    if (msgError) {
      console.error("[Webhook Varylo] Error logging whatsapp message:", msgError);
      // Non-fatal: continue processing
    }

    // 5. If document or image, create a document entry with needs_review
    let documentCreated = false;
    if (body.message_type === "document" || body.message_type === "image") {
      const docName =
        body.message_type === "document"
          ? `Documento de ${candidateName ?? phone}`
          : `Imagen de ${candidateName ?? phone}`;

      const { error: docError } = await supabase.from("documents").insert({
        name: docName,
        candidate_id: candidateId,
        status: "pendiente",
        needs_review: true,
        source: "varylo",
        file_url: body.content,
      });

      if (docError) {
        console.error("[Webhook Varylo] Error creating document:", docError);
        // Non-fatal: continue processing
      } else {
        documentCreated = true;
      }
    }

    // 6. Build processing result summary
    const actions: string[] = [];
    if (isNewCandidate) actions.push("Candidato creado");
    else actions.push("Candidato encontrado");
    if (documentCreated) actions.push("Documento creado para revision");
    actions.push("Mensaje registrado");

    const processingResult = actions.join(" + ");

    // Update webhook_log to "recibido" (processed) with result
    await supabase
      .from("webhook_logs")
      .update({
        status: "recibido",
        processing_result: processingResult,
        processed_at: new Date().toISOString(),
      })
      .eq("id", webhookLogId);

    // 7. Return success
    return NextResponse.json(
      {
        success: true,
        message: "Webhook procesado",
        data: {
          candidate_id: candidateId,
          candidate_name: candidateName,
          candidate_phone: phone,
          is_new_candidate: isNewCandidate,
          message_type: body.message_type,
          document_created: documentCreated,
          processing_result: processingResult,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Webhook Varylo] Error:", error);

    // Update webhook log to error status if we have the id
    if (webhookLogId) {
      const errorMessage =
        error instanceof Error ? error.message : "Error desconocido";

      await supabase
        .from("webhook_logs")
        .update({
          status: "error",
          error_message: errorMessage,
          processed_at: new Date().toISOString(),
        })
        .eq("id", webhookLogId);
    }

    return NextResponse.json(
      {
        success: false,
        error: "Error interno al procesar el webhook.",
      },
      { status: 500 }
    );
  }
}

// ── GET Handler ────────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      service: "GESTIVO Webhook",
      endpoint: "/api/webhooks/varylo",
      methods: ["GET", "POST"],
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
