import { createAdminClient } from "@/lib/supabase/admin";
import { descifrar } from "@/lib/comunicaciones/cifrado";

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

/**
 * API key de OpenAI: primero de Configuración (BD, cifrada desde que las keys
 * de IA se administran juntas en src/lib/ia/claves.ts), luego variable de entorno.
 */
export async function getOpenAIKey(): Promise<string | null> {
  const fromDb = await getSettingValue(SETTING_OPENAI_API_KEY);
  return (fromDb ? descifrar(fromDb) : null) || process.env.OPENAI_API_KEY || null;
}
