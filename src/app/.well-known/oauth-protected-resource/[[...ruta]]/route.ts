import { CORS_HEADERS, metadatosRecursoProtegido, respuestaJson, urlPublica } from "@/lib/oauth/config";

export const dynamic = "force-dynamic";

// RFC 9728. Se sirve en /.well-known/oauth-protected-resource y también con el
// sufijo de ruta del recurso (/.well-known/oauth-protected-resource/api/mcp),
// que es donde lo buscan los clientes MCP primero.
export function GET(request: Request) {
  return respuestaJson(metadatosRecursoProtegido(urlPublica(request)), 200, {
    "Cache-Control": "public, max-age=3600",
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
