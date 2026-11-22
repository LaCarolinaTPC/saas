"use server";

/**
 * Selección, entrega 3, desde la ficha del candidato: exámenes médicos, rutas,
 * carpeta, referencias, aprobación y contratación con las condiciones (H2).
 * Leer exige entrar a Candidatos; cambiar, `candidatos.editar`; el visto bueno
 * y la excepción, sus permisos especiales.
 */
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { actorUsuario, cambiarEstadoProceso } from "@/lib/contratacion/servidor";
import { rutasParaReconocimiento, registrarReconocimiento, type ResultadoRuta } from "@/lib/seleccion/profesor-servidor";
import { cerrarPorExamenes, examenesDeProceso, registrarExamen, type ExamenVista } from "@/lib/seleccion/examenes-servidor";
import {
  agregarReferencia, anularAdjuntoSeleccion, carpetaDeProceso, marcarItemCarpeta, validarReferencia, type CarpetaVista,
} from "@/lib/seleccion/carpeta-servidor";
import { aprobarContratacion, condicionesDeProceso, type CondicionesProceso } from "@/lib/seleccion/contratacion-servidor";
import { gastoDelMes, type GastoDelMes } from "@/lib/seleccion/consumos-servidor";
import { marcarTipoContacto, tipoDeContacto, type TipoContacto } from "@/lib/seleccion/laboratorio-servidor";
import { avisosPendientes, citasDeExamenes, confirmarAviso, descartarAviso, type CitaExamen } from "@/lib/seleccion/laboratorio-lectura";
import type { EstadoCarpeta } from "@/lib/seleccion/contratacion";
import type { FaseExamen, ResultadoExamen } from "@/lib/seleccion/examenes";

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

export interface DatosEntrega3 {
  /** null si falta la migración de la entrega 3. */
  examenes: ExamenVista[] | null;
  carpeta: CarpetaVista | null;
  condiciones: CondicionesProceso;
  puede: { editar: boolean; aprobar: boolean; excepcion: boolean };
}

/** Lo que muestra la ficha de la entrega 3. */
export async function datosEntrega3(procesoId: string): Promise<DatosEntrega3> {
  const perms = await exigirLectura();
  const [examenes, carpeta, condiciones] = await Promise.all([examenesDeProceso(procesoId), carpetaDeProceso(procesoId), condicionesDeProceso(procesoId)]);
  return {
    examenes,
    carpeta,
    condiciones,
    puede: {
      editar: puedeEditarEn(perms, "candidatos"),
      aprobar: tienePermiso(perms, "candidatos.aprobar_contratacion"),
      excepcion: tienePermiso(perms, "candidatos.contratar_con_excepcion"),
    },
  };
}

export async function registrarExamenFicha(procesoId: string, fase: FaseExamen, resultado: ResultadoExamen, observacion: string): Promise<Resultado & { proponeCierre?: boolean }> {
  try {
    const perms = await exigirEdicion();
    const r = await registrarExamen(procesoId, { fase: Number(fase) as FaseExamen, resultado, observacion }, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function cerrarPorExamenesFicha(procesoId: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await cerrarPorExamenes(procesoId, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

/** Rutas para el reconocimiento (las de GEMA). */
export async function rutasDisponibles(): Promise<string[]> {
  await exigirLectura();
  return rutasParaReconocimiento();
}

/** Una salida de reconocimiento de ruta registrada por Gestión Humana (la misma que registra el profesor). */
export async function registrarRutaFicha(procesoId: string, ruta: string, resultado: ResultadoRuta, observacion: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await registrarReconocimiento(procesoId, { ruta, resultado, observacion }, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function marcarItemCarpetaFicha(procesoId: string, item: string, estado: EstadoCarpeta, nota: string | null): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await marcarItemCarpeta(procesoId, item, estado, nota, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function anularAdjuntoFicha(adjuntoId: string, motivo: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await anularAdjuntoSeleccion(adjuntoId, motivo, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function agregarReferenciaFicha(
  procesoId: string,
  d: { tipo: "laboral" | "personal"; nombre: string; telefono?: string; empresa?: string; origen?: string }
): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await agregarReferencia(procesoId, d, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function validarReferenciaFicha(referenciaId: string, d: { habloCon: string; resultado: string }): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await validarReferencia(referenciaId, d, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

/** Visto bueno de la directora para contratar. */
export async function aprobarContratacionFicha(procesoId: string, aprobar: boolean): Promise<Resultado> {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "candidatos") || !tienePermiso(perms, "candidatos.aprobar_contratacion")) {
      return { ok: false, error: "No tienes permiso para dar el visto bueno de contratación." };
    }
    const r = await aprobarContratacion(procesoId, aprobar, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Pasa el proceso a «Contratado». Con las condiciones cumplidas basta poder
 * editar; con `justificacion`, contrata aunque falten (permiso especial).
 */
export async function contratarFicha(procesoId: string, justificacion?: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const j = String(justificacion ?? "").trim();
    if (j) {
      if (!tienePermiso(perms, "candidatos.contratar_con_excepcion")) return { ok: false, error: "No tienes permiso para contratar con excepción." };
      if (j.length < 15) return { ok: false, error: "Escriba la justificación de la excepción (al menos una frase)." };
    }
    await cambiarEstadoProceso(procesoId, "contratado", { actor: actorUsuario(perms), ...(j ? { excepcion: { justificacion: j.slice(0, 1000) } } : {}) });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Gasto del asistente en el mes frente al tope, para Selección. */
export async function gastoSeleccion(): Promise<GastoDelMes | null> {
  await exigirLectura();
  return gastoDelMes();
}

// ── Avisos del laboratorio y citas de exámenes (Candidatos › Agenda) ──────

export async function avisosLaboratorio(): Promise<Awaited<ReturnType<typeof avisosPendientes>>> {
  await exigirLectura();
  return avisosPendientes();
}

export async function confirmarAvisoLaboratorio(avisoId: string, procesoId: string, fase: 1 | 2, resultado: "apto" | "no_apto" | "aplazado"): Promise<Resultado & { texto?: string; envio?: string }> {
  try {
    const perms = await exigirEdicion();
    if (fase !== 1 && fase !== 2) return { ok: false, error: "Elija la fase." };
    if (resultado !== "apto" && resultado !== "no_apto" && resultado !== "aplazado") return { ok: false, error: "Elija el resultado." };
    if (!procesoId) return { ok: false, error: "Elija el aspirante." };
    const r = await confirmarAviso(String(avisoId), { procesoId: String(procesoId), fase, resultado }, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function descartarAvisoLaboratorio(avisoId: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await descartarAviso(String(avisoId), actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

/** Citas de exámenes de los próximos días (no salen en la agenda de la prueba de manejo). */
export async function citasExamenesProximas(desde: string, hasta: string): Promise<CitaExamen[]> {
  await exigirLectura();
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha.test(desde) || !fecha.test(hasta)) return [];
  return citasDeExamenes(desde, hasta);
}

// ── Contactos de laboratorio (bandeja de Comunicaciones) ──────────────────

export async function tipoContactoBandeja(telefono: string): Promise<TipoContacto> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "comunicaciones")) throw new Error("No tienes permiso para la bandeja.");
  return tipoDeContacto(String(telefono));
}

/** Marca o desmarca un número como laboratorio: el asistente, el seguimiento y la reactivación lo saltan. */
export async function marcarContactoBandeja(telefono: string, tipo: TipoContacto): Promise<Resultado> {
  try {
    const perms = await getCurrentPermissions();
    if (!canAccess(perms, "comunicaciones") || !puedeEditarEn(perms, "comunicaciones")) return { ok: false, error: "No tienes permiso para cambiar el contacto." };
    const r = await marcarTipoContacto(String(telefono), tipo);
    revalidatePath("/comunicaciones");
    return r;
  } catch (e) {
    return fallo(e);
  }
}
