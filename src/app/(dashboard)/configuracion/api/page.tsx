import Link from "next/link";
import { headers } from "next/headers";
import { BookOpen } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { rolesParaLlaves } from "@/lib/external/acceso";
import { urlMcp, urlPublicaDesdeHeaders } from "@/lib/oauth/config";
import { ApiKeysClient } from "./api-keys-client";
import { ConexionesMcp, type ConexionMcpRow } from "./conexiones-mcp";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const perms = await getCurrentPermissions();

  if (!perms.isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader titulo="API" />
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">
          Solo un administrador puede gestionar las API keys.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  // "*" a propósito: user_type no existe hasta la migración 20260930202307.
  const { data: keys } = await admin
    .from("api_keys")
    .select("*, creador:profiles!api_keys_created_by_fkey(full_name, email)")
    .order("created_at", { ascending: false });
  const { error: sinColumnaTipo } = await admin.from("api_keys").select("user_type").limit(1);

  // Roles activos del sistema de roles (los que se pueden asignar a una clave).
  const roles = await rolesParaLlaves(admin);
  const nombreRol = new Map(roles.map((r) => [r.key, r.nombre]));

  const rows = (keys ?? []).map((k) => {
    const creador = Array.isArray(k.creador) ? k.creador[0] : k.creador;
    return {
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      is_active: k.is_active,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      revoked_at: k.revoked_at,
      created_by_name: creador?.full_name ?? creador?.email ?? null,
      user_type: (k.user_type as string | null | undefined) ?? null,
    };
  });

  // Agentes conectados al MCP por OAuth. Si la tabla no existe todavía, la
  // migración del MCP no se ha aplicado: se muestra el aviso en vez de fallar.
  const { data: concesiones, error: errorConcesiones } = await admin
    .from("oauth_concesiones")
    .select(
      "id, usuario_id, creado_at, ultimo_uso_at, cliente:oauth_clientes!inner(nombre, redirect_uris), usuario:profiles!oauth_concesiones_usuario_id_fkey(full_name, email)"
    )
    .is("revocado_at", null)
    .order("creado_at", { ascending: false });

  // Roles de quien autorizó cada conexión (puede tener varios).
  const idsUsuario = [...new Set((concesiones ?? []).map((c) => c.usuario_id as string).filter(Boolean))];
  const { data: rolesUsuarios } = idsUsuario.length
    ? await admin.from("usuario_roles").select("user_id, rol").in("user_id", idsUsuario)
    : { data: [] as { user_id: string; rol: string }[] };
  const rolesDe = (id: string) =>
    (rolesUsuarios ?? []).filter((r) => r.user_id === id).map((r) => nombreRol.get(r.rol) ?? r.rol);

  const conexiones: ConexionMcpRow[] = (concesiones ?? []).map((c) => {
    const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
    const usuario = Array.isArray(c.usuario) ? c.usuario[0] : c.usuario;
    let destino: string | null = null;
    try {
      const uri = new URL(cliente?.redirect_uris?.[0] ?? "");
      destino = uri.protocol.startsWith("http") ? uri.host : uri.protocol;
    } catch {
      destino = null;
    }
    return {
      id: c.id,
      cliente: cliente?.nombre ?? "Agente",
      destino,
      autorizada_por: usuario?.full_name ?? usuario?.email ?? null,
      rol: rolesDe(c.usuario_id as string).join(", ") || null,
      creado_at: c.creado_at,
      ultimo_uso_at: c.ultimo_uso_at,
    };
  });

  const urlMcpPublica = urlMcp(urlPublicaDesdeHeaders(await headers()));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="API">
        <Link
          href="/docs/api"
          target="_blank"
          className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <BookOpen className="h-4 w-4 text-[#4F46E5]" />
          Ver documentación
        </Link>
      </PageHeader>

      <div className="px-6 py-8">
        <ApiKeysClient keys={rows} roles={roles} migracionPendiente={Boolean(sinColumnaTipo)} />
        <ConexionesMcp
          urlMcp={urlMcpPublica}
          conexiones={conexiones}
          migracionPendiente={Boolean(errorConcesiones)}
        />
      </div>
    </div>
  );
}
