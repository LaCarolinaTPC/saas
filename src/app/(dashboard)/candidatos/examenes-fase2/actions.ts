"use server";

import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, exigirPermiso } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import { registrarExamen } from "@/lib/seleccion/examenes-servidor";
import { pantallaFase2, type AspiranteFase2 } from "@/lib/seleccion/fase2-servidor";
import type { ResultadoExamen } from "@/lib/seleccion/examenes";

/** Los aspirantes en la fase 2 de exámenes (27-nov-2026). */
export async function datosFase2(incluirPrueba = false): Promise<{ aspirantes: AspiranteFase2[]; hoy: string }> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("No tiene acceso a Candidatos.");
  return pantallaFase2({ incluirPrueba });
}

/** El resultado de la fase 2, puesto a mano (apto, no apto, aplazado o desistió). */
export async function registrarFase2(procesoId: string, resultado: ResultadoExamen, observacion: string, causa: string): Promise<{ ok: boolean; error?: string; texto?: string }> {
  try {
    const actor = actorUsuario(await exigirPermiso("candidatos.editar"));
    const r = await registrarExamen(String(procesoId), { fase: 2, resultado, observacion, causa }, actor);
    revalidatePath("/candidatos");
    revalidatePath("/candidatos/examenes-fase2");
    return r.ok ? { ok: true, texto: r.texto } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar." };
  }
}
