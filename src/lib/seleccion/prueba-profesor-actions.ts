"use server";

/**
 * Agenda y profesor en el chat de prueba (Candidatos › Selección): las mismas
 * funciones del flujo real, pero SOLO sobre candidatos guardados desde el chat
 * de prueba (origen «chat_prueba»). Con ellos no sale nada por WhatsApp: el
 * texto de cada mensaje se devuelve para mostrarlo en el chat de prueba.
 * Quien puede usar el chat de prueba puede probar al profesor sin tener su rol.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { ACTOR_SISTEMA, actorUsuario, cambiarEstadoProceso } from "@/lib/contratacion/servidor";
import { accionAgenda, citaVigente, fechaEnTexto, horaEnTexto, interpretarRespuestaCita, type AjustesAgenda, type Cita, type ExcepcionProfesor } from "./agenda";
import {
  citaPropuesta,
  citarProceso,
  citasDeProceso,
  confirmarCita,
  deshacerNoAsistio,
  guardarDisponibilidad,
  leerAjustesAgenda,
  leerDisponibilidad,
  marcarLlegada,
  marcarNoAsistio,
  pedirOtraFecha,
  quitarDisponibilidad,
  reprogramarCita,
  reprogramarCitasDelDia,
  vistaCitacion,
  type ResultadoAgenda,
  type ResultadoDisponibilidad,
  type ResultadoReprogramarDia,
  type VistaCitacion,
  claveReprogramacion,
} from "./agenda-servidor";
import {
  historialProfesor,
  pendientesDelProfesor,
  registrarClase,
  registrarConcepto,
  registrarObservacion,
  registrarPrueba,
  registrarReconocimiento,
  rutasParaReconocimiento,
  type HistorialProfesor,
  type PendientesProfesor,
  type ResultadoProfesor,
} from "./profesor-servidor";
import type { DatosClase, DatosConcepto, DatosDisponibilidad, DatosPrueba, DatosRuta } from "@/components/seleccion/profesor-tipos";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const mal = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "No se pudo completar." });

async function exigirPrueba(editar = true) {
  const perms = await getCurrentPermissions();
  const edita = perms.isAdmin || puedeEditarEn(perms, "candidatos.seleccion_config");
  if (!(edita || (!editar && tienePermiso(perms, "candidatos.seleccion_config.ver")))) {
    throw new Error(editar ? "Para probar la agenda y al profesor necesitas poder editar la configuración de Selección." : "No tienes permiso para usar el chat de prueba de la selección.");
  }
  return actorUsuario(perms);
}

/** Solo candidatos del chat de prueba: nunca un proceso real. */
async function exigirProcesoDePrueba(procesoId: string) {
  const { data } = await createAdminClient().from("procesos_contratacion").select("origen").eq("id", procesoId).maybeSingle();
  if (data?.origen !== "chat_prueba") throw new Error("Aquí solo se prueban candidatos guardados desde el chat de prueba.");
}

async function exigirCitaDePrueba(citaId: string): Promise<Cita> {
  const { data } = await createAdminClient().from("seleccion_citas").select("*").eq("id", citaId).maybeSingle();
  if (!data) throw new Error("La cita no existe.");
  await exigirProcesoDePrueba((data as Cita).proceso_id);
  return data as Cita;
}

export interface DatosParaCitarPrueba {
  propuesta: { fecha: string; hora: string };
  vista: VistaCitacion | null;
  vigente: Cita | null;
  excepciones: ExcepcionProfesor[];
  ajustes: AjustesAgenda;
}

export async function datosParaCitarPrueba(procesoId: string, ahora?: string | null): Promise<DatosParaCitarPrueba> {
  await exigirPrueba(false);
  await exigirProcesoDePrueba(procesoId);
  const instante = ahora && !Number.isNaN(new Date(ahora).getTime()) ? new Date(ahora) : new Date();
  const vigente = (await citasDeProceso(procesoId)).find((c) => c.tipo === "prueba_manejo" && citaVigente(c)) ?? null;
  const propuesta = await citaPropuesta(instante, Boolean(vigente));
  const [vista, excepciones, ajustes] = await Promise.all([
    vistaCitacion(procesoId, propuesta, vigente ? "cita_reprogramada" : "citacion"),
    leerDisponibilidad(new Date().toISOString().slice(0, 10), "2999-12-31"),
    leerAjustesAgenda(),
  ]);
  return { propuesta, vista, vigente, excepciones, ajustes };
}

export async function vistaCitacionPrueba(
  procesoId: string,
  cuando: { fecha: string; hora: string },
  reprogramar: boolean,
  por: "aspirante" | "empresa" = "aspirante"
): Promise<VistaCitacion | null> {
  await exigirPrueba(false);
  await exigirProcesoDePrueba(procesoId);
  return vistaCitacion(procesoId, cuando, reprogramar ? claveReprogramacion(por) : "citacion");
}

export async function citarPrueba(procesoId: string, cuando: { fecha: string; hora: string }): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await citarProceso(procesoId, cuando, actor);
  } catch (e) {
    return mal(e);
  }
}

export async function reprogramarPrueba(citaId: string, cuando: { fecha: string; hora: string }, por: "aspirante" | "empresa"): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirPrueba();
    await exigirCitaDePrueba(citaId);
    return await reprogramarCita(citaId, cuando, por === "empresa" ? "empresa" : "aspirante", actor);
  } catch (e) {
    return mal(e);
  }
}

export interface CandidatoDePrueba {
  id: string;
  nombre: string;
  cedula: string;
  estado: string;
}

/** Candidatos del chat de prueba que siguen abiertos, del más reciente al más viejo: para citarlos sin repetir la conversación. */
export async function candidatosDePrueba(): Promise<CandidatoDePrueba[]> {
  await exigirPrueba(false);
  const { data } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id, nombre, cedula, estado")
    .eq("origen", "chat_prueba")
    .not("estado", "in", "(cierre,contratado)")
    .order("updated_at", { ascending: false })
    .limit(15);
  return (data ?? []) as CandidatoDePrueba[];
}

export async function citasPrueba(procesoId: string): Promise<{ citas: Cita[]; reprogramacionesMax: number }> {
  await exigirPrueba(false);
  await exigirProcesoDePrueba(procesoId);
  const [citas, a] = await Promise.all([citasDeProceso(procesoId), leerAjustesAgenda()]);
  return { citas, reprogramacionesMax: a.reprogramacionesMax };
}

/**
 * Lo que haría el webhook con la respuesta del aspirante a la cita («Sí, voy»,
 * «Necesito otra fecha»): confirma o marca que pide otra fecha.
 */
export async function respuestaCitaPrueba(procesoId: string, texto: string): Promise<{ nota: string | null }> {
  const actor = await exigirPrueba();
  await exigirProcesoDePrueba(procesoId);
  const cita = (await citasDeProceso(procesoId)).find((c) => c.tipo === "prueba_manejo" && citaVigente(c));
  if (!cita) return { nota: null };
  const r = interpretarRespuestaCita(String(texto ?? "").slice(0, 500));
  if (r === "confirma" && cita.estado !== "confirmada") {
    await confirmarCita(cita.id, actor);
    return { nota: "Gestivo: la cita quedó confirmada." };
  }
  if (r === "pide_otra_fecha" && cita.estado !== "pide_otra_fecha") {
    await pedirOtraFecha(cita.id, actor);
    return { nota: "Gestivo: quedó «Pide otra fecha». El asistente le pregunta qué día puede y mueve la cita." };
  }
  if (r === "no_interesa") return { nota: "Gestivo: dijo que ya no le interesa; el chat pasaría a una persona para cerrar por desistimiento." };
  return { nota: null };
}

/** Qué haría el cron con la cita a esa hora (recordatorio, alerta, no asistió). No envía ni cambia nada. */
export async function agendaSimuladaPrueba(procesoId: string, ahora: string | null): Promise<{ texto: string }> {
  await exigirPrueba(false);
  await exigirProcesoDePrueba(procesoId);
  const instante = ahora && !Number.isNaN(new Date(ahora).getTime()) ? new Date(ahora) : new Date();
  const [citas, a] = await Promise.all([citasDeProceso(procesoId), leerAjustesAgenda()]);
  const cita = citas.find((c) => c.tipo === "prueba_manejo" && citaVigente(c));
  if (!cita) return { texto: "No tiene una cita en pie: el cron no haría nada." };
  const cuando = `${fechaEnTexto(cita.fecha)} a las ${horaEnTexto(cita.hora)}`;
  const accion = accionAgenda(cita, instante, a);
  const que =
    accion === "recordatorio"
      ? "enviaría el recordatorio de la cita («recordatorio_cita»)."
      : accion === "alerta_no_confirmo"
        ? "como no ha confirmado, marcaría el chat para una persona y «Llamar» en la agenda."
        : accion === "inasistencia"
          ? `pasada la tolerancia (${a.toleranciaInasistenciaMinutos} min) sin llegada, marcaría «No asistió» y dejaría el aviso de inasistencia como borrador.`
          : "no haría nada todavía.";
  return { texto: `Cita: ${cuando}. A esa hora el cron ${que}` };
}

// ── Vista del profesor con candidatos de prueba ────────────────────────────

export async function pendientesProfesorPrueba(fecha: string): Promise<PendientesProfesor> {
  await exigirPrueba(false);
  if (!FECHA_RE.test(fecha)) throw new Error("Fecha no válida.");
  return pendientesDelProfesor(fecha, { soloPrueba: true });
}

export async function historialProfesorPrueba(procesoId: string): Promise<HistorialProfesor> {
  await exigirPrueba(false);
  await exigirProcesoDePrueba(procesoId);
  return historialProfesor(procesoId);
}

export async function rutasProfesorPrueba(): Promise<string[]> {
  await exigirPrueba(false);
  return rutasParaReconocimiento();
}

export async function citaProfesorPrueba(citaId: string, accion: "llego" | "no_asistio" | "deshacer"): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirPrueba();
    await exigirCitaDePrueba(citaId);
    return accion === "llego" ? await marcarLlegada(citaId, actor) : accion === "no_asistio" ? await marcarNoAsistio(citaId, actor) : await deshacerNoAsistio(citaId, actor);
  } catch (e) {
    return mal(e);
  }
}

export async function pruebaProfesorPrueba(procesoId: string, d: DatosPrueba): Promise<ResultadoProfesor> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await registrarPrueba(procesoId, d, actor);
  } catch (e) {
    return mal(e);
  }
}

export async function claseProfesorPrueba(procesoId: string, d: DatosClase): Promise<ResultadoProfesor> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await registrarClase(procesoId, d, actor);
  } catch (e) {
    return mal(e);
  }
}

export async function rutaProfesorPrueba(procesoId: string, d: DatosRuta): Promise<ResultadoProfesor> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await registrarReconocimiento(procesoId, d, actor);
  } catch (e) {
    return mal(e);
  }
}

export async function observacionProfesorPrueba(procesoId: string, texto: string): Promise<ResultadoProfesor> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await registrarObservacion(procesoId, texto, actor);
  } catch (e) {
    return mal(e);
  }
}

export async function conceptoProfesorPrueba(procesoId: string, d: DatosConcepto): Promise<ResultadoProfesor> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await registrarConcepto(procesoId, d, actor);
  } catch (e) {
    return mal(e);
  }
}

export async function disponibilidadPrueba(desde: string, hasta: string): Promise<ExcepcionProfesor[]> {
  await exigirPrueba(false);
  return leerDisponibilidad(desde, hasta);
}

/**
 * OJO: los días del profesor son los mismos del flujo real (no hay una agenda
 * de prueba aparte): lo que se marque aquí cambia la fecha que propone «Citar»
 * de verdad. La pantalla lo avisa.
 */
export async function guardarDisponibilidadPrueba(ex: DatosDisponibilidad): Promise<ResultadoDisponibilidad> {
  try {
    const actor = await exigirPrueba();
    const r = await guardarDisponibilidad(ex, actor);
    if (!r.ok) return r;
    // Solo se muestran (y se mueven) las citas de candidatos de prueba.
    const { data } = await createAdminClient().from("seleccion_citas").select("id, procesos_contratacion!inner(origen)").in("id", r.afectadas.map((c) => c.id).concat("00000000-0000-0000-0000-000000000000"));
    const dePrueba = new Set(
      (data ?? [])
        .filter((f) => ((Array.isArray(f.procesos_contratacion) ? f.procesos_contratacion[0] : f.procesos_contratacion) as { origen?: string } | null)?.origen === "chat_prueba")
        .map((f) => f.id as string)
    );
    return { ok: true, afectadas: r.afectadas.filter((c) => dePrueba.has(c.id)) };
  } catch (e) {
    return { ...mal(e), afectadas: [] };
  }
}

export async function quitarDisponibilidadPrueba(fecha: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirPrueba();
    return await quitarDisponibilidad(fecha);
  } catch (e) {
    return mal(e);
  }
}

/** Mueve solo las citas de candidatos de prueba de ese día. */
export async function reprogramarDiaPrueba(fecha: string): Promise<ResultadoReprogramarDia> {
  try {
    const actor = await exigirPrueba();
    return await reprogramarCitasDelDia(fecha, actor, { soloPrueba: true });
  } catch (e) {
    return { ...mal(e), movidas: [] };
  }
}

/**
 * Hace con el candidato de prueba lo que haría el cron (que en desarrollo no
 * corre): si la preselección está en rojo, lo cierra con la causa del requisito
 * (como a los 30 minutos sin cambios); si no, lo cierra como «Incomunicado»
 * (como a los 7 días sin respuesta). Sirve para probar que se reabre cuando la
 * persona vuelve a escribir. Solo candidatos del chat de prueba en «Preselección».
 */
export async function simularCierreAutomaticoPrueba(procesoId: string): Promise<{ ok: boolean; error?: string; causa?: string }> {
  try {
    await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    const { data: p } = await createAdminClient().from("procesos_contratacion").select("estado, requisito_incumplido, preseleccion").eq("id", procesoId).maybeSingle();
    if (p?.estado !== "pendiente") return { ok: false, error: "El cierre automático solo aplica a candidatos en «Preselección»." };
    const enRojo = (p.preseleccion as { global?: string } | null)?.global === "no_cumple" && p.requisito_incumplido;
    const causa = enRojo ? (p.requisito_incumplido as string) : "Incomunicado";
    await cambiarEstadoProceso(procesoId, "cierre", {
      actor: ACTOR_SISTEMA,
      causa,
      detalle: { motivo: enRojo ? "No pasó la preselección: cierre automático (simulado en el chat de prueba)." : "Sin respuesta tras la reactivación (simulado en el chat de prueba).", automatico: true },
    });
    return { ok: true, causa };
  } catch (e) {
    return mal(e);
  }
}
