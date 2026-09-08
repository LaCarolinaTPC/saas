import { createAdminClient } from "@/lib/supabase/admin";
import { estaBloqueado } from "@/lib/auth-estado";
import { getCurrentPermissions } from "@/lib/permissions";
import { UsuariosClient } from "./usuarios-client";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const perms = await getCurrentPermissions();

  if (!perms.isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader titulo="Usuarios" />
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">
          Solo un administrador puede gestionar usuarios y permisos.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();

  const [profilesRes, typesRes, depsRes, authRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, user_type, scope_departments").order("full_name"),
    // select("*"): submodulos puede no existir aún (migración 032).
    admin.from("user_types").select("*").order("nombre"),
    admin.from("departments").select("name").order("name"),
    // El estado activo/desactivado vive en Auth (banned_until), no en profiles.
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const bloqueados = new Set(
    (authRes.data?.users ?? [])
      .filter((u) => estaBloqueado(u.banned_until))
      .map((u) => u.id)
  );

  // Usuarios por rol: impide eliminar un rol que alguien todavía tiene.
  const userCounts: Record<string, number> = {};
  for (const u of profilesRes.data ?? []) {
    if (u.user_type) userCounts[u.user_type] = (userCounts[u.user_type] ?? 0) + 1;
  }

  return (
    <UsuariosClient
      users={(profilesRes.data ?? []).map((u) => ({ ...u, activo: !bloqueados.has(u.id) }))}
      currentUserId={perms.userId}
      types={typesRes.data ?? []}
      departments={(depsRes.data ?? []).map((d) => d.name)}
      userCounts={userCounts}
    />
  );
}
