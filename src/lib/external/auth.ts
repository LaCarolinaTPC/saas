import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { API_KEY_PREFIX, hashApiKey } from "@/lib/external/api-keys";
import { ACCESO_TOTAL, accesoDeTipo, type AccesoDatos } from "@/lib/external/acceso";

// Autenticación de la Data API externa (/api/external/v1).
// El consumidor debe enviar la clave en el header `x-api-key`
// (o `Authorization: Bearer <clave>`). Se aceptan dos tipos de clave:
//
//   1. Claves "sk_live_..." emitidas desde Configuración → API (tabla api_keys,
//      validadas por hash SHA-256; revocables individualmente).
//   2. La clave estática legada DATA_API_KEY (variable de entorno), con
//      comparación de tiempo constante.
//
// Cada clave sk_live_… ve solo los recursos de los módulos de su tipo de
// usuario (api_keys.user_type; ver src/lib/external/acceso.ts). La legada, que
// solo se configura en el servidor, ve todo.

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual exige longitudes iguales; longitudes distintas => no coincide.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function extractKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();

  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "API key inválida o ausente. Envíela en el header x-api-key." },
    { status: 401 }
  );
}

// Registro de la solicitud en api_request_logs. Best-effort: nunca debe
// tumbar ni demorar la respuesta de la API.
async function logRequest(
  request: NextRequest,
  apiKeyId: string | null,
  resultado: "ok" | "ok_legacy" | "clave_invalida" | "sin_clave"
): Promise<void> {
  try {
    const admin = createAdminClient();
    const url = request.nextUrl;
    await admin.from("api_request_logs").insert({
      api_key_id: apiKeyId,
      method: request.method,
      path: url.pathname,
      query: url.search ? url.search.slice(1).slice(0, 2000) : null,
      resultado,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        null,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
  } catch (e) {
    console.error("[api-log] no se pudo registrar la solicitud:", e);
  }
}

export type ApiKeyIdentificada =
  | { tipo: "legado" }
  | { tipo: "api_key"; id: string; nombre: string; tipoUsuario: string | null };

/**
 * Identifica una clave sin producir respuesta HTTP: la usan tanto la Data API
 * como el servidor MCP (/api/mcp). Devuelve null si la clave no es válida.
 */
export async function identificarApiKey(
  provided: string
): Promise<ApiKeyIdentificada | null> {
  // 1) Clave estática legada (variable de entorno).
  const legacy = process.env.DATA_API_KEY;
  if (legacy && safeEqual(provided, legacy)) {
    return { tipo: "legado" };
  }

  // 2) Claves emitidas desde el dashboard (tabla api_keys, lookup por hash).
  if (provided.startsWith(API_KEY_PREFIX)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("api_keys")
      // select("*") a propósito: si la migración 20260930202307 aún no se
      // aplicó, pedir user_type por nombre haría fallar todas las claves.
      .select("*")
      .eq("key_hash", hashApiKey(provided))
      .eq("is_active", true)
      .maybeSingle();

    if (data) {
      // Registrar último uso (best-effort: no bloquea la respuesta si falla).
      await admin
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id);
      // Sin la columna (migración pendiente) la clave conserva el acceso
      // completo que tenía; la migración les pone 'admin' a las existentes.
      const tipoUsuario = "user_type" in data ? (data.user_type as string | null) : "admin";
      return { tipo: "api_key", id: data.id, nombre: data.name, tipoUsuario };
    }
  }

  return null;
}

/** Acceso a los datos de una clave ya identificada. */
export function accesoDeClave(clave: ApiKeyIdentificada): Promise<AccesoDatos> {
  return clave.tipo === "legado" ? Promise.resolve(ACCESO_TOTAL) : accesoDeTipo(clave.tipoUsuario);
}

/**
 * Verifica la API key de la petición y calcula qué recursos puede leer.
 * Si no es válida devuelve la `NextResponse` de error que el route handler
 * debe retornar directamente.
 */
export async function requireApiKey(
  request: NextRequest
): Promise<{ error: NextResponse; acceso?: undefined } | { error: null; acceso: AccesoDatos }> {
  const provided = extractKey(request);
  if (!provided) {
    await logRequest(request, null, "sin_clave");
    return { error: unauthorized() };
  }

  const clave = await identificarApiKey(provided);
  if (!clave) {
    await logRequest(request, null, "clave_invalida");
    return { error: unauthorized() };
  }
  await logRequest(request, clave.tipo === "api_key" ? clave.id : null, clave.tipo === "legado" ? "ok_legacy" : "ok");
  return { error: null, acceso: await accesoDeClave(clave) };
}

/** Respuesta 403 para un recurso que existe pero el tipo de la clave no ve. */
export function recursoNoPermitido(recurso: string): NextResponse {
  return NextResponse.json(
    {
      error: `La clave no tiene acceso a '${recurso}': su tipo de usuario no incluye el módulo de ese recurso. Consulte /api/external/v1/schema para ver los recursos disponibles.`,
    },
    { status: 403 }
  );
}
