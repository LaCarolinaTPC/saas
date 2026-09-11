import {
  CORS_HEADERS,
  metadatosServidorAutorizacion,
  respuestaJson,
  urlPublica,
} from "@/lib/oauth/config";

export const dynamic = "force-dynamic";

// RFC 8414. El emisor es la raíz de Gestivo, pero algunos clientes también
// prueban con el sufijo de ruta del MCP; ambas variantes responden lo mismo.
export function GET(request: Request) {
  return respuestaJson(metadatosServidorAutorizacion(urlPublica(request)), 200, {
    "Cache-Control": "public, max-age=3600",
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
