import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { API_KEY_PREFIX, hashApiKey } from "@/lib/external/api-keys";

// Autenticación de la Data API externa (/api/external/v1).
// El consumidor debe enviar la clave en el header `x-api-key`
// (o `Authorization: Bearer <clave>`). Se aceptan dos tipos de clave:
//
//   1. Claves "sk_live_..." emitidas desde Configuración → API (tabla api_keys,
//      validadas por hash SHA-256; revocables individualmente).
//   2. La clave estática legada DATA_API_KEY (variable de entorno), con
//      comparación de tiempo constante.

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

/**
 * Verifica la API key de la petición.
 * Devuelve `null` si es válida; si no, devuelve la `NextResponse` de error que
 * el route handler debe retornar directamente.
 */
export async function requireApiKey(
  request: NextRequest
): Promise<NextResponse | null> {
  const provided = extractKey(request);
  if (!provided) {
    await logRequest(request, null, "sin_clave");
    return unauthorized();
  }

  // 1) Clave estática legada (variable de entorno).
  const legacy = process.env.DATA_API_KEY;
  if (legacy && safeEqual(provided, legacy)) {
    await logRequest(request, null, "ok_legacy");
    return null;
  }

  // 2) Claves emitidas desde el dashboard (tabla api_keys, lookup por hash).
  if (provided.startsWith(API_KEY_PREFIX)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("api_keys")
      .select("id")
      .eq("key_hash", hashApiKey(provided))
      .eq("is_active", true)
      .maybeSingle();

    if (data) {
      // Registrar último uso (best-effort: no bloquea la respuesta si falla).
      await admin
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id);
      await logRequest(request, data.id, "ok");
      return null;
    }
  }

  await logRequest(request, null, "clave_invalida");
  return unauthorized();
}
