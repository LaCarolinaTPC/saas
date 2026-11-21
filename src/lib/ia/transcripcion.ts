/**
 * Transcripción de audio con OpenAI (gpt-4o-mini-transcribe). La usan el
 * reporte de accidentes (notas de voz) y, desde la entrega 4 de selección,
 * los audios que mandan los aspirantes por WhatsApp. Solo servidor.
 */
import { getOpenAIKey } from "@/lib/settings";

export const MODELO_TRANSCRIPCION = "gpt-4o-mini-transcribe";
/** Precio por millón de tokens (USD): audio de entrada y texto de salida. */
const PRECIO_ENTRADA = 3;
const PRECIO_SALIDA = 5;
/** Sin tokens en la respuesta: ~0,003 USD por minuto; un audio de WhatsApp pesa ~1 MB por minuto. */
const USD_POR_MB = 0.003;

/** Formatos que acepta la transcripción de OpenAI. */
const EXT_VALIDAS = new Set(["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"]);

/**
 * Extensión válida a partir del mimeType (y, si hace falta, del nombre). En
 * móvil el mimeType puede venir vacío o con parámetros de códec; se normaliza
 * para que OpenAI no rechace el archivo por extensión desconocida. Los audios
 * de WhatsApp llegan como «audio/ogg; codecs=opus».
 */
export function normalizarExt(mime: string, nombre = ""): string {
  let base = (mime.split("/")[1] || "").split(";")[0].trim().toLowerCase();
  if (!base && nombre.includes(".")) base = nombre.split(".").pop()!.toLowerCase();
  if (base === "x-m4a") base = "m4a";
  if (base === "mpeg") base = "mp3";
  if (base === "aac") base = "m4a";
  if (base === "vorbis" || base === "opus") base = "ogg";
  return EXT_VALIDAS.has(base) ? base : "webm";
}

export type ResultadoTranscripcion =
  | { ok: true; texto: string; costoUsd: number; tokensEntrada: number; tokensSalida: number }
  | { ok: false; error: string; sinClave?: boolean };

/** Transcribe un audio en español. Nunca lanza. */
export async function transcribirAudio(bytes: ArrayBuffer | Uint8Array, mime: string, nombre = ""): Promise<ResultadoTranscripcion> {
  const apiKey = await getOpenAIKey();
  if (!apiKey) return { ok: false, sinClave: true, error: "No hay API key de OpenAI (Configuración → IA)." };
  const ext = normalizarExt(mime, nombre);
  const contentType = mime.split(";")[0].trim() || `audio/${ext}`;
  try {
    const form = new FormData();
    const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    form.append("file", new Blob([datos as BlobPart], { type: contentType }), `nota.${ext}`);
    form.append("model", MODELO_TRANSCRIPCION);
    form.append("language", "es");
    form.append("response_format", "json");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return { ok: false, error: `La transcripción falló (${res.status}): ${(await res.text()).slice(0, 160)}` };
    const j = (await res.json()) as { text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    const tokensEntrada = Number(j.usage?.input_tokens) || 0;
    const tokensSalida = Number(j.usage?.output_tokens) || 0;
    const costoUsd =
      tokensEntrada || tokensSalida
        ? (tokensEntrada * PRECIO_ENTRADA + tokensSalida * PRECIO_SALIDA) / 1_000_000
        : (datos.byteLength / 1_000_000) * USD_POR_MB;
    return { ok: true, texto: (j.text ?? "").trim(), costoUsd, tokensEntrada, tokensSalida };
  } catch (e) {
    return { ok: false, error: `Error al transcribir: ${e instanceof Error ? e.message : "desconocido"}.` };
  }
}
