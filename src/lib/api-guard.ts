/**
 * Guard para rutas /api/*. El proxy deja pasar todo /api sin revisar sesión
 * ni módulo (src/proxy.ts), así que cada ruta que lee datos con la llave de
 * servicio debe exigir permiso aquí. Devuelve la respuesta de rechazo, o null
 * si el usuario tiene al menos uno de los módulos.
 */
import { NextResponse } from "next/server";
import { getCurrentPermissions, canAccess, tienePermiso, type ModuleKey } from "@/lib/permissions";

export async function exigirModuloApi(modulos: ModuleKey[]): Promise<NextResponse | null> {
  const perms = await getCurrentPermissions();
  if (!perms.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!modulos.some((m) => canAccess(perms, m))) {
    return NextResponse.json({ error: "Sin permiso para este recurso" }, { status: 403 });
  }
  return null;
}

/** Igual, pero por permiso (`modulo.accion`): al menos uno de ellos. */
export async function exigirPermisoApi(...claves: string[]): Promise<NextResponse | null> {
  const perms = await getCurrentPermissions();
  if (!perms.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!claves.some((c) => tienePermiso(perms, c))) {
    return NextResponse.json({ error: "Sin permiso para esta acción" }, { status: 403 });
  }
  return null;
}
