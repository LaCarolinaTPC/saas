import { createAdminClient } from "@/lib/supabase/admin";
import { identificarApiKey } from "@/lib/external/auth";
import { PREFIJOS } from "@/lib/oauth/config";
import { validarTokenAcceso } from "@/lib/oauth/servicio";

// Autenticación y bitácora del servidor MCP. Acepta las mismas claves que la
// Data API (sk_live_… o la legada DATA_API_KEY) y los tokens de acceso OAuth
// que emite Gestivo a sus administradores (gat_…).

export type IdentidadMcp =
  | { tipo: "api_key"; apiKeyId: string; nombre: string }
  | { tipo: "legado" }
  | { tipo: "oauth"; concesionId: string; usuarioId: string; cliente: string };

export function extraerCredencial(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const clave = request.headers.get("x-api-key")?.trim();
  return clave || null;
}

export async function autenticarMcp(request: Request): Promise<IdentidadMcp | null> {
  const credencial = extraerCredencial(request);
  if (!credencial) return null;

  if (credencial.startsWith(PREFIJOS.acceso)) {
    const oauth = await validarTokenAcceso(credencial);
    return oauth ? { tipo: "oauth", ...oauth } : null;
  }

  const clave = await identificarApiKey(credencial);
  if (!clave) return null;
  return clave.tipo === "legado"
    ? { tipo: "legado" }
    : { tipo: "api_key", apiKeyId: clave.id, nombre: clave.nombre };
}

/**
 * Registra una llamada en api_request_logs (misma bitácora que la Data API,
 * visible en Configuración → API). Best-effort: nunca rompe la respuesta.
 */
export async function registrarUsoMcp(
  request: Request,
  identidad: IdentidadMcp | null,
  herramienta: string,
  argumentos: unknown,
  resultado: "ok" | "ok_legacy" | "error" | "clave_invalida"
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("api_request_logs").insert({
      api_key_id: identidad?.tipo === "api_key" ? identidad.apiKeyId : null,
      ...(identidad?.tipo === "oauth" ? { oauth_concesion_id: identidad.concesionId } : {}),
      method: "MCP",
      path: `/api/mcp/${herramienta}`,
      query: argumentos ? JSON.stringify(argumentos).slice(0, 2000) : null,
      resultado: resultado === "ok" && identidad?.tipo === "legado" ? "ok_legacy" : resultado,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        null,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
  } catch (e) {
    console.error("[mcp] no se pudo registrar la llamada:", e);
  }
}
