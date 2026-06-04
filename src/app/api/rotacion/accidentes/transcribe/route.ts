import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAIKey } from "@/lib/settings";

const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

export async function POST(request: NextRequest) {
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No hay API key de transcripción configurada. Configúrala en Configuración → IA.",
      },
      { status: 400 }
    );
  }

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
  const ext = (audio.type.split("/")[1] || "webm").split(";")[0];
  const path = `audio/${crypto.randomUUID()}.${ext}`;

  // 1. Guardar el audio en el bucket privado
  const { error: uploadError } = await supabase.storage
    .from("accidentes")
    .upload(path, await audio.arrayBuffer(), {
      contentType: audio.type || "audio/webm",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `No se pudo guardar el audio: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // 2. Transcribir con OpenAI (REST)
  try {
    const oaForm = new FormData();
    oaForm.append("file", audio, `nota.${ext}`);
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
      // El audio quedó guardado; devolvemos la ruta para no perderlo.
      return NextResponse.json(
        {
          audioPath: path,
          text: "",
          error: `La transcripción falló (${res.status}). Puedes escribir el resumen manualmente. ${detail.slice(0, 200)}`,
        },
        { status: 200 }
      );
    }

    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ audioPath: path, text: data.text ?? "" });
  } catch (e) {
    return NextResponse.json(
      {
        audioPath: path,
        text: "",
        error: `Error al transcribir: ${e instanceof Error ? e.message : "desconocido"}. El audio se guardó.`,
      },
      { status: 200 }
    );
  }
}
