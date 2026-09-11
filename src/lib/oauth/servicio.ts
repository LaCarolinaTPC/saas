import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALCANCE_LECTURA,
  DURACION_ACCESO_S,
  DURACION_CODIGO_S,
  DURACION_REFRESCO_S,
  ErrorOAuth,
  PREFIJOS,
  generarSecreto,
  hashSecreto,
  igualesEnTiempoConstante,
  redirectUriRegistrada,
  redirectUriValida,
  verificarPkce,
} from "@/lib/oauth/config";

// Operaciones con base de datos del servidor de autorización OAuth 2.1.
//
// Decisión de acceso: solo un administrador de Gestivo puede autorizar a un
// agente, porque el MCP entrega todos los recursos de la lista blanca sin
// distinguir módulos. La condición se revisa al autorizar Y en cada uso del
// token: si el usuario deja de ser administrador, sus agentes pierden acceso.

type ClienteOAuth = {
  id: string;
  client_id: string;
  nombre: string;
  redirect_uris: string[];
  uri_cliente: string | null;
  metodo_autenticacion: "none" | "client_secret_post" | "client_secret_basic";
  secreto_hash: string | null;
};

export type RespuestaTokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

function enSegundos(s: number): string {
  return new Date(Date.now() + s * 1000).toISOString();
}

export async function esAdministrador(usuarioId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("user_type")
    .eq("id", usuarioId)
    .maybeSingle();
  return data?.user_type === "admin";
}

// ── Registro dinámico de clientes (RFC 7591) ──────────────────────────────────

const MAX_CLIENTES_POR_HORA = 60;

export async function registrarCliente(
  cuerpo: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const uris = cuerpo.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) {
    throw new ErrorOAuth(
      "invalid_redirect_uri",
      "redirect_uris debe ser una lista de 1 a 10 URIs."
    );
  }
  for (const uri of uris) {
    if (typeof uri !== "string" || uri.length > 500 || !redirectUriValida(uri)) {
      throw new ErrorOAuth(
        "invalid_redirect_uri",
        `redirect_uri no permitida: ${String(uri).slice(0, 120)}. Use https, http en localhost o un esquema de aplicación.`
      );
    }
  }

  const metodo =
    typeof cuerpo.token_endpoint_auth_method === "string"
      ? cuerpo.token_endpoint_auth_method
      : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(metodo)) {
    throw new ErrorOAuth(
      "invalid_client_metadata",
      "token_endpoint_auth_method debe ser none, client_secret_post o client_secret_basic."
    );
  }

  const grantTypes = Array.isArray(cuerpo.grant_types)
    ? (cuerpo.grant_types as unknown[])
    : ["authorization_code", "refresh_token"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new ErrorOAuth(
      "invalid_client_metadata",
      "Solo se admiten los grant_types authorization_code y refresh_token."
    );
  }

  const texto = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const nombre = texto(cuerpo.client_name, 120) ?? "Agente sin nombre";
  const uriCliente = texto(cuerpo.client_uri, 300);

  const admin = createAdminClient();

  // Freno básico al abuso: el endpoint es público por diseño.
  const { count } = await admin
    .from("oauth_clientes")
    .select("id", { count: "exact", head: true })
    .gte("creado_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= MAX_CLIENTES_POR_HORA) {
    throw new ErrorOAuth(
      "temporarily_unavailable",
      "Demasiados registros de clientes en la última hora. Intente más tarde.",
      429
    );
  }

  const clientId = generarSecreto(PREFIJOS.cliente);
  const secreto = metodo === "none" ? null : generarSecreto(PREFIJOS.secreto);

  const { error } = await admin.from("oauth_clientes").insert({
    client_id: clientId,
    nombre,
    redirect_uris: uris,
    uri_cliente: uriCliente,
    metodo_autenticacion: metodo,
    secreto_hash: secreto ? hashSecreto(secreto) : null,
    software_id: texto(cuerpo.software_id, 200),
    software_version: texto(cuerpo.software_version, 60),
  });
  if (error) {
    throw new ErrorOAuth("server_error", "No se pudo registrar el cliente.", 500);
  }

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(secreto ? { client_secret: secreto, client_secret_expires_at: 0 } : {}),
    client_name: nombre,
    ...(uriCliente ? { client_uri: uriCliente } : {}),
    redirect_uris: uris,
    token_endpoint_auth_method: metodo,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: ALCANCE_LECTURA,
  };
}

export async function obtenerCliente(clientId: string): Promise<ClienteOAuth | null> {
  if (!clientId.startsWith(PREFIJOS.cliente)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("oauth_clientes")
    .select("id, client_id, nombre, redirect_uris, uri_cliente, metodo_autenticacion, secreto_hash")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as ClienteOAuth | null) ?? null;
}

// ── Autorización ──────────────────────────────────────────────────────────────

export type SolicitudAutorizacion = {
  cliente: ClienteOAuth;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  alcance: string;
  recurso: string | null;
};

/**
 * Valida los parámetros de /oauth/autorizar. Distingue dos clases de error:
 * - `redirigible: false`: el cliente o la redirect_uri no son confiables, así
 *   que el error se muestra en pantalla y nunca se redirige.
 * - `redirigible: true`: la redirect_uri es válida y el error viaja al cliente.
 */
export async function validarSolicitudAutorizacion(
  params: Record<string, string | undefined>,
  urlRecursoMcp: string,
  base: string
): Promise<
  | { ok: true; solicitud: SolicitudAutorizacion }
  | { ok: false; redirigible: false; mensaje: string }
  | { ok: false; redirigible: true; redirectUri: string; state: string | null; error: string; descripcion: string }
> {
  const clientId = params.client_id ?? "";
  const cliente = clientId ? await obtenerCliente(clientId) : null;
  if (!cliente) {
    return {
      ok: false,
      redirigible: false,
      mensaje: "El agente que intenta conectarse no está registrado en Gestivo (client_id desconocido).",
    };
  }

  const redirectUri = params.redirect_uri ?? "";
  if (!redirectUri || !redirectUriRegistrada(redirectUri, cliente.redirect_uris)) {
    return {
      ok: false,
      redirigible: false,
      mensaje: "La dirección de retorno (redirect_uri) no coincide con la registrada por el agente.",
    };
  }

  const state = params.state ?? null;
  const fallo = (error: string, descripcion: string) =>
    ({ ok: false, redirigible: true, redirectUri, state, error, descripcion }) as const;

  if (params.response_type !== "code") {
    return fallo("unsupported_response_type", "Solo se admite response_type=code.");
  }
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return fallo("invalid_request", "PKCE es obligatorio con code_challenge_method=S256.");
  }
  if (!/^[A-Za-z0-9\-_]{43}$/.test(params.code_challenge)) {
    return fallo("invalid_request", "code_challenge inválido.");
  }

  const alcancesPedidos = (params.scope ?? ALCANCE_LECTURA).split(/\s+/).filter(Boolean);
  if (alcancesPedidos.some((a) => a !== ALCANCE_LECTURA)) {
    return fallo("invalid_scope", `El único alcance disponible es ${ALCANCE_LECTURA}.`);
  }

  // RFC 8707: si el cliente indica el recurso, debe ser este MCP.
  const recurso = params.resource ?? null;
  if (recurso && recurso.replace(/\/+$/, "") !== urlRecursoMcp && recurso.replace(/\/+$/, "") !== base) {
    return fallo("invalid_target", "El recurso solicitado no corresponde a este servidor MCP.");
  }

  return {
    ok: true,
    solicitud: {
      cliente,
      redirectUri,
      state,
      codeChallenge: params.code_challenge,
      alcance: ALCANCE_LECTURA,
      recurso,
    },
  };
}

export async function emitirCodigo(
  solicitud: SolicitudAutorizacion,
  usuarioId: string
): Promise<string> {
  const codigo = generarSecreto(PREFIJOS.codigo);
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_codigos").insert({
    codigo_hash: hashSecreto(codigo),
    cliente_id: solicitud.cliente.id,
    usuario_id: usuarioId,
    redirect_uri: solicitud.redirectUri,
    code_challenge: solicitud.codeChallenge,
    alcance: solicitud.alcance,
    recurso: solicitud.recurso,
    expira_at: enSegundos(DURACION_CODIGO_S),
  });
  if (error) throw new Error("No se pudo emitir el código de autorización.");
  return codigo;
}

// ── Endpoint de token ─────────────────────────────────────────────────────────

/**
 * Autentica al cliente en /token y /revocar. Los clientes públicos (PKCE) solo
 * presentan client_id; los confidenciales, además, su secreto por Basic o POST.
 */
export async function autenticarCliente(
  request: Request,
  form: URLSearchParams
): Promise<ClienteOAuth> {
  let clientId = form.get("client_id");
  let secreto = form.get("client_secret");

  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("basic ")) {
    const decodificado = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
    const separador = decodificado.indexOf(":");
    if (separador > 0) {
      clientId = decodeURIComponent(decodificado.slice(0, separador));
      secreto = decodeURIComponent(decodificado.slice(separador + 1));
    }
  }

  const cliente = clientId ? await obtenerCliente(clientId) : null;
  if (!cliente) throw new ErrorOAuth("invalid_client", "Cliente desconocido.", 401);

  if (cliente.metodo_autenticacion !== "none") {
    if (
      !secreto ||
      !cliente.secreto_hash ||
      !igualesEnTiempoConstante(hashSecreto(secreto), cliente.secreto_hash)
    ) {
      throw new ErrorOAuth("invalid_client", "Autenticación del cliente fallida.", 401);
    }
  }
  return cliente;
}

async function emitirParDeTokens(concesionId: string): Promise<RespuestaTokens> {
  const acceso = generarSecreto(PREFIJOS.acceso);
  const refresco = generarSecreto(PREFIJOS.refresco);
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_tokens").insert([
    {
      token_hash: hashSecreto(acceso),
      concesion_id: concesionId,
      tipo: "acceso",
      expira_at: enSegundos(DURACION_ACCESO_S),
    },
    {
      token_hash: hashSecreto(refresco),
      concesion_id: concesionId,
      tipo: "refresco",
      expira_at: enSegundos(DURACION_REFRESCO_S),
    },
  ]);
  if (error) throw new ErrorOAuth("server_error", "No se pudieron emitir los tokens.", 500);

  await admin
    .from("oauth_concesiones")
    .update({ ultimo_uso_at: new Date().toISOString() })
    .eq("id", concesionId);

  return {
    access_token: acceso,
    token_type: "Bearer",
    expires_in: DURACION_ACCESO_S,
    refresh_token: refresco,
    scope: ALCANCE_LECTURA,
  };
}

export async function canjearCodigo(
  cliente: ClienteOAuth,
  form: URLSearchParams
): Promise<RespuestaTokens> {
  const codigo = form.get("code") ?? "";
  const verifier = form.get("code_verifier") ?? "";
  const redirectUri = form.get("redirect_uri") ?? "";
  if (!codigo || !verifier) {
    throw new ErrorOAuth("invalid_request", "Faltan code o code_verifier.");
  }

  const admin = createAdminClient();
  // Marcar como usado de forma atómica: dos canjes simultáneos no pueden ganar ambos.
  const { data: fila } = await admin
    .from("oauth_codigos")
    .update({ usado_at: new Date().toISOString() })
    .eq("codigo_hash", hashSecreto(codigo))
    .is("usado_at", null)
    .select("cliente_id, usuario_id, redirect_uri, code_challenge, alcance, recurso, expira_at")
    .maybeSingle();

  if (!fila) throw new ErrorOAuth("invalid_grant", "Código inválido o ya utilizado.");
  if (fila.cliente_id !== cliente.id) {
    throw new ErrorOAuth("invalid_grant", "El código no pertenece a este cliente.");
  }
  if (new Date(fila.expira_at).getTime() < Date.now()) {
    throw new ErrorOAuth("invalid_grant", "El código expiró.");
  }
  if (redirectUri && redirectUri !== fila.redirect_uri) {
    throw new ErrorOAuth("invalid_grant", "redirect_uri no coincide con la de la autorización.");
  }
  if (!verificarPkce(verifier, fila.code_challenge)) {
    throw new ErrorOAuth("invalid_grant", "code_verifier no corresponde al code_challenge.");
  }
  if (!(await esAdministrador(fila.usuario_id))) {
    throw new ErrorOAuth("invalid_grant", "El usuario que autorizó ya no es administrador.");
  }

  const { data: concesion, error } = await admin
    .from("oauth_concesiones")
    .insert({
      cliente_id: cliente.id,
      usuario_id: fila.usuario_id,
      alcance: fila.alcance,
      recurso: fila.recurso,
    })
    .select("id")
    .single();
  if (error || !concesion) {
    throw new ErrorOAuth("server_error", "No se pudo registrar la autorización.", 500);
  }

  // Limpieza oportunista de códigos y tokens vencidos hace más de un día.
  const ayer = new Date(Date.now() - 86400_000).toISOString();
  void admin.from("oauth_codigos").delete().lt("expira_at", ayer).then(() => undefined);
  void admin.from("oauth_tokens").delete().lt("expira_at", ayer).then(() => undefined);

  return emitirParDeTokens(concesion.id);
}

/** Margen en el que un refresh reusado se toma como reintento y no como robo. */
const GRACIA_REUSO_MS = 30_000;

export async function refrescarTokens(
  cliente: ClienteOAuth,
  form: URLSearchParams
): Promise<RespuestaTokens> {
  const refresco = form.get("refresh_token") ?? "";
  if (!refresco.startsWith(PREFIJOS.refresco)) {
    throw new ErrorOAuth("invalid_grant", "refresh_token inválido.");
  }
  const admin = createAdminClient();
  const hash = hashSecreto(refresco);

  const { data: token } = await admin
    .from("oauth_tokens")
    .select(
      "token_hash, tipo, expira_at, usado_at, revocado_at, concesion:oauth_concesiones!inner(id, cliente_id, usuario_id, revocado_at)"
    )
    .eq("token_hash", hash)
    .eq("tipo", "refresco")
    .maybeSingle();

  const concesion = token
    ? (Array.isArray(token.concesion) ? token.concesion[0] : token.concesion)
    : null;
  if (!token || !concesion || concesion.cliente_id !== cliente.id) {
    throw new ErrorOAuth("invalid_grant", "refresh_token inválido.");
  }
  if (token.revocado_at || concesion.revocado_at) {
    throw new ErrorOAuth("invalid_grant", "La autorización fue revocada.");
  }
  if (new Date(token.expira_at).getTime() < Date.now()) {
    throw new ErrorOAuth("invalid_grant", "refresh_token expirado.");
  }

  if (token.usado_at) {
    // Rotación con detección de reuso (OAuth 2.1 §4.3.1): un refresh ya
    // canjeado que vuelve a aparecer fuera del margen indica filtración, así
    // que se corta toda la familia de tokens.
    if (Date.now() - new Date(token.usado_at).getTime() > GRACIA_REUSO_MS) {
      await revocarConcesion(concesion.id);
    }
    throw new ErrorOAuth("invalid_grant", "refresh_token ya utilizado.");
  }

  const { data: marcado } = await admin
    .from("oauth_tokens")
    .update({ usado_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .is("usado_at", null)
    .select("token_hash")
    .maybeSingle();
  if (!marcado) throw new ErrorOAuth("invalid_grant", "refresh_token ya utilizado.");

  if (!(await esAdministrador(concesion.usuario_id))) {
    await revocarConcesion(concesion.id);
    throw new ErrorOAuth("invalid_grant", "El usuario que autorizó ya no es administrador.");
  }

  return emitirParDeTokens(concesion.id);
}

// ── Revocación ────────────────────────────────────────────────────────────────

export async function revocarConcesion(concesionId: string): Promise<void> {
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  await admin
    .from("oauth_concesiones")
    .update({ revocado_at: ahora })
    .eq("id", concesionId)
    .is("revocado_at", null);
  await admin
    .from("oauth_tokens")
    .update({ revocado_at: ahora })
    .eq("concesion_id", concesionId)
    .is("revocado_at", null);
}

/** RFC 7009: revocar un token revoca su concesión completa. */
export async function revocarToken(cliente: ClienteOAuth, token: string): Promise<void> {
  if (!token) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("oauth_tokens")
    .select("concesion:oauth_concesiones!inner(id, cliente_id)")
    .eq("token_hash", hashSecreto(token))
    .maybeSingle();
  const concesion = data
    ? (Array.isArray(data.concesion) ? data.concesion[0] : data.concesion)
    : null;
  // Tokens desconocidos o de otro cliente: se responde 200 igual (RFC 7009 §2.2).
  if (concesion && concesion.cliente_id === cliente.id) {
    await revocarConcesion(concesion.id);
  }
}

// ── Validación en el MCP ──────────────────────────────────────────────────────

export type IdentidadOAuth = {
  concesionId: string;
  usuarioId: string;
  cliente: string;
};

export async function validarTokenAcceso(token: string): Promise<IdentidadOAuth | null> {
  if (!token.startsWith(PREFIJOS.acceso)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("oauth_tokens")
    .select(
      "expira_at, revocado_at, concesion:oauth_concesiones!inner(id, usuario_id, revocado_at, ultimo_uso_at, cliente:oauth_clientes!inner(nombre))"
    )
    .eq("token_hash", hashSecreto(token))
    .eq("tipo", "acceso")
    .maybeSingle();
  if (!data || data.revocado_at || new Date(data.expira_at).getTime() < Date.now()) {
    return null;
  }

  const concesion = Array.isArray(data.concesion) ? data.concesion[0] : data.concesion;
  if (!concesion || concesion.revocado_at) return null;
  if (!(await esAdministrador(concesion.usuario_id))) return null;

  // Último uso con resolución de 5 minutos: evita una escritura por llamada.
  const ultimo = concesion.ultimo_uso_at ? new Date(concesion.ultimo_uso_at).getTime() : 0;
  if (Date.now() - ultimo > 5 * 60_000) {
    await admin
      .from("oauth_concesiones")
      .update({ ultimo_uso_at: new Date().toISOString() })
      .eq("id", concesion.id);
  }

  const cliente = Array.isArray(concesion.cliente) ? concesion.cliente[0] : concesion.cliente;
  return {
    concesionId: concesion.id,
    usuarioId: concesion.usuario_id,
    cliente: cliente?.nombre ?? "Agente",
  };
}
