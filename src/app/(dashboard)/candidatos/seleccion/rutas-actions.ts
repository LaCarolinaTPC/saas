"use server";

/**
 * Rutas del reconocimiento de ruta (Selección › Tiempos y reglas, 21-nov-2026):
 * agregar, corregir, quitar, marcar obligatorias y traer las nuevas de GEMA.
 */
import { revalidatePath } from "next/cache";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import type { RutaReconocimiento } from "@/lib/seleccion/rutas";
import {
  agregarRutasDeGema,
  eliminarRutaReconocimiento,
  guardarRutaReconocimiento,
  leerRutasReconocimiento,
  rutasNuevasDeGema,
} from "@/lib/seleccion/rutas-servidor";

const RUTA = "/candidatos/seleccion";
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fallo = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function exigirConfig() {
  const perms = await getCurrentPermissions();
  if (!puedeEditarEn(perms, "candidatos.seleccion_config")) throw new Error("No tienes permiso para cambiar la configuración de la selección.");
  return perms;
}
async function exigirVer() {
  const perms = await getCurrentPermissions();
  if (!puedeEditarEn(perms, "candidatos.seleccion_config") && !tienePermiso(perms, "candidatos.seleccion_config.ver")) {
    throw new Error("No tienes acceso a la configuración de la selección.");
  }
}

export interface PantallaRutas {
  rutas: RutaReconocimiento[];
  /** false: falta la migración y se muestran las de GEMA, sin poder editarlas. */
  disponible: boolean;
  /** Rutas que GEMA usó en los últimos 45 días y no están en la lista. */
  nuevasDeGema: string[];
}

export async function pantallaRutas(): Promise<PantallaRutas> {
  await exigirVer();
  const [{ rutas, disponible }, nuevasDeGema] = await Promise.all([leerRutasReconocimiento(), rutasNuevasDeGema()]);
  return { rutas, disponible, nuevasDeGema: disponible ? nuevasDeGema : [] };
}

export async function guardarRuta(d: { id?: string | null; nombre: string; obligatoria: boolean }): Promise<Resultado> {
  try {
    const perms = await exigirConfig();
    const r = await guardarRutaReconocimiento(d, perms.userEmail ?? null);
    if (r.ok) revalidatePath(RUTA);
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function quitarRuta(id: string): Promise<Resultado> {
  try {
    await exigirConfig();
    const r = await eliminarRutaReconocimiento(id);
    if (r.ok) revalidatePath(RUTA);
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function traerRutasDeGema(): Promise<Resultado<{ agregadas: number }>> {
  try {
    const perms = await exigirConfig();
    const r = await agregarRutasDeGema(perms.userEmail ?? null);
    if (r.ok) revalidatePath(RUTA);
    return r;
  } catch (e) {
    return fallo(e);
  }
}
