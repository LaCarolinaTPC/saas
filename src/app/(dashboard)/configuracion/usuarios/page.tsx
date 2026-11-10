import { getCurrentPermissions } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { cargarDatosRoles } from "./datos-roles";
import { SistemaRolesClient } from "./sistema-roles-client";

export const dynamic = "force-dynamic";

/** Usuarios y roles (sistema de roles, src/lib/permisos). Solo el administrador. */
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

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Usuarios y roles" />
      <SistemaRolesClient datos={await cargarDatosRoles()} yo={perms.userId} />
    </div>
  );
}
