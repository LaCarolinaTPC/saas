import { createAdminClient } from "@/lib/supabase/admin";
import { estaBloqueado } from "@/lib/auth-estado";
import { getCurrentPermissions } from "@/lib/permissions";
import { UsuariosClient } from "./usuarios-client";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const perms = await getCurrentPermissions();

  if (!perms.isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900">Usuarios</h1>
        </div>
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

  return (
    <UsuariosClient
      users={(profilesRes.data ?? []).map((u) => ({ ...u, activo: !bloqueados.has(u.id) }))}
      currentUserId={perms.userId}
      types={typesRes.data ?? []}
      departments={(depsRes.data ?? []).map((d) => d.name)}
    />
  );
}
