import { createAdminClient } from "@/lib/supabase/admin";
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

  const [profilesRes, typesRes, depsRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, user_type, scope_departments").order("full_name"),
    admin.from("user_types").select("key, nombre, descripcion, alcance, modulos, puede_editar").order("nombre"),
    admin.from("departments").select("name").order("name"),
  ]);

  return (
    <UsuariosClient
      users={profilesRes.data ?? []}
      types={typesRes.data ?? []}
      departments={(depsRes.data ?? []).map((d) => d.name)}
    />
  );
}
