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
import { ETIQUETA_TIPO_CITA, TIPOS_CON_SEGUIMIENTO, accionAgenda, citaVigente, fechaEnTexto, horaEnTexto, interpretarRespuestaCita, type AjustesAgenda, type Cita, type ExcepcionProfesor } from "./agenda";
import {
  citaPropuesta,
  citarProceso,
  citasDeProceso,
  citaVigenteDeProceso,
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
  deshacerRegistro,
  enviarAExamenes,
  historialProfesor,
  pendientesDelProfesor,
  planExamenes,
  registrarClase,
  registrarConcepto,
  registrarObservacion,
  registrarPrueba,
  registrarReconocimiento,
  registrarReconocimientos,
  rutasParaReconocimiento,
  type ExamenesElegidos,
  type HistorialProfesor,
  type PendientesProfesor,
  type PlanExamenes,
  type RegistroProfesor,
  type ResultadoProfesor,
} from "./profesor-servidor";
import { atenderRespuestaExamenesPrueba } from "./respuestas-examenes-servidor";
import type { MensajePrueba } from "./mensajes-prueba";
import { correrCronPrueba, type ItemCronPrueba, type ResultadoCronPrueba } from "./cron-prueba-servidor";
import type { DatosClase, DatosConcepto, DatosDisponibilidad, DatosPrueba, DatosRuta, DatosRutasDia } from "@/components/seleccion/profesor-tipos";

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

export async function citarPrueba(procesoId: string, cuando: { fecha: string; hora: string }, textoPropio?: string | null): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await citarProceso(procesoId, cuando, actor, { textoPropio: typeof textoPropio === "string" ? textoPropio : null });
  } catch (e) {
    return mal(e);
  }
}

export async function reprogramarPrueba(citaId: string, cuando: { fecha: string; hora: string }, por: "aspirante" | "empresa", textoPropio?: string | null): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirPrueba();
    await exigirCitaDePrueba(citaId);
    return await reprogramarCita(citaId, cuando, por === "empresa" ? "empresa" : "aspirante", actor, { textoPropio: typeof textoPropio === "string" ? textoPropio : null });
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
    // 50 (26-nov-2026): con varias personas probando a la vez, 15 se quedaban cortos.
    .limit(50);
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
  // La que sigue en pie más próxima: la prueba de manejo o la salida de reconocimiento de ruta.
  const cita = (await citasDeProceso(procesoId))
    .filter((c) => TIPOS_CON_SEGUIMIENTO.includes(c.tipo) && citaVigente(c))
    .sort((x, y) => `${x.fecha} ${x.hora}`.localeCompare(`${y.fecha} ${y.hora}`))[0];
  if (!cita) return { nota: null };
  const r = interpretarRespuestaCita(String(texto ?? "").slice(0, 500));
  if (r === "confirma" && cita.estado !== "confirmada") {
    await confirmarCita(cita.id, actor);
    return { nota: "Gestivo: la cita quedó confirmada." };
  }
  if (r === "pide_otra_fecha" && cita.estado !== "pide_otra_fecha") {
    await pedirOtraFecha(cita.id, actor);
    return { nota: "Gestivo: quedó «Pide otra fecha». El asistente le pregunta por qué, intenta que vaya y, si no puede, le ofrece solo el siguiente día hábil." };
  }
  if (r === "no_interesa") return { nota: "Gestivo: dijo que ya no le interesa; el chat pasaría a una persona para cerrar por desistimiento." };
  return { nota: null };
}

/**
 * Como el webhook: la respuesta a la pregunta del mensaje de exámenes (banco o
 * rutas). Si la atiende, el asistente no responde; devuelve los mensajes que le
 * llegarían al aspirante (27-nov-2026).
 */
export async function respuestaExamenesPrueba(procesoId: string, texto: string): Promise<{ atendida: boolean; mensajes: MensajePrueba[] }> {
  await exigirPrueba();
  await exigirProcesoDePrueba(procesoId);
  return atenderRespuestaExamenesPrueba(procesoId, String(texto ?? "").slice(0, 500));
}

/**
 * La citación que Gestivo envió solo (cita automática) al candidato de prueba,
 * para ponerla en el chat (27-nov-2026). Al quedar «Listo para citar» desde la
 * ficha («Lo revisé a mano», la decisión de antecedentes…) o cuando Croma
 * responde después, la cita se creaba pero el mensaje no llegaba al chat.
 * null si no tiene una cita automática en pie.
 */
export async function citacionAutomaticaPrueba(procesoId: string): Promise<{ citaId: string; texto: string } | null> {
  await exigirPrueba(false);
  await exigirProcesoDePrueba(procesoId);
  const cita = await citaVigenteDeProceso(procesoId);
  if (!cita || cita.creada_por !== ACTOR_SISTEMA.userEmail) return null;
  const vista = await vistaCitacion(procesoId, { fecha: cita.fecha, hora: cita.hora }).catch(() => null);
  return vista?.texto ? { citaId: cita.id, texto: vista.texto } : null;
}

/**
 * Simulador del cron en el chat de prueba (27-nov-2026): corre los pasos del
 * cron para los candidatos de los chats abiertos con el reloj virtual de la
 * página (puede ir adelantado). Solo candidatos del chat de prueba; no envía
 * nada ni consulta Croma.
 */
export async function cronPrueba(items: ItemCronPrueba[], ahoraIso: string): Promise<ResultadoCronPrueba | { error: string }> {
  try {
    await exigirPrueba(false);
    const real = Date.now();
    const t = Date.parse(String(ahoraIso ?? ""));
    // El reloj virtual va de ahora hasta 120 días adelante.
    const ahora = new Date(Number.isFinite(t) ? Math.min(Math.max(t, real), real + 120 * 86_400_000) : real);
    const lista = (Array.isArray(items) ? items : []).slice(0, 30).map((i) => ({
      idChat: Number(i.idChat),
      procesoId: typeof i.procesoId === "string" && i.procesoId ? i.procesoId : null,
      ultimoEntranteAt: Number.isFinite(Number(i.ultimoEntranteAt)) && i.ultimoEntranteAt ? Number(i.ultimoEntranteAt) : null,
      ultimoEsNuestro: i.ultimoEsNuestro === true,
      hojaVida: i.hojaVida === true,
      buscaTrabajo: i.buscaTrabajo !== false,
      nombre: typeof i.nombre === "string" ? i.nombre.slice(0, 120) : null,
    }));
    return await correrCronPrueba(lista, ahora);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo simular el cron." };
  }
}

/** Qué haría el cron con la cita a esa hora (recordatorio, alerta, no asistió). No envía ni cambia nada. */
export async function agendaSimuladaPrueba(procesoId: string, ahora: string | null): Promise<{ texto: string }> {
  await exigirPrueba(false);
  await exigirProcesoDePrueba(procesoId);
  const instante = ahora && !Number.isNaN(new Date(ahora).getTime()) ? new Date(ahora) : new Date();
  const [citas, a] = await Promise.all([citasDeProceso(procesoId), leerAjustesAgenda()]);
  const cita = citas
    .filter((c) => TIPOS_CON_SEGUIMIENTO.includes(c.tipo) && citaVigente(c))
    .sort((x, y) => `${x.fecha} ${x.hora}`.localeCompare(`${y.fecha} ${y.hora}`))[0];
  if (!cita) return { texto: "No tiene una cita en pie: el cron no haría nada." };
  const cuando = `${ETIQUETA_TIPO_CITA[cita.tipo]}, ${fechaEnTexto(cita.fecha)} a las ${horaEnTexto(cita.hora)}`;
  const accion = accionAgenda(cita, instante, a);
  const que =
    accion === "recordatorio"
      ? `enviaría el recordatorio de la cita («${cita.tipo === "reconocimiento" ? "recordatorio_reconocimiento" : "recordatorio_cita"}»).`
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

export async function rutasDiaProfesorPrueba(procesoId: string, d: DatosRutasDia): Promise<ResultadoProfesor> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await registrarReconocimientos(procesoId, d, actor);
  } catch (e) {
    return mal(e);
  }
}

/** `ahoraIso`: la hora del reloj de prueba (27-nov-2026), si se adelantó: la fecha cuenta desde ese día. */
const fechaSimulada = (ahoraIso?: string | null) => {
  const d = ahoraIso ? new Date(ahoraIso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
};

export async function planExamenesProfesorPrueba(procesoId: string, ahoraIso?: string | null): Promise<PlanExamenes> {
  await exigirPrueba(false);
  await exigirProcesoDePrueba(procesoId);
  return planExamenes(procesoId, fechaSimulada(ahoraIso));
}

export async function examenesProfesorPrueba(procesoId: string, elegidos?: ExamenesElegidos | null, ahoraIso?: string | null): Promise<ResultadoProfesor> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await enviarAExamenes(procesoId, actor, elegidos ?? null, fechaSimulada(ahoraIso));
  } catch (e) {
    return mal(e);
  }
}

export async function deshacerProfesorPrueba(procesoId: string, tipo: RegistroProfesor["tipo"], id: string): Promise<ResultadoProfesor> {
  try {
    const actor = await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    return await deshacerRegistro(procesoId, tipo, id, actor);
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
    const r = await guardarDisponibilidad(ex, actor, { reglaMismoDia: true });
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
    return await reprogramarCitasDelDia(fecha, actor, { soloPrueba: true, reglaMismoDia: true });
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

export interface ResultadoReenvioAlerta {
  ok: boolean;
  texto: string;
}

/**
 * «Reenviar la alerta de antecedentes» (27-nov-2026): para comprobar que el
 * correo a Gestión Humana sale, aunque ya se haya avisado. Usa la causa y las
 * fuentes de la última alerta del candidato; si no hubo, las de su evaluación.
 * Solo candidatos del chat de prueba; en desarrollo el correo solo sale a la
 * lista de pruebas.
 */
export async function reenviarAlertaAntecedentesPrueba(procesoId: string): Promise<ResultadoReenvioAlerta> {
  try {
    await exigirPrueba();
    await exigirProcesoDePrueba(procesoId);
    const { alertarAntecedentesDetalle } = await import("./alerta-antecedentes-servidor");
    type Causa = Parameters<typeof alertarAntecedentesDetalle>[1];
    const { data: ultima } = await createAdminClient()
      .from("procesos_contratacion_eventos")
      .select("detalle")
      .eq("proceso_id", procesoId)
      .not("detalle->>alerta_antecedentes", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previa = ultima?.detalle as { alerta_antecedentes?: Causa; fuentes?: string[] } | null;
    let causa: Causa = previa?.alerta_antecedentes ?? "hallazgo";
    let fuentes = previa?.fuentes ?? [];
    if (!previa) {
      const { evaluarAntecedentesProceso } = await import("./servidor");
      const ev = await evaluarAntecedentesProceso(procesoId);
      const hallazgos = (ev?.fuentes ?? []).filter((f) => f.estado === "hallazgo").map((f) => f.fuente);
      const sinRespuesta = (ev?.fuentes ?? []).filter((f) => f.estado === "error").map((f) => f.fuente);
      causa = hallazgos.length || !sinRespuesta.length ? "hallazgo" : "sin_respuesta";
      fuentes = hallazgos.length ? hallazgos : sinRespuesta;
    }
    const r = await alertarAntecedentesDetalle(procesoId, causa, fuentes, { forzar: true });
    const destino = [...(r.para ?? []), ...(r.copia ?? []).map((c) => `copia ${c}`)].join(", ");
    const enDesarrollo = process.env.GESTIVO_ENTORNO === "desarrollo" ? " En desarrollo solo llega a los correos de la lista de pruebas (Tiempos y reglas › Entorno de pruebas)." : "";
    switch (r.resultado) {
      case "enviado":
        return { ok: true, texto: `Alerta enviada a ${destino} («${r.asunto}»).${enDesarrollo}` };
      case "apagado":
        return { ok: false, texto: "La alerta de antecedentes está apagada (Selección › Indicadores › alerta de antecedentes)." };
      case "sin_destinatarios":
        return { ok: false, texto: "No hay destinatarios: ni en la alerta de antecedentes ni en el reporte diario (Selección › Indicadores)." };
      default:
        return { ok: false, texto: `No salió: ${r.error ?? "error desconocido"}${destino ? ` (iba a ${destino})` : ""}.` };
    }
  } catch (e) {
    return { ok: false, texto: e instanceof Error ? e.message : "No se pudo reenviar." };
  }
}

export interface PendienteChatPrueba {
  procesoId: string;
  at: string;
  /** Mensaje que le salió al aspirante de prueba fuera del chat (webhook o cron reales). */
  texto?: string;
  clave?: string;
  adjuntos?: string[];
  /** Nota para quien prueba (lo que respondió el laboratorio por WhatsApp…). */
  nota?: string;
}

/**
 * Lo que pasó por fuera del chat de prueba con sus candidatos (27-nov-2026,
 * pruebas más reales): el laboratorio respondió por el WhatsApp real (el aviso
 * que leyó Gestivo y el examen que registró) y los mensajes que eso le sacó al
 * aspirante de prueba. El chat lo pregunta cada poco mientras está abierto.
 */
export async function pendientesChatPrueba(procesoIds: string[], desdeIso: string): Promise<{ ahora: string; pendientes: PendienteChatPrueba[] } | { error: string }> {
  try {
    await exigirPrueba(false);
    const ahora = new Date().toISOString();
    const ids = [...new Set(procesoIds.filter(Boolean))].slice(0, 30);
    if (!ids.length || !/^\d{4}-\d{2}-\d{2}T/.test(desdeIso)) return { ahora, pendientes: [] };
    const db = createAdminClient();
    const { data: propios } = await db.from("procesos_contratacion").select("id").in("id", ids).eq("origen", "chat_prueba");
    const deprueba = (propios ?? []).map((p) => p.id as string);
    if (!deprueba.length) return { ahora, pendientes: [] };
    const [{ data: eventos }, { data: avisos }] = await Promise.all([
      db
        .from("procesos_contratacion_eventos")
        .select("proceso_id, tipo, detalle, created_at, usuario_email")
        .in("proceso_id", deprueba)
        .gt("created_at", desdeIso)
        .order("created_at"),
      db
        .from("seleccion_avisos_laboratorio")
        .select("proceso_id, created_at, texto, fase, resultado_propuesto")
        .in("proceso_id", deprueba)
        .gt("created_at", desdeIso)
        .order("created_at"),
    ]);
    const pendientes: PendienteChatPrueba[] = [];
    for (const a of avisos ?? []) {
      const resultado = a.resultado_propuesto ? ` · Gestivo leyó: ${String(a.resultado_propuesto).replace(/_/g, " ")}${a.fase ? ` (fase ${a.fase})` : ""}` : "";
      pendientes.push({ procesoId: a.proceso_id as string, at: a.created_at as string, nota: `El laboratorio respondió por WhatsApp: «${String(a.texto ?? "(archivo)").slice(0, 300)}»${resultado}` });
    }
    for (const e of eventos ?? []) {
      const d = (e.detalle ?? {}) as { mensaje_prueba?: { clave?: string; texto?: string; adjuntos?: string[] }; resultado?: string; fase?: number; observacion?: string };
      if (d.mensaje_prueba) {
        pendientes.push({ procesoId: e.proceso_id as string, at: e.created_at as string, texto: d.mensaje_prueba.texto ?? "", clave: d.mensaje_prueba.clave, adjuntos: d.mensaje_prueba.adjuntos ?? [] });
      } else if (e.tipo === "examen_medico" && /laboratorio/i.test(String(e.usuario_email ?? ""))) {
        pendientes.push({ procesoId: e.proceso_id as string, at: e.created_at as string, nota: `Gestivo registró el examen de la fase ${d.fase ?? "?"}: ${d.resultado ?? "?"} (por la respuesta del laboratorio)${d.observacion ? ` · ${d.observacion}` : ""}` });
      }
    }
    pendientes.sort((a, b) => a.at.localeCompare(b.at));
    return { ahora, pendientes };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer." };
  }
}
