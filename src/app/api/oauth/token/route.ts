import { CORS_HEADERS, ErrorOAuth, respuestaJson } from "@/lib/oauth/config";
import { autenticarCliente, canjearCodigo, refrescarTokens } from "@/lib/oauth/servicio";

export const dynamic = "force-dynamic";

async function leerFormulario(request: Request): Promise<URLSearchParams> {
  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) {
    const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(
      Object.entries(json)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => [k, v as string])
    );
  }
  return new URLSearchParams(await request.text());
}

// POST /api/oauth/token — canje de código (con PKCE) y rotación de refresh token.
export async function POST(request: Request) {
  try {
    const form = await leerFormulario(request);
    const cliente = await autenticarCliente(request, form);

    switch (form.get("grant_type")) {
      case "authorization_code":
        return respuestaJson(await canjearCodigo(cliente, form));
      case "refresh_token":
        return respuestaJson(await refrescarTokens(cliente, form));
      default:
        throw new ErrorOAuth(
          "unsupported_grant_type",
          "grant_type debe ser authorization_code o refresh_token."
        );
    }
  } catch (e) {
    if (e instanceof ErrorOAuth) return e.aRespuesta();
    console.error("[oauth] token:", e);
    return new ErrorOAuth("server_error", "Error interno.", 500).aRespuesta();
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
