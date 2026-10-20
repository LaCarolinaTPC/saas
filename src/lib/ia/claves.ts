/**
 * API keys de los proveedores de IA, administradas en un solo lugar
 * (Configuración → Proveedores de IA) y usadas por quien las necesite: la
 * transcripción de accidentes (OpenAI) y el agente de WhatsApp (cualquiera).
 *
 * Se guardan cifradas en app_settings. Orden de lectura: Configuración,
 * variable de entorno y, por compatibilidad, la key que se haya guardado en
 * la primera versión del agente (columnas de wa_agente).
 *
 * SOLO servidor: las keys nunca salen hacia el cliente.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingValue, setSettingValue, SETTING_OPENAI_API_KEY } from "@/lib/settings";
import { cifrar, descifrar } from "@/lib/comunicaciones/cifrado";
import { PROVEEDORES_IA, type ProveedorIA } from "./proveedores";

export type FuenteClave = "config" | "env" | "agente";

export interface EstadoClave {
  proveedor: ProveedorIA;
  configurada: boolean;
  enmascarada: string | null;
  fuente: FuenteClave | null;
}

const SETTING: Record<ProveedorIA, string> = {
  anthropic: "anthropic_api_key",
  openai: SETTING_OPENAI_API_KEY,
  openrouter: "openrouter_api_key",
};

const ENV: Record<ProveedorIA, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const COLUMNA_AGENTE: Record<ProveedorIA, string> = {
  anthropic: "anthropic_api_key",
  openai: "openai_api_key",
  openrouter: "openrouter_api_key",
};

function enmascarar(clave: string): string {
  if (clave.length <= 8) return "••••";
  return `${clave.slice(0, 5)}••••${clave.slice(-4)}`;
}

async function clavesDelAgente(): Promise<Record<string, string | null> | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("wa_agente")
    .select("anthropic_api_key, openai_api_key, openrouter_api_key")
    .eq("id", 1)
    .maybeSingle();
  return (data as Record<string, string | null> | null) ?? null;
}

async function resolver(
  proveedor: ProveedorIA,
  agente: Record<string, string | null> | null
): Promise<{ clave: string; fuente: FuenteClave } | null> {
  const guardada = await getSettingValue(SETTING[proveedor]);
  if (guardada) return { clave: descifrar(guardada), fuente: "config" };
  const env = process.env[ENV[proveedor]];
  if (env) return { clave: env, fuente: "env" };
  const legado = agente?.[COLUMNA_AGENTE[proveedor]];
  if (legado) return { clave: descifrar(legado), fuente: "agente" };
  return null;
}

export async function getClaveIA(proveedor: ProveedorIA): Promise<string | null> {
  return (await resolver(proveedor, await clavesDelAgente()))?.clave ?? null;
}

export async function getClavesIA(): Promise<Record<ProveedorIA, string | null>> {
  const agente = await clavesDelAgente();
  // Por id y no por posición: PROVEEDORES_IA va en el orden de la pantalla.
  const pares = await Promise.all(
    PROVEEDORES_IA.map(async (p) => [p.id, (await resolver(p.id, agente))?.clave ?? null] as const)
  );
  return Object.fromEntries(pares) as Record<ProveedorIA, string | null>;
}

/** Qué keys hay y de dónde salen, sin revelarlas. */
export async function getEstadoClavesIA(): Promise<EstadoClave[]> {
  const agente = await clavesDelAgente();
  return Promise.all(
    PROVEEDORES_IA.map(async (p) => {
      const r = await resolver(p.id, agente);
      return {
        proveedor: p.id,
        configurada: !!r,
        enmascarada: r ? enmascarar(r.clave) : null,
        fuente: r?.fuente ?? null,
      };
    })
  );
}

/**
 * Comprueba la key contra el proveedor con una consulta que no consume
 * tokens. Devuelve el error legible si la rechaza.
 */
export async function verificarClaveIA(proveedor: ProveedorIA, clave: string): Promise<string | null> {
  try {
    if (proveedor === "anthropic") {
      const client = new Anthropic({ apiKey: clave, timeout: 15_000, maxRetries: 0 });
      await client.models.list({ limit: 1 });
      return null;
    }
    const url = proveedor === "openai" ? "https://api.openai.com/v1/models" : "https://openrouter.ai/api/v1/key";
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${clave}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return j.error?.message ?? `HTTP ${res.status}`;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return "La key no es válida.";
    if (e instanceof Anthropic.APIError) return e.message;
    return e instanceof Error ? e.message : "No se pudo verificar la key.";
  }
}

export async function guardarClaveIA(proveedor: ProveedorIA, clave: string, userId?: string): Promise<void> {
  await setSettingValue(SETTING[proveedor], cifrar(clave), userId);
}

/**
 * Quita la key de Configuración y la que hubiera quedado en el agente, para
 * que de verdad deje de estar disponible (la de entorno no se puede quitar desde aquí).
 */
export async function eliminarClaveIA(proveedor: ProveedorIA): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("app_settings").delete().eq("key", SETTING[proveedor]);
  if (error) throw new Error(error.message);
  const { error: eAgente } = await db.from("wa_agente").update({ [COLUMNA_AGENTE[proveedor]]: null }).eq("id", 1);
  if (eAgente) throw new Error(eAgente.message);
}
