"use server";

/**
 * Psicosensotécnica en PsicoAlianza (24-nov-2026): plantilla de carga masiva,
 * inscritos y resultados. Ver exige entrar a Candidatos; cambiar, editar.
 */
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import type { EstadoPrueba } from "@/lib/seleccion/psico-resultados";
import {
  guardarResultados,
  listasPsico,
  marcarInscritos,
  plantillaPsicoAlianza,
  reprogramarPsico,
  vistaResultados,
  type ArchivoSubido,
  type FilaVista,
  type ListasPsico,
  type ResultadoAConfirmar,
} from "@/lib/seleccion/psico-servidor";

const RUTA = "/candidatos/psicosensotecnica";
const fallo = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "No se pudo completar." });

async function exigirLectura() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("No tienes permiso para ver los candidatos.");
  return perms;
}
async function exigirEdicion() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !puedeEditarEn(perms, "candidatos")) throw new Error("No tienes permiso para editar los candidatos.");
  return perms;
}

export async function datosPsico(): Promise<ListasPsico & { puedeEditar: boolean }> {
  const perms = await exigirLectura();
  return { ...(await listasPsico()), puedeEditar: puedeEditarEn(perms, "candidatos") };
}

export async function descargarPlantilla(procesoIds: string[]): Promise<{ ok: boolean; error?: string; base64?: string; nombre?: string; filas?: number }> {
  try {
    await exigirEdicion();
    const r = await plantillaPsicoAlianza((procesoIds ?? []).map(String));
    if (!r.ok) return r;
    const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
    return { ok: true, base64: r.archivo.toString("base64"), nombre: `PsicoAlianza_Carga_Masiva_Candidatos_${hoy}.xlsx`, filas: r.filas };
  } catch (e) {
    return fallo(e);
  }
}

export async function marcarInscritosAccion(procesoIds: string[]): Promise<{ ok: boolean; error?: string; marcados?: number; errores?: { procesoId: string; error: string }[] }> {
  try {
    const perms = await exigirEdicion();
    const r = await marcarInscritos((procesoIds ?? []).map(String), actorUsuario(perms));
    revalidatePath(RUTA);
    return { ok: true, ...r };
  } catch (e) {
    return fallo(e);
  }
}

/** No la presentó o no la terminó: vuelve a «Por inscribir» (24-nov-2026). */
export async function reprogramarAccion(procesoIds: string[], razon: EstadoPrueba): Promise<{ ok: boolean; error?: string; hechos?: number; errores?: string[] }> {
  try {
    const perms = await exigirEdicion();
    let hechos = 0;
    const errores: string[] = [];
    for (const id of (procesoIds ?? []).map(String).slice(0, 500)) {
      const r = await reprogramarPsico(id, razon, actorUsuario(perms));
      if (r.ok) hechos++;
      else errores.push(r.error ?? "No se pudo.");
    }
    revalidatePath(RUTA);
    return { ok: true, hechos, errores };
  } catch (e) {
    return fallo(e);
  }
}

const MAX_ARCHIVOS = 40;
async function archivosDe(fd: FormData): Promise<ArchivoSubido[]> {
  const out: ArchivoSubido[] = [];
  for (const f of fd.getAll("archivos").slice(0, MAX_ARCHIVOS)) {
    if (!(f instanceof File) || !f.size) continue;
    out.push({ nombre: f.name.slice(0, 200), mime: f.type, buffer: Buffer.from(await f.arrayBuffer()) });
  }
  return out;
}

export async function leerResultadosAccion(fd: FormData): Promise<{ ok: boolean; error?: string; filas?: FilaVista[]; errores?: string[] }> {
  try {
    await exigirEdicion();
    const archivos = await archivosDe(fd);
    if (!archivos.length) return { ok: false, error: "Elija el Excel de resultados o los informes en PDF." };
    return { ok: true, ...(await vistaResultados(archivos)) };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarResultadosAccion(
  fd: FormData
): Promise<{ ok: boolean; error?: string; guardados?: number; reprogramados?: number; errores?: { clave: string; error: string }[] }> {
  try {
    const perms = await exigirEdicion();
    const archivos = await archivosDe(fd);
    const filas = JSON.parse(String(fd.get("filas") ?? "[]")) as ResultadoAConfirmar[];
    const validas = filas
      .filter((f) => f && f.procesoId && ["apto", "apto_con_observaciones", "no_apto"].includes(f.resultado))
      .map((f) => ({ ...f, archivos: Array.isArray(f.archivos) ? f.archivos.map(Number).filter(Number.isInteger) : [], detalle: f.detalle ? String(f.detalle).slice(0, 300) : null }));
    // Los que no la presentaron o no la terminaron: se vuelven a inscribir.
    const reprogramar = (JSON.parse(String(fd.get("reprogramar") ?? "[]")) as { procesoId: string; razon: EstadoPrueba }[]).filter(
      (x) => x && x.procesoId && (x.razon === "no_presento" || x.razon === "incompleta")
    );
    if (!validas.length && !reprogramar.length) return { ok: false, error: "No hay nada para guardar." };
    const actor = actorUsuario(perms);
    const r = validas.length ? await guardarResultados(validas, archivos, actor) : { guardados: 0, errores: [] as { clave: string; error: string }[] };
    let reprogramados = 0;
    for (const x of reprogramar.slice(0, 500)) {
      const y = await reprogramarPsico(String(x.procesoId), x.razon, actor);
      if (y.ok) reprogramados++;
      else r.errores.push({ clave: x.procesoId, error: y.error ?? "No se pudo volver a inscribir." });
    }
    revalidatePath(RUTA);
    revalidatePath("/candidatos");
    return { ok: true, ...r, reprogramados };
  } catch (e) {
    return fallo(e);
  }
}
