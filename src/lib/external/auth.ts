import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Autenticación por API key estática para la Data API externa (/api/external/v1).
// El consumidor (p. ej. un consultor de datos con IA) debe enviar la clave en el
// header `x-api-key` (o `Authorization: Bearer <clave>`). La clave se valida
// contra la variable de entorno DATA_API_KEY con comparación de tiempo constante.

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

/**
 * Verifica la API key de la petición.
 * Devuelve `null` si es válida; si no, devuelve la `NextResponse` de error que
 * el route handler debe retornar directamente.
 */
export function requireApiKey(request: NextRequest): NextResponse | null {
  const expected = process.env.DATA_API_KEY;

  if (!expected) {
    return NextResponse.json(
      { error: "DATA_API_KEY no está configurada en el servidor." },
      { status: 500 }
    );
  }

  const provided = extractKey(request);
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "API key inválida o ausente. Envíela en el header x-api-key." },
      { status: 401 }
    );
  }

  return null;
}
