import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALL_MODULES,
  normalizarIndividuales,
  SIN_INDIVIDUALES,
  type ModuleKey,
  type PermisosIndividuales,
} from "@/lib/permissions-shared";
import { FUNCION_POR_VIEJA, claveFuncion } from "@/lib/permisos/catalogo";
import { puede, SIN_PERMISOS, tieneModulo, type PermisosEfectivos } from "@/lib/permisos/motor";
import { permisosDeUsuario, type PermisosDeUsuario } from "@/lib/permisos/fuente";

export { ALL_MODULES, MODULE_LABELS, hrefToModule } from "@/lib/permissions-shared";
export {
  modulosEfectivos,
  normalizarIndividuales,
  SUB_TO_MODULE,
} from "@/lib/permissions-shared";
export type { ModuleKey } from "@/lib/permissions-shared";
import { vigilarSombra } from "@/lib/permisos/sombra";
export type { PermisosIndividuales } from "@/lib/permissions-shared";

export interface Permissions {
  userId: string | null;
  userEmail: string | null;
  userType: string | null;
  /** Claves de sus roles (varios en el sistema nuevo). */
  roles: string[];
  /** Permisos por acción (src/lib/permisos/motor.ts). */
  efectivos: PermisosEfectivos;
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
  roles: [],
  efectivos: SIN_PERMISOS,
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

  // Una sola fuente para el proxy, el servidor y el menú (src/lib/permisos):
  // en modo viejo/sombra traduce el sistema anterior SIN cambiar a quién deja
  // pasar; en modo nuevo lee las tablas nuevas. Si la base falla, sin acceso.
  let fuente: PermisosDeUsuario;
  try {
    fuente = await permisosDeUsuario(createAdminClient(), user.id);
  } catch (e) {
    console.warn(`[permissions] no se pudieron leer los permisos de ${user.id}:`, e instanceof Error ? e.message : e);
    return { ...NONE, userId: user.id, userEmail: user.email ?? null };
  }
  const { perfil, rolViejo, efectivos } = fuente;
  const userType = (perfil?.user_type as string | null) ?? null;
  if (!perfil || (fuente.motor !== "nuevo" && !rolViejo)) {
    console.warn(`[permissions] usuario ${user.id} sin perfil o sin tipo válido: acceso denegado`);
    return { ...NONE, userId: user.id, userEmail: user.email ?? null, userType };
  }

  // Modo sombra del sistema nuevo (src/lib/permisos/sombra.ts): se compara
  // después de responder.
  vigilarSombra(user.id);

  const isAdmin = efectivos.super;
  const viejo = fuente.motor !== "nuevo" && rolViejo;
  const modulesDelRol = (viejo && Array.isArray(rolViejo.modulos) ? rolViejo.modulos : []) as ModuleKey[];
  const submodules =
    viejo && rolViejo.submodulos && typeof rolViejo.submodulos === "object" && !Array.isArray(rolViejo.submodulos)
      ? (rolViejo.submodulos as Record<string, string[]>)
      : {};

  return {
    userId: user.id,
    userEmail: user.email ?? null,
    userType,
    roles: fuente.roles,
    efectivos,
    // Módulos EFECTIVOS, en el orden del catálogo. El super los tiene todos
    // (antes el admin dependía de que su fila los listara).
    modules: ALL_MODULES.filter((m) => tieneModulo(efectivos, m)),
    alcance: "all",
    // Mientras mande el viejo, el «puede editar» global de su rol. En el nuevo,
    // editar es por módulo (`modulo.editar`); este booleano queda como «edita
    // algo» hasta que cada pantalla pregunte por su módulo.
    puedeEditar: viejo ? !!rolViejo.puede_editar || isAdmin : isAdmin || [...efectivos.permisos].some((p) => p.endsWith(".editar")),
    scopeDepartments: null,
    isAdmin,
    submodules,
    modulesDelRol,
    individuales: isAdmin || !viejo ? SIN_INDIVIDUALES : normalizarIndividuales(perfil.permisos_individuales),
  };
});

export const MENSAJE_SIN_PERMISO = "No tienes permiso para esta acción.";

/**
 * Para Server Actions que ya lanzan en caso de error: lanza si el usuario no
 * tiene NINGUNO de los permisos.
 */
export async function exigirPermiso(...claves: string[]): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (!claves.some((c) => tienePermiso(perms, c))) throw new Error(MENSAJE_SIN_PERMISO);
  return perms;
}

/** Para las que devuelven `{ success: false, error }`: el mensaje, o null si puede. */
export async function faltaPermiso(...claves: string[]): Promise<string | null> {
  const perms = await getCurrentPermissions();
  return claves.some((c) => tienePermiso(perms, c)) ? null : MENSAJE_SIN_PERMISO;
}

/**
 * ¿Puede editar en alguno de estos ámbitos? Un ámbito es un módulo
 * (`"ausentismo"`) o una función (`"tesoreria.cartulina"`); se pregunta por
 * su `.editar`. Reemplaza al `puedeEditar` global: mientras mande el sistema
 * viejo da exactamente lo mismo (tener el módulo y un rol que edita).
 */
export function puedeEditarEn(perms: Permissions, ...ambitos: string[]): boolean {
  return ambitos.some((a) => tienePermiso(perms, `${a}.editar`));
}

/** ¿Tiene este permiso (`modulo.accion` o `modulo.funcion.accion`)? */
export function tienePermiso(perms: Permissions, clave: string): boolean {
  return puede(perms.efectivos, clave);
}

export function canAccess(perms: Permissions, module: ModuleKey): boolean {
  return tieneModulo(perms.efectivos, module);
}

/**
 * Acceso a una sub-función de un módulo (clave vieja: `caja`,
 * `incap_radicacion`…). Pasa por el motor nuevo: la función del catálogo que le
 * corresponde. Sigue exigiendo el módulo.
 */
export function canAccessSub(
  perms: Permissions,
  module: ModuleKey,
  sub: string
): boolean {
  if (!canAccess(perms, module)) return false;
  const f = FUNCION_POR_VIEJA.get(sub);
  if (!f || f.modulo !== module) return false;
  return puede(perms.efectivos, claveFuncion(module, f.funcion.clave, "ver"));
}
