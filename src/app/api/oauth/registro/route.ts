import { CORS_HEADERS, ErrorOAuth, respuestaJson } from "@/lib/oauth/config";
import { registrarCliente } from "@/lib/oauth/servicio";

export const dynamic = "force-dynamic";

// POST /api/oauth/registro — Registro dinámico de clientes (RFC 7591).
// Público por diseño: claude.ai, ChatGPT o Cursor se registran solos antes de
// pedir autorización. Registrarse no da acceso a nada; el acceso lo concede un
// administrador de Gestivo en /oauth/autorizar.
export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo || typeof cuerpo !== "object") {
    return new ErrorOAuth("invalid_client_metadata", "El cuerpo debe ser JSON.").aRespuesta();
  }
  try {
    return respuestaJson(await registrarCliente(cuerpo), 201);
  } catch (e) {
    if (e instanceof ErrorOAuth) return e.aRespuesta();
    console.error("[oauth] registro:", e);
    return new ErrorOAuth("server_error", "Error interno.", 500).aRespuesta();
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
