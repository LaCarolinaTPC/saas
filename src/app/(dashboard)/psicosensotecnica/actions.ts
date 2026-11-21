"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPermissions, tienePermiso } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import { validarConfig } from "@/lib/psicosensotecnica/config";
import {
  anularIntentoPsico, asignarPruebaACedula, assertPsico, assertPsicoConfig, detalleIntento, generarCodigoDeEquipo, guardarConfigPsico,
  registrarConceptoDeIntento, revocarEquipoPsico,
} from "@/lib/psicosensotecnica/servidor";
import { RUTA_MODULO, type Concepto, type IntentoDetalle } from "@/lib/psicosensotecnica/tipos";

type Resultado<T = object> = ({ success: true } & T) | { success: false; error: string };
const fallo = (e: unknown) => ({ success: false as const, error: e instanceof Error ? e.message : "No se pudo completar la acción." });

function refrescar(candidateId?: string | null) {
  revalidatePath(RUTA_MODULO);
  if (candidateId) revalidatePath(`/candidatos/${candidateId}`);
}

/**
 * Asigna la prueba a una cédula. La usa la bandeja de la psicóloga y la ficha
 * del candidato, así que basta con poder editar candidatos o este módulo.
 */
export async function asignarPrueba(entrada: { cedula: string; nombre?: string; candidateId?: string }): Promise<Resultado<{ id: string }>> {
  try {
    const perms = await getCurrentPermissions();
    if (!perms.userId || !(tienePermiso(perms, "psicosensotecnica.editar") || tienePermiso(perms, "candidatos.editar"))) {
      return { success: false, error: "No tienes permiso para asignar la prueba." };
    }
    const r = await asignarPruebaACedula(
      { cedula: String(entrada?.cedula ?? ""), nombre: entrada?.nombre, candidateId: entrada?.candidateId ?? null },
      actorUsuario(perms)
    );
    if (r.success) refrescar(entrada?.candidateId);
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function obtenerDetalle(id: string): Promise<Resultado<{ detalle: IntentoDetalle }>> {
  try {
    await assertPsico();
    const detalle = await detalleIntento(String(id));
    return detalle ? { success: true, detalle } : { success: false, error: "Esa prueba ya no existe." };
  } catch (e) {
    return fallo(e);
  }
}

export async function darConcepto(id: string, concepto: Concepto, observacion: string): Promise<Resultado> {
  try {
    const perms = await assertPsico("concepto");
    if (concepto !== "apto" && concepto !== "no_apto") return { success: false, error: "Elija apto o no apto." };
    // Un «no apto» sin explicación no le sirve a quien después lee la ficha.
    if (concepto === "no_apto" && String(observacion ?? "").trim().length < 5) return { success: false, error: "Escriba la observación que sustenta el «no apto»." };
    const r = await registrarConceptoDeIntento(String(id), concepto, String(observacion ?? ""), actorUsuario(perms));
    if (r.success) revalidatePath("/", "layout");
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function anularIntento(id: string, motivo: string): Promise<Resultado> {
  try {
    const perms = await assertPsico("editar");
    const r = await anularIntentoPsico(String(id), String(motivo ?? ""), actorUsuario(perms));
    if (r.success) revalidatePath("/", "layout");
    return r;
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarConfig(entrada: unknown): Promise<Resultado> {
  try {
    const perms = await assertPsicoConfig();
    const v = validarConfig(entrada);
    if (!v.ok) return { success: false, error: v.error };
    await guardarConfigPsico(v.config, perms.userEmail);
    revalidatePath(`${RUTA_MODULO}/configuracion`);
    return { success: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Código para vincular un equipo nuevo (con `nombre`) o volver a vincular uno (con `id`). */
export async function codigoDeEquipo(entrada: { id?: string; nombre?: string }): Promise<Resultado<{ codigo: string }>> {
  try {
    const perms = await assertPsicoConfig();
    const nombre = String(entrada?.nombre ?? "").trim().slice(0, 60);
    if (!entrada?.id && nombre.length < 3) return { success: false, error: "Póngale un nombre al equipo (por ejemplo «Tableta de selección»)." };
    const codigo = await generarCodigoDeEquipo(entrada?.id ? { id: String(entrada.id) } : { nombre }, perms.userEmail);
    revalidatePath(`${RUTA_MODULO}/configuracion`);
    return { success: true, codigo };
  } catch (e) {
    return fallo(e);
  }
}

export async function revocarEquipo(id: string): Promise<Resultado> {
  try {
    await assertPsicoConfig();
    await revocarEquipoPsico(String(id));
    revalidatePath(`${RUTA_MODULO}/configuracion`);
    return { success: true };
  } catch (e) {
    return fallo(e);
  }
}
