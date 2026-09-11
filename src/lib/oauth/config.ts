import { createHash, randomBytes, timingSafeEqual } from "crypto";

// Configuración y utilidades puras del servidor de autorización OAuth 2.1 que
// protege el MCP de Gestivo (/api/mcp). Sin acceso a base de datos: eso vive en
// servicio.ts.

export const ALCANCE_LECTURA = "gestivo:lectura";

export const DURACION_CODIGO_S = 10 * 60;
export const DURACION_ACCESO_S = 60 * 60;
export const DURACION_REFRESCO_S = 30 * 24 * 60 * 60;

/** Prefijos visibles: permiten saber de un vistazo qué clase de secreto es. */
export const PREFIJOS = {
  cliente: "gcl_",
  secreto: "gcs_",
  codigo: "gac_",
  acceso: "gat_",
  refresco: "grt_",
} as const;

export function generarSecreto(prefijo: string): string {
  return `${prefijo}${randomBytes(32).toString("base64url")}`;
}

export function hashSecreto(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export function igualesEnTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** PKCE S256 (RFC 7636): BASE64URL(SHA256(verifier)) === challenge. */
export function verificarPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const calculado = createHash("sha256").update(verifier).digest("base64url");
  return igualesEnTiempoConstante(calculado, challenge);
}

/**
 * URL pública de Gestivo. GESTIVO_URL_PUBLICA fija el emisor cuando hay varios
 * dominios apuntando al mismo despliegue; si no, se usa el origen de la petición.
 */
export function urlPublica(request: Request): string {
  const fija = process.env.GESTIVO_URL_PUBLICA?.trim().replace(/\/+$/, "");
  return fija || new URL(request.url).origin;
}

/** Igual que urlPublica, para Server Components y Server Actions (sin Request). */
export function urlPublicaDesdeHeaders(headers: Headers): string {
  const fija = process.env.GESTIVO_URL_PUBLICA?.trim().replace(/\/+$/, "");
  if (fija) return fija;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const protocolo =
    headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

/** Agrega parámetros a la redirect_uri del cliente conservando los que ya traiga. */
export function construirRedireccion(
  redirectUri: string,
  parametros: Record<string, string | null | undefined>
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(parametros)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function urlMcp(base: string): string {
  return `${base}/api/mcp`;
}

export function urlMetadatosRecurso(base: string): string {
  return `${base}/.well-known/oauth-protected-resource/api/mcp`;
}

/** RFC 9728: metadatos del recurso protegido (el MCP). */
export function metadatosRecursoProtegido(base: string) {
  return {
    resource: urlMcp(base),
    authorization_servers: [base],
    scopes_supported: [ALCANCE_LECTURA],
    bearer_methods_supported: ["header"],
    resource_name: "Gestivo",
    resource_documentation: `${base}/docs/api#mcp`,
  };
}

/** RFC 8414: metadatos del servidor de autorización. */
export function metadatosServidorAutorizacion(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/autorizar`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/registro`,
    revocation_endpoint: `${base}/api/oauth/revocar`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    revocation_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: [ALCANCE_LECTURA],
    service_documentation: `${base}/docs/api#mcp`,
  };
}

// Esquemas que nunca pueden recibir un código: ejecutarían contenido en el
// navegador o leerían archivos locales.
const ESQUEMAS_PROHIBIDOS = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:"]);
const HOSTS_LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Redirect URIs aceptadas al registrar un cliente: https, http solo en
 * loopback (clientes de escritorio, RFC 8252) o esquemas privados de apps
 * nativas (cursor://, vscode://…). Sin fragmento.
 */
export function redirectUriValida(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (ESQUEMAS_PROHIBIDOS.has(url.protocol)) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return HOSTS_LOOPBACK.has(url.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol);
}

/**
 * Comparación de la redirect_uri pedida contra las registradas: exacta, salvo
 * el puerto en loopback, que los clientes de escritorio eligen al vuelo.
 */
export function redirectUriRegistrada(pedida: string, registradas: string[]): boolean {
  if (registradas.includes(pedida)) return true;
  let url: URL;
  try {
    url = new URL(pedida);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || !HOSTS_LOOPBACK.has(url.hostname)) return false;
  return registradas.some((r) => {
    try {
      const reg = new URL(r);
      return (
        reg.protocol === "http:" &&
        reg.hostname === url.hostname &&
        reg.pathname === url.pathname &&
        reg.search === url.search
      );
    } catch {
      return false;
    }
  });
}

/** Encabezados CORS para clientes MCP que corren en el navegador. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, X-Api-Key, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function respuestaJson(
  cuerpo: unknown,
  status = 200,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

export class ErrorOAuth extends Error {
  constructor(
    public codigo: string,
    public descripcion: string,
    public status = 400
  ) {
    super(descripcion);
  }

  aRespuesta(): Response {
    return respuestaJson(
      { error: this.codigo, error_description: this.descripcion },
      this.status
    );
  }
}
