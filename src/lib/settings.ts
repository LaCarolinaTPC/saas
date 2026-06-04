import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lectura/escritura de configuración (tabla app_settings).
 * SOLO server-side: el valor crudo nunca debe exponerse al cliente.
 */

export const SETTING_OPENAI_API_KEY = "openai_api_key";

export async function getSettingValue(key: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return data.value ?? null;
  } catch {
    return null;
  }
}

export async function setSettingValue(
  key: string,
  value: string,
  userId?: string
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: userId ?? null },
      { onConflict: "key" }
    );
  if (error) throw error;
}

/** API key de OpenAI: primero de Configuración (BD), luego variable de entorno. */
export async function getOpenAIKey(): Promise<string | null> {
  const fromDb = await getSettingValue(SETTING_OPENAI_API_KEY);
  return fromDb || process.env.OPENAI_API_KEY || null;
}

/** Estado seguro para mostrar en la UI (sin revelar la key). */
export async function getOpenAIKeyStatus(): Promise<{
  configured: boolean;
  masked: string | null;
  source: "config" | "env" | null;
}> {
  const fromDb = await getSettingValue(SETTING_OPENAI_API_KEY);
  if (fromDb) {
    return { configured: true, masked: maskKey(fromDb), source: "config" };
  }
  if (process.env.OPENAI_API_KEY) {
    return { configured: true, masked: maskKey(process.env.OPENAI_API_KEY), source: "env" };
  }
  return { configured: false, masked: null, source: null };
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}
