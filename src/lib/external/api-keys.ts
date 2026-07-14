import { createHash, randomBytes } from "crypto";

// Generación y hash de las API keys de la Data API externa.
// La clave completa solo existe en memoria al crearla: en la base de datos
// se guarda únicamente su SHA-256 (api_keys.key_hash) y un prefijo para la UI.

export const API_KEY_PREFIX = "sk_live_";

/** Longitud del prefijo visible en la UI ("sk_live_" + 6 caracteres). */
const VISIBLE_PREFIX_LENGTH = API_KEY_PREFIX.length + 6;

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): {
  /** Clave completa. Mostrar UNA sola vez al usuario; no se puede recuperar. */
  key: string;
  /** Prefijo para identificar la clave en la UI (p. ej. "sk_live_a1b2c3"). */
  prefix: string;
  /** SHA-256 hex de la clave, para persistir en api_keys.key_hash. */
  hash: string;
} {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return {
    key,
    prefix: key.slice(0, VISIBLE_PREFIX_LENGTH),
    hash: hashApiKey(key),
  };
}
