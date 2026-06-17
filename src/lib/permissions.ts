import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_MODULES, type ModuleKey } from "@/lib/permissions-shared";

export { ALL_MODULES, MODULE_LABELS, hrefToModule } from "@/lib/permissions-shared";
export type { ModuleKey } from "@/lib/permissions-shared";

export interface Permissions {
  userId: string | null;
  userType: string | null;
  modules: ModuleKey[];
  alcance: "all" | "departamentos";
  puedeEditar: boolean;
  scopeDepartments: string[] | null;
  isAdmin: boolean;
}

const ALL: Permissions = {
  userId: null,
  userType: "admin",
  modules: [...ALL_MODULES],
  alcance: "all",
  puedeEditar: true,
  scopeDepartments: null,
  isAdmin: true,
};

/**
 * Permisos del usuario actual. Fail-open: si no hay tipo asignado o no se
 * encuentra, concede todo (para no dejar a nadie sin acceso); las
 * restricciones aplican solo cuando hay un tipo explícito.
 */
export async function getCurrentPermissions(): Promise<Permissions> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...ALL, userId: null };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_type, scope_departments")
    .eq("id", user.id)
    .maybeSingle();

  const userType = profile?.user_type ?? null;
  if (!userType) return { ...ALL, userId: user.id };

  const { data: type } = await admin
    .from("user_types")
    .select("modulos, alcance, puede_editar")
    .eq("key", userType)
    .maybeSingle();

  if (!type) return { ...ALL, userId: user.id, userType };

  const modules = (Array.isArray(type.modulos) ? type.modulos : []) as ModuleKey[];
  return {
    userId: user.id,
    userType,
    modules,
    alcance: (type.alcance as "all" | "departamentos") ?? "all",
    puedeEditar: !!type.puede_editar,
    scopeDepartments: profile?.scope_departments ?? null,
    isAdmin: userType === "admin",
  };
}

export function canAccess(perms: Permissions, module: ModuleKey): boolean {
  return perms.modules.includes(module);
}
