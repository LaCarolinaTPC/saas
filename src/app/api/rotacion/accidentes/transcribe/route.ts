import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirModuloApi } from "@/lib/api-guard";
import { normalizarExt, transcribirAudio } from "@/lib/ia/transcripcion";

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

  // 2. Transcribir (src/lib/ia/transcripcion). Sin API key o si falla, el audio igual quedó guardado.
  const r = await transcribirAudio(bytes, contentType, audio.name);
  if (r.ok) return NextResponse.json({ audioPath: path, text: r.texto });
  return NextResponse.json({
    audioPath: path,
    text: "",
    warning: r.sinClave
      ? "Nota de voz guardada. No se transcribió porque no hay clave de OpenRouter ni de OpenAI (Configuración → Proveedores de IA)."
      : `Nota de voz guardada. ${r.error} Puedes escribir el resumen manualmente.`,
  });
}
