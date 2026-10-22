import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAIKey } from "@/lib/settings";
import { exigirModuloApi } from "@/lib/api-guard";

const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

/** Formatos que acepta la transcripción de OpenAI. */
const EXT_VALIDAS = new Set(["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"]);

/**
 * Extensión válida a partir del mimeType (y, si hace falta, del nombre). En
 * móvil el mimeType puede venir vacío o con parámetros de códec; se normaliza
 * para que OpenAI no rechace el archivo por extensión desconocida.
 */
function normalizarExt(mime: string, nombre: string): string {
  let base = (mime.split("/")[1] || "").split(";")[0].trim().toLowerCase();
  if (!base && nombre.includes(".")) base = nombre.split(".").pop()!.toLowerCase();
  if (base === "x-m4a") base = "m4a";
  if (base === "mpeg") base = "mp3";
  if (base === "aac") base = "m4a";
  if (base === "vorbis") base = "ogg";
  return EXT_VALIDAS.has(base) ? base : "webm";
}

export async function POST(request: NextRequest) {
  const rechazo = await exigirModuloApi(["accidentabilidad", "reporte_accidente"]);
  if (rechazo) return rechazo;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No se recibió audio." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const ext = normalizarExt(audio.type, audio.name);
  const contentType = audio.type || `audio/${ext}`;
  const path = `audio/${crypto.randomUUID()}.${ext}`;
  const bytes = await audio.arrayBuffer();

  // 1. Guardar SIEMPRE el audio en el bucket privado (con o sin transcripción)
  const { error: uploadError } = await supabase.storage
    .from("accidentes")
    .upload(path, bytes, { contentType, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `No se pudo guardar el audio: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // 2. Si no hay API key, el audio igual quedó guardado. Sin transcripción.
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    return NextResponse.json({
      audioPath: path,
      text: "",
      warning:
        "Nota de voz guardada. No se transcribió porque no hay API key configurada (Configuración → IA).",
    });
  }

  // 3. Transcribir con OpenAI (REST)
  try {
    const oaForm = new FormData();
    oaForm.append("file", new Blob([bytes], { type: contentType }), `nota.${ext}`);
    oaForm.append("model", TRANSCRIBE_MODEL);
    oaForm.append("language", "es");
    oaForm.append("response_format", "json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: oaForm,
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({
        audioPath: path,
        text: "",
        warning: `Nota de voz guardada. La transcripción falló (${res.status}); puedes escribir el resumen manualmente. ${detail.slice(0, 160)}`,
      });
    }

    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ audioPath: path, text: data.text ?? "" });
  } catch (e) {
    return NextResponse.json({
      audioPath: path,
      text: "",
      warning: `Nota de voz guardada. Error al transcribir: ${e instanceof Error ? e.message : "desconocido"}.`,
    });
  }
}
