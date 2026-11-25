"use server";

/**
 * Correo para la prueba psicosensotécnica desde la ficha del candidato
 * (24-nov-2026). Leer exige entrar a Candidatos; cambiar, `candidatos.editar`.
 */
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import { correoConfigurado } from "@/lib/correo/enviar";
import {
  correoDeProceso,
  deshacerInscritoPsico,
  enviarCorreoValidacion,
  escribirCorreoPsico,
  leerAjustesCorreo,
  marcarInscritoPsico,
  pedirCorreoPsico,
} from "@/lib/seleccion/correo-psico-servidor";
import { ESTADOS_PROCESO_CORREO, type EstadoCorreo } from "@/lib/seleccion/correo-psico";

type Resultado = { ok: boolean; error?: string; aviso?: string };
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

export interface VistaCorreoPsico {
  disponible: boolean;
  puedeEditar: boolean;
  /** Cerrado o contratado: ya no se le pide ni se le envía nada. */
  cerrado: boolean;
  /** ¿El proceso ya llegó a la fase 1 (o la pasó sin contratar)? */
  enEtapa: boolean;
  activo: boolean;
  smtp: boolean;
  correo: string | null;
  estado: EstadoCorreo | null;
  pedidoAt: string | null;
  enviadoAt: string | null;
  validadoAt: string | null;
  validadoPor: string | null;
  inscritoAt: string | null;
  inscritoPor: string | null;
  recordatorios: number;
  maxRecordatorios: number;
  escaladoAt: string | null;
  ultimoError: string | null;
}

export async function datosCorreoPsico(procesoId: string): Promise<VistaCorreoPsico | { error: string }> {
  try {
    const perms = await exigirLectura();
    const [p, a] = await Promise.all([correoDeProceso(procesoId), leerAjustesCorreo()]);
    const base = { puedeEditar: puedeEditarEn(perms, "candidatos"), activo: a.activo, smtp: correoConfigurado(), maxRecordatorios: a.recordatorios };
    if (!p) {
      return {
        ...base,
        disponible: false,
        cerrado: false,
        enEtapa: false,
        correo: null,
        estado: null,
        pedidoAt: null,
        enviadoAt: null,
        validadoAt: null,
        validadoPor: null,
        inscritoAt: null,
        inscritoPor: null,
        recordatorios: 0,
        escaladoAt: null,
        ultimoError: null,
      };
    }
    return {
      ...base,
      disponible: true,
      cerrado: p.estado === "cierre" || p.estado === "contratado",
      enEtapa: (ESTADOS_PROCESO_CORREO as readonly string[]).includes(p.estado),
      correo: p.correo,
      estado: p.correo_estado,
      pedidoAt: p.correo_pedido_at,
      enviadoAt: p.correo_enviado_at,
      validadoAt: p.correo_validado_at,
      validadoPor: p.correo_validado_por,
      inscritoAt: p.correo_inscrito_at,
      inscritoPor: p.correo_inscrito_por,
      recordatorios: p.correo_recordatorios ?? 0,
      escaladoAt: p.correo_escalado_at,
      ultimoError: p.correo_error,
    };
  } catch (e) {
    return { error: fallo(e).error! };
  }
}

export async function pedirCorreoFicha(procesoId: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await pedirCorreoPsico(procesoId, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function escribirCorreoFicha(procesoId: string, correo: string, confirmado: boolean): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await escribirCorreoPsico(procesoId, correo, confirmado, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function reenviarCorreoFicha(procesoId: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await enviarCorreoValidacion(procesoId, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function marcarInscritoFicha(procesoId: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await marcarInscritoPsico(procesoId, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function deshacerInscritoFicha(procesoId: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await deshacerInscritoPsico(procesoId, actorUsuario(perms));
    refrescar();
    return r;
  } catch (e) {
    return fallo(e);
  }
}
