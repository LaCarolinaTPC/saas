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

  const [profilesRes, typesRes, depsRes, cargoMapRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, user_type, scope_departments").order("full_name"),
    admin.from("user_types").select("key, nombre, descripcion, alcance, modulos, puede_editar").order("nombre"),
    admin.from("departments").select("name").order("name"),
    admin.from("cargo_user_type").select("cargo, user_type"),
  ]);

  // Cargos distintos (empleados + conductores)
  const cargos = new Set<string>();
  const { data: emps } = await admin.from("employees").select("position").not("position", "is", null);
  for (const e of emps ?? []) if (e.position) cargos.add(String(e.position).trim());
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("conductores").select("tipo_conductor").range(from, from + 999);
    const rows = data ?? [];
    for (const c of rows) if (c.tipo_conductor) cargos.add(String(c.tipo_conductor).trim());
    if (rows.length < 1000) break;
  }

  return (
    <UsuariosClient
      users={profilesRes.data ?? []}
      types={typesRes.data ?? []}
      departments={(depsRes.data ?? []).map((d) => d.name)}
      cargos={[...cargos].sort()}
      cargoMap={cargoMapRes.data ?? []}
    />
  );
}
