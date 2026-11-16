"use server";

import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { eliminarArchivo, firmarArchivos } from "@/lib/operativo/archivos";
import {
  activarVersion, archivoDeVersion, cambiarTolerancia, eliminarVersion, getGeometria, type GeometriaKml,
} from "@/lib/operativo/rutas-kml";
import { getFlotaEnRutas, type FlotaEnRutas } from "@/lib/operativo/rutas-gps";

type Resultado<T = undefined> = { success: true; data?: T } | { success: false; error: string };

/** Todas las acciones exigen el módulo en el servidor (no solo en la UI). */
async function assertOperativo(editar: boolean) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) throw new Error("No tienes acceso al módulo Operativo.");
  if (editar && !puedeEditarEn(perms, "operativo")) throw new Error("Tu tipo de usuario es de solo consulta.");
  return perms;
}

const idValido = (id: number) => {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Identificador no válido.");
  return id;
};

async function correr<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function activarVersionKml(id: number): Promise<Resultado> {
  return correr(async () => {
    await assertOperativo(true);
    await activarVersion(idValido(id));
    revalidatePath("/operativo/rutas");
    return undefined;
  });
}

export async function eliminarVersionKml(id: number): Promise<Resultado> {
  return correr(async () => {
    await assertOperativo(true);
    const { archivo_ruta } = await eliminarVersion(idValido(id));
    await eliminarArchivo(archivo_ruta);
    revalidatePath("/operativo/rutas");
    return undefined;
  });
}

export async function cambiarToleranciaKml(ruta: string, toleranciaM: number): Promise<Resultado> {
  return correr(async () => {
    await assertOperativo(true);
    const m = Math.trunc(Number(toleranciaM));
    if (!Number.isFinite(m) || m < 5 || m > 1000) throw new Error("La tolerancia debe estar entre 5 y 1000 metros.");
    if (!ruta?.trim()) throw new Error("Ruta no válida.");
    await cambiarTolerancia(ruta.trim(), m);
    revalidatePath("/operativo/rutas");
    return undefined;
  });
}

/** URL firmada (1 hora) para descargar el archivo original. */
export async function urlDescargaKml(id: number): Promise<Resultado<{ url: string; nombre: string }>> {
  return correr(async () => {
    await assertOperativo(false);
    const a = await archivoDeVersion(idValido(id));
    if (!a) throw new Error("La versión no existe.");
    const url = (await firmarArchivos([a.archivo_ruta])).get(a.archivo_ruta);
    if (!url) throw new Error("No se pudo firmar el archivo.");
    return { url, nombre: a.archivo_nombre };
  });
}

/** Foto en vivo: cada bus con su ruta actual y su estado frente al trazado. */
export async function flotaEnRutas(): Promise<Resultado<FlotaEnRutas>> {
  return correr(async () => {
    await assertOperativo(false);
    return getFlotaEnRutas();
  });
}

/** Trazado de una versión del historial, para verlo en el mapa. */
export async function geometriaVersionKml(id: number): Promise<Resultado<GeometriaKml>> {
  return correr(async () => {
    await assertOperativo(false);
    const g = await getGeometria(idValido(id));
    if (!g) throw new Error("La versión no existe.");
    return g;
  });
}
