import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_MODULES, type ModuleKey } from "@/lib/permissions-shared";
import { FUNCION_POR_VIEJA, claveFuncion } from "@/lib/permisos/catalogo";
import { puede, SIN_PERMISOS, tieneModulo, type PermisosEfectivos } from "@/lib/permisos/motor";
import { permisosDeUsuario } from "@/lib/permisos/fuente";
import { mantenerCatalogoAlDia } from "@/lib/permisos/bd";

export { ALL_MODULES, MODULE_LABELS, hrefToModule } from "@/lib/permissions-shared";
export type { ModuleKey } from "@/lib/permissions-shared";

export interface Permissions {
  userId: string | null;
  userEmail: string | null;
  /** Claves de sus roles activos (puede tener varios). */
  roles: string[];
  /**
   * Sus roles en un texto, para auditorías y etiquetas («tesoreria, rrhh»).
   * null sin roles.
   */
  rol: string | null;
  /** Permisos por acción (src/lib/permisos/motor.ts). */
  efectivos: PermisosEfectivos;
  /** Módulos a los que entra, en el orden del catálogo. */
  modules: ModuleKey[];
  /** Tiene un rol super (administrador): todos los permisos. */
  isAdmin: boolean;
}

/** Sin permisos: el default cuando falta identidad o perfil. */
const NONE: Permissions = {
  userId: null,
  userEmail: null,
  roles: [],
  rol: null,
  efectivos: SIN_PERMISOS,
  modules: [],
  isAdmin: false,
};

/**
 * Permisos del usuario actual, del sistema de roles (src/lib/permisos).
 * Fail-closed (auditoría T-01): sin sesión, sin perfil o si la base falla se
 * deniega todo.
 *
 * Envuelta en cache() de React: la misma petición la pedía varias veces —el
 * layout del dashboard y luego cada página o action—. El caché es POR
 * PETICIÓN, así que no hay riesgo de que un usuario vea los permisos de otro;
 * y el objeto se comparte entre llamadas, así que no se debe mutar.
 */
export const getCurrentPermissions = cache(async function getCurrentPermissions(): Promise<Permissions> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...NONE };

  // Tras un despliegue con permisos nuevos, la tabla `permisos` se pone al día sola.
  mantenerCatalogoAlDia();

  let fuente;
  try {
    fuente = await permisosDeUsuario(createAdminClient(), user.id);
  } catch (e) {
    console.warn(`[permissions] no se pudieron leer los permisos de ${user.id}:`, e instanceof Error ? e.message : e);
    return { ...NONE, userId: user.id, userEmail: user.email ?? null };
  }
  if (!fuente.perfil) {
    console.warn(`[permissions] usuario ${user.id} sin perfil: acceso denegado`);
    return { ...NONE, userId: user.id, userEmail: user.email ?? null };
  }

  const { efectivos, roles } = fuente;
  return {
    userId: user.id,
    userEmail: user.email ?? null,
    roles,
    rol: roles.length ? roles.join(", ") : null,
    efectivos,
    modules: ALL_MODULES.filter((m) => tieneModulo(efectivos, m)),
    isAdmin: efectivos.super,
  };
});

export const MENSAJE_SIN_PERMISO = "No tienes permiso para esta acción.";

const algunoDe = (perms: Permissions, claves: string[]) => claves.some((c) => puede(perms.efectivos, c));

/**
 * Para Server Actions que ya lanzan en caso de error: lanza si el usuario no
 * tiene NINGUNO de los permisos.
 */
export async function exigirPermiso(...claves: string[]): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (!algunoDe(perms, claves)) throw new Error(MENSAJE_SIN_PERMISO);
  return perms;
}

/** Para las que devuelven `{ success: false, error }`: el mensaje, o null si puede. */
export async function faltaPermiso(...claves: string[]): Promise<string | null> {
  const perms = await getCurrentPermissions();
  return algunoDe(perms, claves) ? null : MENSAJE_SIN_PERMISO;
}

/**
 * ¿Puede editar en alguno de estos ámbitos? Un ámbito es un módulo
 * (`"ausentismo"`) o una función (`"tesoreria.cartulina"`); se pregunta por
 * su `.editar`.
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
 * Acceso a una sub-función de un módulo, por su clave de pantalla (`caja`,
 * `incap_radicacion`…): la función del catálogo que le corresponde. Sigue
 * exigiendo el módulo.
 */
export function canAccessSub(
  perms: Permissions,
  module: ModuleKey,
  sub: string
): boolean {
  const f = FUNCION_POR_VIEJA.get(sub);
  if (!f || f.modulo !== module) return false;
  return tieneModulo(perms.efectivos, module) && puede(perms.efectivos, claveFuncion(module, f.funcion.clave, "ver"));
}

/**
 * Quién administra la política del Plan Padrino (editar el borrador,
 * publicar versiones y cargar el histórico de pagos): el administrador, o
 * quien tenga la sub-función `padrino_politica` con permiso de edición.
 */
export function puedeAdministrarPoliticaPadrino(perms: Permissions): boolean {
  return perms.isAdmin || (canAccessSub(perms, "candidatos", "padrino_politica") && tienePermiso(perms, "candidatos.padrino_politica.editar"));
}
