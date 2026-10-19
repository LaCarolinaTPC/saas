"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPermissions } from "@/lib/permissions";
import { eliminarClaveIA, guardarClaveIA, verificarClaveIA } from "./claves";
import { PROVEEDORES_IA, type ProveedorIA } from "./proveedores";

async function puedeAdministrar(): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) return { ok: false, error: "Solo el administrador puede gestionar las API keys de IA." };
  return { ok: true, userId: perms.userId ?? null };
}

function revalidar() {
  revalidatePath("/configuracion");
  revalidatePath("/comunicaciones/agente");
}

/** Verifica la key contra el proveedor y, si la acepta, la guarda cifrada. */
export async function guardarClave(
  proveedor: ProveedorIA,
  clave: string
): Promise<{ ok: boolean; error?: string }> {
  const permiso = await puedeAdministrar();
  if (!permiso.ok) return permiso;
  if (!PROVEEDORES_IA.some((p) => p.id === proveedor)) return { ok: false, error: "Proveedor no válido." };
  const limpia = clave.trim();
  if (limpia.length < 10) return { ok: false, error: "Ingresa una API key válida." };

  const rechazo = await verificarClaveIA(proveedor, limpia);
  if (rechazo) return { ok: false, error: `El proveedor rechazó la key: ${rechazo}` };

  try {
    await guardarClaveIA(proveedor, limpia, permiso.userId ?? undefined);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
  revalidar();
  return { ok: true };
}

export async function quitarClave(proveedor: ProveedorIA): Promise<{ ok: boolean; error?: string }> {
  const permiso = await puedeAdministrar();
  if (!permiso.ok) return permiso;
  if (!PROVEEDORES_IA.some((p) => p.id === proveedor)) return { ok: false, error: "Proveedor no válido." };
  try {
    await eliminarClaveIA(proveedor);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo quitar." };
  }
  revalidar();
  return { ok: true };
}
