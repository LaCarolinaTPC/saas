import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  modulosEfectivos,
  normalizarIndividuales,
  SIN_INDIVIDUALES,
  subAllowed,
  type ModuleKey,
  type PermisosIndividuales,
} from "@/lib/permissions-shared";

export { ALL_MODULES, MODULE_LABELS, hrefToModule } from "@/lib/permissions-shared";
export {
  modulosEfectivos,
  normalizarIndividuales,
  SUB_TO_MODULE,
} from "@/lib/permissions-shared";
export type { ModuleKey } from "@/lib/permissions-shared";
export type { PermisosIndividuales } from "@/lib/permissions-shared";

export interface Permissions {
  userId: string | null;
  userEmail: string | null;
  userType: string | null;
  modules: ModuleKey[];
  alcance: "all" | "departamentos";
  puedeEditar: boolean;
  scopeDepartments: string[] | null;
  isAdmin: boolean;
  /**
   * Sub-funciones permitidas por el ROL ({"tesoreria": ["caja"]}).
   * Si un módulo no aparece, el tipo tiene todas sus sub-funciones.
   */
  submodules: Record<string, string[]>;
  /** Módulos que da el rol, sin los ajustes: la pantalla de permisos los compara. */
  modulesDelRol: ModuleKey[];
  /**
   * Ajustes individuales de este usuario sobre su rol, ya normalizados.
   * {} = hereda todo del rol. Vacío siempre para el admin.
   */
  individuales: PermisosIndividuales;
}

/** Sin permisos: el default cuando falta identidad, perfil o tipo válido. */
const NONE: Permissions = {
  userId: null,
  userEmail: null,
  userType: null,
  modules: [],
  alcance: "all",
  puedeEditar: false,
  scopeDepartments: null,
  isAdmin: false,
  submodules: {},
  modulesDelRol: [],
  individuales: SIN_INDIVIDUALES,
};

/**
 * Permisos del usuario actual. Fail-closed (auditoría T-01): sin sesión,
 * sin perfil, sin tipo asignado o con tipo inexistente se deniega todo.
 * El rol admin solo se concede por la relación explícita profiles.user_type.
 *
 * Envuelta en cache() de React: son tres consultas (auth.getUser, profiles y
 * user_types) y la misma petición la pedía varias veces —el layout del
 * dashboard y luego cada página o action—, repitiéndolas enteras. El caché es
 * POR PETICIÓN, así que no hay riesgo de que un usuario vea los permisos de
 * otro; y el objeto se comparte entre llamadas, así que no se debe mutar.
 */
export const getCurrentPermissions = cache(async function getCurrentPermissions(): Promise<Permissions> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...NONE };

  const admin = createAdminClient();
  // select("*") a propósito, igual que en user_types: permisos_individuales
  // puede no existir aún (migración 20261014164506) y un select explícito
  // devolvería error, dejando profile en null y a TODO el mundo sin acceso.
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const userType = profile?.user_type ?? null;
  if (!userType) {
    console.warn(`[permissions] usuario ${user.id} sin perfil o sin tipo: acceso denegado`);
    return { ...NONE, userId: user.id, userEmail: user.email ?? null };
  }

  // select("*") a propósito: submodulos puede no existir aún (migración 032)
  // y un select explícito rompería toda la resolución de permisos.
  const { data: type } = await admin
    .from("user_types")
    .select("*")
    .eq("key", userType)
    .maybeSingle();

  if (!type) {
    console.warn(`[permissions] tipo "${userType}" no encontrado: acceso denegado`);
    return { ...NONE, userId: user.id, userEmail: user.email ?? null, userType };
  }

  const modulesDelRol = (Array.isArray(type.modulos) ? type.modulos : []) as ModuleKey[];
  const submodules =
    type.submodulos && typeof type.submodulos === "object" && !Array.isArray(type.submodulos)
      ? (type.submodulos as Record<string, string[]>)
      : {};

  // El administrador no admite ajustes individuales: siempre acceso total, para
  // que un descuido no deje al sistema sin nadie que lo administre. La Server
  // Action también lo rechaza; esto es la segunda barrera.
  const isAdmin = userType === "admin";
  const individuales = isAdmin
    ? SIN_INDIVIDUALES
    : normalizarIndividuales(profile?.permisos_individuales);

  return {
    userId: user.id,
    userEmail: user.email ?? null,
    userType,
    // Módulos EFECTIVOS: aquí es donde los permisos individuales entran en
    // vigor para todo el servidor (canAccess y los guards de cada pantalla).
    modules: modulosEfectivos(modulesDelRol, individuales),
    alcance: (type.alcance as "all" | "departamentos") ?? "all",
    puedeEditar: !!type.puede_editar,
    scopeDepartments: profile?.scope_departments ?? null,
    isAdmin,
    submodules,
    modulesDelRol,
    individuales,
  };
});

export function canAccess(perms: Permissions, module: ModuleKey): boolean {
  return perms.modules.includes(module);
}

/**
 * Acceso a una sub-función de un módulo. La regla (reservadas al admin,
 * ajustes individuales, sensibles, restricción por submodulos) vive en
 * subAllowed, compartida con el middleware y el menú para que los tres
 * apliquen exactamente lo mismo.
 *
 * Sigue exigiendo el módulo: conceder una sub-función individualmente no abre
 * el módulo, hay que conceder ambos (la pantalla de permisos lo hace junto).
 */
export function canAccessSub(
  perms: Permissions,
  module: ModuleKey,
  sub: string
): boolean {
  if (!canAccess(perms, module)) return false;
  return subAllowed(
    perms.submodules,
    module,
    sub,
    perms.isAdmin,
    perms.individuales.submodulos
  );
}
