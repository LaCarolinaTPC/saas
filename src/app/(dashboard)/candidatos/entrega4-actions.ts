"use server";

/**
 * Selección, entrega 4, desde la ficha del candidato: día de contratación
 * (psicotécnica, entrevista, inducción) y documentos leídos con IA.
 * Leer exige entrar a Candidatos; cambiar, `candidatos.editar`.
 */
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import {
  citarPsicotecnica,
  diaContratacionDeProceso,
  marcarAsistenciaPsicotecnica,
  registrarEntrevista,
  registrarInduccion,
  registrarPsicotecnicaExterna,
  type DiaContratacion,
} from "@/lib/seleccion/dia-contratacion-servidor";
import { cambiarClaseLectura, lecturasDeProceso, revisarLectura, type DecisionEntrada, type DocumentoLeidoVista } from "@/lib/seleccion/lectura/revision-servidor";
import { CLASES, type ClaseDocumento } from "@/lib/seleccion/lectura/esquema";

type Resultado = { ok: boolean; error?: string };
const fallo = (e: unknown): Resultado => ({ ok: false, error: e instanceof Error ? e.message : "No se pudo completar." });

async function exigirLectura() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("No tienes permiso para ver los candidatos.");
  return perms;
}

async function exigirEdicion() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !puedeEditarEn(perms, "candidatos")) throw new Error("No tienes permiso para editar este proceso.");
  return perms;
}

const refrescar = () => revalidatePath("/candidatos");

// ── Día de contratación ──────────────────────────────────────────────────────

export async function datosDiaContratacion(procesoId: string): Promise<(DiaContratacion & { puedeEditar: boolean }) | { error: string }> {
  try {
    const perms = await exigirLectura();
    return { ...(await diaContratacionDeProceso(procesoId)), puedeEditar: puedeEditarEn(perms, "candidatos") };
  } catch (e) {
    return { error: fallo(e).error! };
  }
}

export async function registrarEntrevistaFicha(procesoId: string, cuando: string, nota: string, borrar = false): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await registrarEntrevista(procesoId, borrar ? null : { cuando, nota }, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function registrarInduccionFicha(procesoId: string, cuando: string, borrar = false): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await registrarInduccion(procesoId, cuando, actorUsuario(perms), borrar);
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function registrarPsicoExternaFicha(
  procesoId: string,
  datos: { resultado: string; fecha: string; puntaje: string; entidad: string } | null
): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await registrarPsicotecnicaExterna(procesoId, datos, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function citarPsicotecnicaFicha(procesoId: string, fecha: string, hora: string, lugar: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await citarPsicotecnica(procesoId, { fecha, hora, lugar }, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

// ── Documentos leídos ────────────────────────────────────────────────────────

export async function documentosLeidos(procesoId: string): Promise<{ docs: DocumentoLeidoVista[] | null; puedeEditar: boolean } | { error: string }> {
  try {
    const perms = await exigirLectura();
    return { docs: await lecturasDeProceso(procesoId), puedeEditar: puedeEditarEn(perms, "candidatos") };
  } catch (e) {
    return { error: fallo(e).error! };
  }
}

export async function revisarDocumentoLeido(procesoId: string, lecturaId: string, decisiones: DecisionEntrada[]): Promise<Resultado & { aplicados?: string[] }> {
  try {
    const perms = await exigirEdicion();
    const r = await revisarLectura(procesoId, lecturaId, Array.isArray(decisiones) ? decisiones.slice(0, 50) : [], actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarClaseDocumento(procesoId: string, lecturaId: string, clase: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    if (!(CLASES as readonly string[]).includes(clase)) return { ok: false, error: "Clase no válida." };
    const r = await cambiarClaseLectura(procesoId, lecturaId, clase as ClaseDocumento, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function marcarAsistenciaPsicoFicha(citaId: string, asistio: boolean): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await marcarAsistenciaPsicotecnica(citaId, asistio, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}
