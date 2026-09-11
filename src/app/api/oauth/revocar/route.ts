import { CORS_HEADERS, ErrorOAuth } from "@/lib/oauth/config";
import { autenticarCliente, revocarToken } from "@/lib/oauth/servicio";

export const dynamic = "force-dynamic";

// POST /api/oauth/revocar — RFC 7009. Revocar cualquier token de una
// autorización la corta completa. Responde 200 aunque el token no exista.
export async function POST(request: Request) {
  try {
    const form = new URLSearchParams(await request.text());
    const cliente = await autenticarCliente(request, form);
    await revocarToken(cliente, form.get("token") ?? "");
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    if (e instanceof ErrorOAuth) return e.aRespuesta();
    console.error("[oauth] revocar:", e);
    return new ErrorOAuth("server_error", "Error interno.", 500).aRespuesta();
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
