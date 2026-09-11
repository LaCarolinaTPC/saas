import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { autenticarMcp, extraerCredencial, registrarUsoMcp } from "@/lib/mcp/auth";
import { crearServidorMcp } from "@/lib/mcp/servidor";
import {
  ALCANCE_LECTURA,
  CORS_HEADERS,
  respuestaJson,
  urlMetadatosRecurso,
  urlPublica,
} from "@/lib/oauth/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Servidor MCP de Gestivo (Streamable HTTP, sin estado).
//
// Cada POST trae un mensaje JSON-RPC y recibe la respuesta completa en JSON:
// no hay sesiones ni flujo SSE, lo que encaja con funciones serverless.
// Autenticación: Authorization: Bearer <sk_live_… | gat_…> o x-api-key.
// Sin credencial válida responde 401 con WWW-Authenticate apuntando a los
// metadatos OAuth, que es lo que usan claude.ai y ChatGPT para iniciar sesión.

function conCors(respuesta: Response): Response {
  const headers = new Headers(respuesta.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(respuesta.body, { status: respuesta.status, headers });
}

export async function POST(request: Request) {
  const identidad = await autenticarMcp(request);

  if (!identidad) {
    const traiaCredencial = extraerCredencial(request) !== null;
    if (traiaCredencial) {
      await registrarUsoMcp(request, null, "autenticacion", null, "clave_invalida");
    }
    const base = urlPublica(request);
    return respuestaJson(
      {
        error: traiaCredencial ? "invalid_token" : "unauthorized",
        error_description: traiaCredencial
          ? "La credencial no es válida, expiró o fue revocada."
          : "Falta autenticación: use OAuth o envíe una API key de Gestivo en Authorization: Bearer.",
      },
      401,
      {
        "WWW-Authenticate": `Bearer resource_metadata="${urlMetadatosRecurso(base)}", scope="${ALCANCE_LECTURA}"${
          traiaCredencial ? ', error="invalid_token"' : ""
        }`,
      }
    );
  }

  const servidor = crearServidorMcp((herramienta, argumentos, resultado) =>
    registrarUsoMcp(request, identidad, herramienta, argumentos, resultado)
  );
  const transporte = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await servidor.connect(transporte);
    return conCors(await transporte.handleRequest(request));
  } finally {
    await servidor.close();
  }
}

// Sin sesiones no hay flujo SSE que abrir ni sesión que cerrar.
function metodoNoPermitido(): Response {
  return respuestaJson(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Método no permitido: este servidor MCP solo acepta POST." },
      id: null,
    },
    405,
    { Allow: "POST, OPTIONS" }
  );
}

export const GET = metodoNoPermitido;
export const DELETE = metodoNoPermitido;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
