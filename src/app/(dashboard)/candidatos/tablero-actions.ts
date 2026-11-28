"use server";

/**
 * Pasos que la ficha ofrece al arrastrar una tarjeta hacia adelante en el
 * tablero (24-nov-2026). Hacen lo mismo que los botones de siempre (los del
 * profesor y los de exámenes), con el permiso de editar Candidatos: el proceso
 * avanza con sus citas y sus mensajes, no solo cambia de columna.
 */
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { actorUsuario, cambiarEstadoProceso } from "@/lib/contratacion/servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProcesoContratacion } from "@/lib/contratacion/constants";
import { citaVigenteDeProceso, marcarLlegada } from "@/lib/seleccion/agenda-servidor";
import { enviarAExamenes, planExamenes, registrarClase, registrarPrueba, type PlanExamenes } from "@/lib/seleccion/profesor-servidor";
import { examenesDeProceso, registrarExamen } from "@/lib/seleccion/examenes-servidor";


type Resultado = { ok: boolean; error?: string; envio?: string };
const fallo = (e: unknown): Resultado => ({ ok: false, error: e instanceof Error ? e.message : "No se pudo completar." });

async function exigirEdicion() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !puedeEditarEn(perms, "candidatos")) throw new Error("No tienes permiso para editar este proceso.");
  return perms;
}
const refrescar = () => revalidatePath("/candidatos");

export interface EstadoParaPaso {
  estado: string;
  /** Cita de prueba de manejo en pie. */
  citaPrueba: { fecha: string; hora: string } | null;
  /** Dónde y cuándo quedaría la fase 1 si pasa ahora a exámenes. */
  planFase1: PlanExamenes | null;
  /** Examen no apto sin decidir (se decide con «Sigue / No sigue»). */
  noApto: 1 | 2 | null;
  fase1Apta: boolean;
}

/** El estado actual (la ficha puede llevar rato abierta) y lo que necesita cada paso. */
export async function estadoParaPaso(procesoId: string): Promise<EstadoParaPaso | { error: string }> {
  try {
    await exigirEdicion();
    const { data: p } = await createAdminClient().from("procesos_contratacion").select("estado").eq("id", procesoId).maybeSingle();
    if (!p) return { error: "El proceso no existe." };
    const estado = p.estado as string;
    const [cita, examenes, plan] = await Promise.all([
      citaVigenteDeProceso(procesoId).catch(() => null),
      examenesDeProceso(procesoId).catch(() => null),
      ["citado", "prueba_manejo", "en_escuela"].includes(estado) ? planExamenes(procesoId).catch(() => null) : Promise.resolve(null),
    ]);
    const noApto = examenes?.find((e) => e.resultado === "no_apto");
    return {
      estado,
      citaPrueba: cita && cita.tipo === "prueba_manejo" ? { fecha: cita.fecha, hora: cita.hora } : null,
      planFase1: plan,
      noApto: noApto ? (noApto.fase as 1 | 2) : null,
      fase1Apta: examenes?.find((e) => e.fase === 1)?.resultado === "apto",
    };
  } catch (e) {
    return { error: fallo(e).error! };
  }
}

/** Preselección → Antecedentes, revisado por una persona. */
export async function pasarAAntecedentes(procesoId: string, nota: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const n = String(nota ?? "").trim().slice(0, 500);
    if (n.length < 5) return { ok: false, error: "Escriba por qué pasa a antecedentes sin la preselección automática." };
    await cambiarEstadoProceso(procesoId, "antecedentes", { actor: actorUsuario(perms), detalle: { motivo: `Movido en el tablero: ${n}` } });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Llegó a la prueba de manejo (la cita queda «asistió»). */
export async function llegoALaPrueba(procesoId: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const cita = await citaVigenteDeProceso(procesoId);
    if (!cita || cita.tipo !== "prueba_manejo") return { ok: false, error: "No tiene una cita de prueba de manejo en pie: primero cítelo." };
    const r = await marcarLlegada(cita.id, actorUsuario(perms));
    refrescar();
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    return fallo(e);
  }
}

/** Prueba de manejo: va a escuela. */
export async function pasarAEscuela(procesoId: string, observacion: string, clases: number | null): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await registrarPrueba(procesoId, { resultado: "escuela", clasesSugeridas: clases, observacion }, actorUsuario(perms));
    refrescar();
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Aprobó la prueba de manejo (o terminó la escuela) y «Listo para exámenes»:
 * cita la fase 1 en el laboratorio, le envía el mensaje y la orden.
 */
export async function pasarAExamenesDesdeFicha(procesoId: string, observacion: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const actor = actorUsuario(perms);
    // Si ya quedó guardado (el profesor aprobó y falta «Listo para exámenes»), solo se envía.
    let r = await enviarAExamenes(procesoId, actor);
    if (!r.ok) {
      const { data: p } = await createAdminClient().from("procesos_contratacion").select("estado").eq("id", procesoId).maybeSingle();
      const obs = String(observacion ?? "").trim() || "Desde la ficha (tablero).";
      const g = p?.estado === "en_escuela"
        ? await registrarClase(procesoId, { resultado: "listo", observacion: obs }, actor)
        : await registrarPrueba(procesoId, { resultado: "aprobo", observacion: obs }, actor);
      if (!g.ok) return { ok: false, error: g.error };
      r = await enviarAExamenes(procesoId, actor);
    }
    refrescar();
    return r.ok ? { ok: true, envio: r.envio } : { ok: false, error: r.error };
  } catch (e) {
    return fallo(e);
  }
}

/** Fase 1 apta (cita la fase 2 y le avisa) o fase 2 apta (pasa a reconocimiento). */
export async function faseAptaDesdeFicha(procesoId: string, fase: 1 | 2, observacion: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await registrarExamen(procesoId, { fase: fase === 2 ? 2 : 1, resultado: "apto", observacion }, actorUsuario(perms));
    refrescar();
    return r.ok ? { ok: true, envio: r.envio } : { ok: false, error: r.error };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * «Revisar ahora» al soltar la tarjeta en «Listo para contratar» (25-nov-2026):
 * pone la etapa de acuerdo con las condiciones. Si le falta algo, lo dice.
 */
export async function revisarListoDesdeFicha(procesoId: string): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const { sincronizarListoContratar } = await import("@/lib/seleccion/listo-contratar-servidor");
    const r = await sincronizarListoContratar(String(procesoId), actorUsuario(perms));
    refrescar();
    if (r.estado === "listo_contratar") return { ok: true };
    const { condicionesDeProceso } = await import("@/lib/seleccion/contratacion-servidor");
    const { listoParaContratar } = await import("@/lib/seleccion/contratacion");
    const c = await condicionesDeProceso(String(procesoId));
    if (!c.exigir) return { ok: false, error: "Las condiciones para contratar están apagadas (Selección › Tiempos y reglas): nadie pasa solo a «Listo para contratar»." };
    const { faltan } = listoParaContratar(c.condiciones);
    return { ok: false, error: faltan.length ? `Todavía no está listo. Falta: ${faltan.join("; ")}.` : "Todavía no está en las últimas etapas (fase 2 de exámenes o reconocimiento de ruta)." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo revisar." };
  }
}

/** Las tarjetas del tablero de un mes (AAAA-MM) o «todos» (27-nov-2026). */
export async function tableroDelMes(mes: string): Promise<ProcesoContratacion[]> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("Sin permisos para ver candidatos.");
  const { leerTablero } = await import("@/lib/contratacion/tablero-servidor");
  return (await leerTablero(mes)) as unknown as ProcesoContratacion[];
}
