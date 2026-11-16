/**
 * Llamada al modelo según el proveedor configurado. Claude va por el SDK
 * oficial de Anthropic; OpenAI y OpenRouter por su API REST de chat
 * (OpenRouter es compatible con la de OpenAI).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AgenteClaves, AgenteConfig } from "./config";
import { modeloSolicitado } from "./config";
import { errorProveedorLegible, fallaDeRed, type ProveedorError } from "@/lib/ia/errores";
import type { TurnoModelo } from "./motor";

export interface RespuestaModelo {
  texto: string;
  /** Modelo que respondió de verdad (OpenRouter y el respaldo de Claude pueden cambiarlo). */
  modeloUsado: string;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  /** El modelo se negó a responder: la conversación debe pasar a un humano. */
  rechazo: boolean;
}

/** Margen para el razonamiento de los modelos que piensan antes de responder. */
const MAX_TOKENS = 2000;
// Con la espera previa (máx. 20 s) debe caber en los 60 s del webhook (maxDuration).
const TIMEOUT_MS = 25_000;

/** Modelos de Claude que admiten el respaldo automático en el servidor ante un rechazo. */
const CON_RESPALDO = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

async function conClaude(clave: string, modelo: string, sistema: string, turnos: TurnoModelo[]): Promise<RespuestaModelo> {
  const client = new Anthropic({ apiKey: clave, timeout: TIMEOUT_MS, maxRetries: 0 });
  const respaldo = CON_RESPALDO.has(modelo);
  const r = await client.beta.messages
    .create({
    model: modelo,
    max_tokens: MAX_TOKENS,
    // Chat corto: esfuerzo bajo basta y abarata cada respuesta.
    output_config: { effort: "low" },
    // El prompt del administrador casi no cambia: se cachea entre mensajes.
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    messages: turnos,
    ...(respaldo ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    })
    .catch((e: unknown) => {
      throw new Error(errorAnthropicLegible(e, modelo));
    });
  const texto = r.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const u = r.usage;
  return {
    texto,
    modeloUsado: r.model,
    tokensEntrada: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    tokensSalida: u.output_tokens,
    rechazo: r.stop_reason === "refusal",
  };
}

/** Error del SDK de Anthropic en español. */
export function errorAnthropicLegible(e: unknown, modelo?: string): string {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return errorProveedorLegible({ proveedor: "anthropic", tiempoAgotado: true });
  if (e instanceof Anthropic.APIConnectionError) return errorProveedorLegible({ proveedor: "anthropic", sinConexion: true });
  if (e instanceof Anthropic.APIError) return errorProveedorLegible({ proveedor: "anthropic", status: e.status, mensaje: e.message, modelo });
  return e instanceof Error ? e.message : "Anthropic no respondió.";
}

interface RespuestaChat {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | number };
}

async function conChatCompletions(
  proveedor: ProveedorError,
  url: string,
  clave: string,
  cuerpo: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
): Promise<RespuestaModelo> {
  const modelo = typeof cuerpo.model === "string" ? cuerpo.model : undefined;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: unknown) => {
    const red = fallaDeRed(e);
    throw red ? new Error(errorProveedorLegible({ proveedor, ...red })) : e;
  });
  const j = (await res.json().catch(() => ({}))) as RespuestaChat;
  if (!res.ok) {
    const codigo = j.error?.code;
    throw new Error(
      errorProveedorLegible({ proveedor, status: res.status, mensaje: j.error?.message, codigo: typeof codigo === "string" ? codigo : undefined, modelo })
    );
  }
  const mensaje = j.choices?.[0]?.message;
  return {
    texto: (mensaje?.content ?? "").trim(),
    modeloUsado: j.model ?? String(cuerpo.model),
    tokensEntrada: j.usage?.prompt_tokens ?? null,
    tokensSalida: j.usage?.completion_tokens ?? null,
    rechazo: !!mensaje?.refusal,
  };
}

/**
 * Solo para pruebas: un servidor local compatible con la API de OpenAI
 * (LM Studio, Ollama, llama.cpp) en la red, p. ej. http://192.168.1.50:1234/v1.
 * No se usa en producción: lo llama el evaluador con --local.
 */
export async function generarRespuestaLocal(
  urlBase: string,
  modelo: string | null,
  sistema: string,
  turnos: TurnoModelo[]
): Promise<RespuestaModelo> {
  const res = await fetch(`${urlBase.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // LM Studio usa el modelo cargado si el nombre no coincide.
      model: modelo ?? "local",
      messages: [{ role: "system", content: sistema }, ...turnos],
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      // Sin razonamiento previo: en una GPU de 8 GB, Gemma 4 E4B tardaba ~12 s
      // pensando cada respuesta; con "none" baja a ~5 s (LM Studio lo respeta).
      reasoning_effort: "none",
    }),
    // Una GPU de casa tarda más que un proveedor en la nube.
    signal: AbortSignal.timeout(180_000),
  });
  const cuerpo = await res.text();
  let j: RespuestaChat = {};
  try {
    j = JSON.parse(cuerpo) as RespuestaChat;
  } catch {}
  // LM Studio a veces devuelve el error como texto: {"error": "..."}.
  if (!res.ok) {
    const e = (j as { error?: unknown }).error;
    throw new Error(`HTTP ${res.status}: ${typeof e === "string" ? e : (j.error?.message ?? cuerpo.slice(0, 200))}`);
  }
  const mensaje = j.choices?.[0]?.message;
  // Los modelos que razonan (Qwen3, DeepSeek R1) pueden dejar <think>…</think> en el texto.
  const texto = (mensaje?.content ?? "").replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
  return {
    texto,
    modeloUsado: j.model ?? modelo ?? "local",
    tokensEntrada: j.usage?.prompt_tokens ?? null,
    tokensSalida: j.usage?.completion_tokens ?? null,
    rechazo: false,
  };
}

/** Lista "anthropic/*, google/*" → ["anthropic/*", "google/*"]. */
export function parsearModelosPermitidos(lista: string | null): string[] {
  return (lista ?? "")
    .split(/[,\n]/)
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Pide la respuesta al modelo. Lanza un Error con mensaje legible si falta la
 * clave o el proveedor falla.
 */
export async function generarRespuesta(
  config: AgenteConfig,
  claves: AgenteClaves,
  sistema: string,
  turnos: TurnoModelo[]
): Promise<RespuestaModelo> {
  const modelo = modeloSolicitado(config);
  const mensajes = [{ role: "system", content: sistema }, ...turnos];

  if (config.proveedor === "anthropic") {
    if (!claves.anthropic) throw new Error("Falta la API key de Anthropic (Configuración → Proveedores de IA).");
    return conClaude(claves.anthropic, modelo, sistema, turnos);
  }

  if (config.proveedor === "openai") {
    if (!claves.openai) throw new Error("Falta la API key de OpenAI (Configuración → Proveedores de IA).");
    return conChatCompletions("openai", "https://api.openai.com/v1/chat/completions", claves.openai, {
      model: modelo,
      messages: mensajes,
      max_completion_tokens: MAX_TOKENS,
    });
  }

  if (!claves.openrouter) throw new Error("Falta la API key de OpenRouter (Configuración → Proveedores de IA).");
  // Auto: el Auto Router de OpenRouter elige el modelo dentro del nivel de
  // costo (y de la lista permitida, si hay). Manual: el modelo indicado,
  // servido por el proveedor más barato.
  const permitidos = parsearModelosPermitidos(config.openrouterModelosPermitidos);
  const enrutamiento =
    config.openrouterModo === "auto"
      ? {
          plugins: [
            {
              id: "auto-router",
              cost_tier: config.openrouterNivelCosto,
              ...(permitidos.length ? { allowed_models: permitidos } : {}),
            },
          ],
        }
      : { provider: { sort: "price" } };
  return conChatCompletions(
    "openrouter",
    "https://openrouter.ai/api/v1/chat/completions",
    claves.openrouter,
    { model: modelo, messages: mensajes, max_tokens: MAX_TOKENS, ...enrutamiento },
    { "X-Title": "Gestivo" }
  );
}
