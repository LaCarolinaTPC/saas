import { canAccess, getCurrentPermissions, type Permissions } from "@/lib/permissions";

/** Permisos del usuario si tiene el módulo `pantalla`; si no, lanza. */
export async function assertAccesoPantalla(): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (!perms.userId || (!perms.isAdmin && !canAccess(perms, "pantalla"))) {
    throw new Error("Sin acceso a la pantalla informativa.");
  }
  return perms;
}

export async function tieneAccesoPantalla(): Promise<Permissions | null> {
  const perms = await getCurrentPermissions();
  return perms.userId && (perms.isAdmin || canAccess(perms, "pantalla")) ? perms : null;
}
