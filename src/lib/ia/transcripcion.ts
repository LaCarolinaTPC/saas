/**
 * Transcripción de audio. La usan el reporte de accidentes (notas de voz) y,
 * desde la entrega 4 de selección, los audios que mandan los aspirantes por
 * WhatsApp. Solo servidor.
 *
 * Va primero por el proveedor elegido en Candidatos › Selección › IA › Voz (OpenRouter
 * por defecto, ruta /api/v1/audio/transcriptions) y, si no está o falla, por
 * el otro (OpenAI, con su propia clave). Los modelos de Claude no reciben audio.
 */
import { getClaveIA } from "./claves";
import { conGrabacion } from "./grabacion";
import { medirLlamada } from "@/lib/servicios/registro-llamadas";

/** «Voz» en Candidatos › Selección › IA (antes, el ajuste `transcripcion_modelo` de selección). */
export type ModeloTranscripcion = "gpt4o_mini" | "whisper";

const MODELOS: Record<ModeloTranscripcion, { openrouter: string; openai: string }> = {
  // Mejor con ruido de fondo y palabras locales.
  gpt4o_mini: { openrouter: "openai/gpt-4o-mini-transcribe", openai: "gpt-4o-mini-transcribe" },
  // Unas quince veces más barato.
  whisper: { openrouter: "openai/whisper-large-v3-turbo", openai: "whisper-1" },
};

/** Para el nombre del modelo en consumos (sin el prefijo del proveedor). */
export const MODELO_TRANSCRIPCION = MODELOS.gpt4o_mini.openai;

/** Precio de referencia cuando el proveedor no devuelve el costo (USD por minuto). */
const USD_POR_MINUTO: Record<ModeloTranscripcion, number> = { gpt4o_mini: 0.003, whisper: 0.0002 };
/** Un audio de WhatsApp (Opus, ~24 kbps) pesa unos 180 KB por minuto. */
const BYTES_POR_MINUTO = 180_000;

/** Formatos que aceptan las rutas de transcripción. */
const EXT_VALIDAS = new Set(["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm", "aac"]);

/**
 * Extensión válida a partir del mimeType (y, si hace falta, del nombre). En
 * móvil el mimeType puede venir vacío o con parámetros de códec; se normaliza
 * para que el proveedor no rechace el archivo por extensión desconocida. Los
 * audios de WhatsApp llegan como «audio/ogg; codecs=opus».
 */
export function normalizarExt(mime: string, nombre = ""): string {
  let base = (mime.split("/")[1] || "").split(";")[0].trim().toLowerCase();
  if (!base && nombre.includes(".")) base = nombre.split(".").pop()!.toLowerCase();
  if (base === "x-m4a") base = "m4a";
  if (base === "mpeg") base = "mp3";
  if (base === "x-wav" || base === "wave") base = "wav";
  if (base === "vorbis" || base === "opus" || base === "oga") base = "ogg";
  return EXT_VALIDAS.has(base) ? base : "webm";
}

export type ResultadoTranscripcion =
  | { ok: true; texto: string; costoUsd: number; tokensEntrada: number; tokensSalida: number; proveedor: "openrouter" | "openai"; modelo: string }
  | { ok: false; error: string; sinClave?: boolean };

/** ¿Hay con qué transcribir (clave de OpenRouter o de OpenAI)? */
export async function hayTranscripcion(): Promise<boolean> {
  const [or, oa] = await Promise.all([getClaveIA("openrouter"), getClaveIA("openai")]);
  return !!(or || oa);
}

const estimado = (bytes: number, modelo: ModeloTranscripcion) => (bytes / BYTES_POR_MINUTO) * USD_POR_MINUTO[modelo];

async function porOpenRouter(clave: string, datos: Uint8Array, ext: string, modelo: ModeloTranscripcion): Promise<ResultadoTranscripcion> {
  const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json", "X-Title": "Gestivo" },
    body: JSON.stringify({
      model: MODELOS[modelo].openrouter,
      input_audio: { data: Buffer.from(datos).toString("base64"), format: ext },
      language: "es",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    text?: string;
    usage?: { cost?: number; input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) return { ok: false, error: `OpenRouter no transcribió (${res.status}): ${(j.error?.message ?? "").slice(0, 200)}` };
  const costo = Number(j.usage?.cost);
  return {
    ok: true,
    texto: (j.text ?? "").trim(),
    costoUsd: Number.isFinite(costo) && costo > 0 ? costo : estimado(datos.byteLength, modelo),
    tokensEntrada: Number(j.usage?.input_tokens) || 0,
    tokensSalida: Number(j.usage?.output_tokens) || 0,
    proveedor: "openrouter",
    modelo: MODELOS[modelo].openrouter,
  };
}

async function porOpenAI(clave: string, datos: Uint8Array, ext: string, contentType: string, modelo: ModeloTranscripcion): Promise<ResultadoTranscripcion> {
  const form = new FormData();
  form.append("file", new Blob([datos as BlobPart], { type: contentType }), `nota.${ext}`);
  form.append("model", MODELOS[modelo].openai);
  form.append("language", "es");
  form.append("response_format", "json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return { ok: false, error: `OpenAI no transcribió (${res.status}): ${(await res.text()).slice(0, 160)}` };
  const j = (await res.json()) as { text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  const tokensEntrada = Number(j.usage?.input_tokens) || 0;
  const tokensSalida = Number(j.usage?.output_tokens) || 0;
  // gpt-4o-mini-transcribe: USD 1,25 / 5 por millón de tokens de entrada / salida.
  const porTokens = (tokensEntrada * 1.25 + tokensSalida * 5) / 1_000_000;
  return {
    ok: true,
    texto: (j.text ?? "").trim(),
    costoUsd: porTokens > 0 ? porTokens : estimado(datos.byteLength, modelo),
    tokensEntrada,
    tokensSalida,
    proveedor: "openai",
    modelo: MODELOS[modelo].openai,
  };
}

/**
 * Transcribe un audio en español: el proveedor indicado (OpenRouter por
 * defecto) y, si no está o falla, el otro. Nunca lanza.
 */
export async function transcribirAudio(
  bytes: ArrayBuffer | Uint8Array,
  mime: string,
  nombre = "",
  opciones: { modelo?: ModeloTranscripcion; proveedor?: "openrouter" | "openai" } = {}
): Promise<ResultadoTranscripcion> {
  // Pruebas: con IA_GRABACION en desarrollo, el mismo audio con el mismo modelo se repite gratis (src/lib/ia/grabacion.ts).
  return conGrabacion(
    "audio",
    { bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), mime, modelo: opciones.modelo ?? "gpt4o_mini", proveedor: opciones.proveedor ?? null },
    () => transcribirAudioSinGrabar(bytes, mime, nombre, opciones),
    {
      sinCosto: (r) => (r.ok ? { ...r, costoUsd: 0, tokensEntrada: 0, tokensSalida: 0 } : r),
      guardable: (r) => r.ok,
    }
  );
}

async function transcribirAudioSinGrabar(
  bytes: ArrayBuffer | Uint8Array,
  mime: string,
  nombre: string,
  opciones: { modelo?: ModeloTranscripcion; proveedor?: "openrouter" | "openai" }
): Promise<ResultadoTranscripcion> {
  const modelo: ModeloTranscripcion = opciones.modelo === "whisper" ? "whisper" : "gpt4o_mini";
  const [claveOR, claveOA] = await Promise.all([getClaveIA("openrouter"), getClaveIA("openai")]);
  if (!claveOR && !claveOA) return { ok: false, sinClave: true, error: "No hay clave de OpenRouter ni de OpenAI (Configuración → Proveedores de IA)." };
  const ext = normalizarExt(mime, nombre);
  const contentType = mime.split(";")[0].trim() || `audio/${ext}`;
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const errores: string[] = [];
  // Cada intento queda en las estadísticas de proveedores (26-nov-2026).
  const evaluar = (r: ResultadoTranscripcion) => ({ ok: r.ok, error: r.ok ? null : r.error });
  const intentos = [
    claveOR ? () => medirLlamada({ servicio: "ia", proveedor: "openrouter", fuente: "voz", modelo }, () => porOpenRouter(claveOR, datos, ext, modelo), evaluar) : null,
    claveOA ? () => medirLlamada({ servicio: "ia", proveedor: "openai", fuente: "voz", modelo }, () => porOpenAI(claveOA, datos, ext, contentType, modelo), evaluar) : null,
  ];
  if (opciones.proveedor === "openai") intentos.reverse();
  for (const intento of intentos) {
    if (!intento) continue;
    try {
      const r = await intento();
      if (r.ok) return r;
      errores.push(r.error);
    } catch (e) {
      errores.push(`Error al transcribir: ${e instanceof Error ? e.message : "desconocido"}.`);
    }
  }
  return { ok: false, error: errores.join(" · ") };
}
