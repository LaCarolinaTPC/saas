/**
 * Automáticos de la agenda (entrega 2, D2–D4 y E2). Los corre el cron de
 * seguimiento cada 15 minutos; la decisión de qué toca está en agenda.ts
 * (accionAgenda, pura y con pruebas). Cada paso se reserva con un UPDATE
 * condicional: dos corridas a la vez no lo repiten.
 *
 *  - 8:00  recordatorio de la cita a los citados de hoy;
 *  - 11:00 quien no ha confirmado queda para llamar (chat marcado para una persona);
 *  - hora + tolerancia sin llegada: «No asistió» y el aviso como borrador (reversible);
 *  Lo mismo con las salidas de reconocimiento de ruta (21-nov-2026), con sus mensajes;
 *  - 7:30  recordatorio de escuela a quien siga en escuela (una vez por día).
 *
 * Nunca toca candidatos del chat de prueba. Si el profesor marcó que hoy no
 * puede (o cambió la hora) y la cita no se ha reprogramado, no se le recuerda
 * ni se le marca inasistencia: la agenda la muestra para reprogramar.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, registrarEvento } from "@/lib/contratacion/servidor";
import { horaBogota } from "@/lib/comunicaciones/seguimiento";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { TIPOS_CON_SEGUIMIENTO, accionAgenda, citasAfectadas, hhmm, horaDelDia, interpretarRespuestaCita, citaVigente, type Cita } from "./agenda";
import {
  CLAVE_RECORDATORIO,
  avisarProceso,
  citasDeProceso,
  confirmarCita,
  conversacionDeProceso,
  leerAjustesAgenda,
  leerDisponibilidad,
  marcarNoAsistio,
  pedirOtraFecha,
} from "./agenda-servidor";

export interface ResultadoAgendaCron {
  recordatorios: number;
  alertas: number;
  inasistencias: number;
  escuela: number;
  /** Citas de hoy que esperan reprogramación porque el profesor no puede. */
  porReprogramar: number;
  omitida?: string;
}

type FilaCita = Cita & { procesos_contratacion: { id: string; nombre: string | null; celular: string | null; origen: string | null } | { id: string; nombre: string | null; celular: string | null; origen: string | null }[] | null };
const uno = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function ejecutarAgenda(ahora: Date = new Date()): Promise<ResultadoAgendaCron> {
  const r: ResultadoAgendaCron = { recordatorios: 0, alertas: 0, inasistencias: 0, escuela: 0, porReprogramar: 0 };
  const db = createAdminClient();
  const hoy = fechaBogota(ahora.toISOString());
  const { data, error } = await db
    .from("seleccion_citas")
    .select("*, procesos_contratacion!inner(id, nombre, celular, origen, estado)")
    .eq("fecha", hoy)
    .in("tipo", [...TIPOS_CON_SEGUIMIENTO])
    .in("estado", ["programada", "confirmada", "pide_otra_fecha"]);
  // Sin la migración de la entrega 2 no hay agenda.
  if (error) return { ...r, omitida: `consulta: ${error.message}` };

  const [a, excepciones] = await Promise.all([leerAjustesAgenda(), leerDisponibilidad(hoy, hoy)]);
  // Ni candidatos del chat de prueba ni procesos ya cerrados o contratados.
  const citas = ((data ?? []) as FilaCita[]).filter((c) => {
    const p = uno(c.procesos_contratacion) as { origen?: string | null; estado?: string } | null;
    return p?.origen !== "chat_prueba" && p?.estado !== "cierre" && p?.estado !== "contratado";
  });
  const ex = excepciones[0] ?? null;
  const sinCupo = new Set((ex ? citasAfectadas(citas, ex) : []).map((c) => c.id));
  r.porReprogramar = sinCupo.size;

  for (const c of citas) {
    if (sinCupo.has(c.id)) continue;
    const accion = accionAgenda(c, ahora, a);
    if (!accion) continue;
    const p = uno(c.procesos_contratacion);
    if (!p) continue;

    if (accion === "inasistencia") {
      // marcarNoAsistio solo cambia la cita si sigue en pie (reserva incluida).
      const m = await marcarNoAsistio(c.id, ACTOR_SISTEMA);
      if (m.ok) r.inasistencias++;
      continue;
    }

    const columna = accion === "recordatorio" ? "recordatorio_at" : "alerta_at";
    const { data: tomada } = await db
      .from("seleccion_citas")
      .update({ [columna]: ahora.toISOString() })
      .eq("id", c.id)
      .is(columna, null)
      .in("estado", ["programada", "confirmada", "pide_otra_fecha"])
      .select("id");
    if (!tomada?.length) continue;

    if (accion === "recordatorio") {
      const { envio } = await avisarProceso(p.id, CLAVE_RECORDATORIO[c.tipo] ?? "recordatorio_cita", { fecha: c.fecha, hora: c.hora });
      await registrarEvento(p.id, { tipo: "cita", detalle: { accion: "recordatorio", tipo: c.tipo, fecha: c.fecha, hora: hhmm(c.hora), envio } }, ACTOR_SISTEMA);
      // Sin plantilla aprobada (o sin la dirección): se suelta para reintentar cuando se pueda enviar.
      if (envio === "sin_plantilla" || envio === "falta_dato") await db.from("seleccion_citas").update({ recordatorio_at: null }).eq("id", c.id);
      else r.recordatorios++;
      continue;
    }

    // No ha confirmado: el chat queda para una persona y la agenda muestra «Llamar».
    const conv = await conversacionDeProceso({ id: p.id, celular: p.celular, origen: p.origen, nombre: p.nombre });
    if (conv) await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conv.id);
    await registrarEvento(p.id, { tipo: "cita", detalle: { accion: "alerta_no_confirmo", tipo: c.tipo, fecha: c.fecha, hora: hhmm(c.hora) } }, ACTOR_SISTEMA);
    r.alertas++;
  }

  // Escuela: una vez por día, desde la hora configurada y antes de la clase, si hoy hay profesor.
  const horaClase = horaDelDia(hoy, a, excepciones);
  const ya = horaBogota(ahora);
  if (horaClase && ya >= a.recordatorioEscuelaHora && ya < horaClase) {
    const { data: enEscuela, error: eEscuela } = await db
      .from("procesos_contratacion")
      .select("id, origen, escuela_recordatorio_fecha")
      .eq("estado", "en_escuela")
      .or(`escuela_recordatorio_fecha.is.null,escuela_recordatorio_fecha.neq.${hoy}`)
      .limit(200);
    if (!eEscuela) {
      // Solo a quien el profesor mandó a escuela con el registro nuevo: los procesos
      // viejos que quedaron en «En escuela» antes de la entrega 2 no reciben mensajes.
      const candidatos = (enEscuela ?? []).filter((x) => x.origen !== "chat_prueba");
      const { data: registrados } = candidatos.length
        ? await db.from("seleccion_pruebas_manejo").select("proceso_id").eq("resultado", "escuela").in("proceso_id", candidatos.map((x) => x.id as string))
        : { data: [] };
      const conRegistro = new Set((registrados ?? []).map((x) => x.proceso_id as string));
      for (const p of candidatos.filter((x) => conRegistro.has(x.id as string))) {
        const { data: tomado } = await db
          .from("procesos_contratacion")
          .update({ escuela_recordatorio_fecha: hoy })
          .eq("id", p.id)
          .eq("estado", "en_escuela")
          .or(`escuela_recordatorio_fecha.is.null,escuela_recordatorio_fecha.neq.${hoy}`)
          .select("id");
        if (!tomado?.length) continue;
        const { envio } = await avisarProceso(p.id as string, "escuela", { fecha: hoy, hora: horaClase });
        if (envio === "enviado" || envio === "borrador") r.escuela++;
      }
    }
  }
  return r;
}

/**
 * Respuesta del aspirante a la citación o al recordatorio (los botones «Sí,
 * voy» y «Necesito otra fecha» llegan como texto). La llama el webhook antes
 * del asistente, esté o no pausado: confirma la cita o la deja marcada para
 * que una persona la mueva. Nunca reprograma ni cierra sola.
 *
 * Vale para la prueba de manejo y para la salida de reconocimiento de ruta (la
 * más próxima de las que siguen en pie). Si pide otra fecha, el asistente le
 * pregunta por qué y le ofrece solo el siguiente día hábil (22-nov-2026).
 */
export async function procesarRespuestaCita(conversacionId: string, mensajeId: string): Promise<"confirma" | "pide_otra_fecha" | "no_interesa" | null> {
  const db = createAdminClient();
  const { data: conv } = await db.from("wa_conversaciones").select("proceso_id, agente_pausado").eq("id", conversacionId).maybeSingle();
  const procesoId = (conv?.proceso_id as string | null) ?? null;
  if (!procesoId) return null;
  const citas = (await citasDeProceso(procesoId)).filter((c) => TIPOS_CON_SEGUIMIENTO.includes(c.tipo));
  // La que sigue en pie más próxima (las citas vienen de la más reciente a la más vieja).
  const cita = citas.filter((c) => citaVigente(c)).sort((x, y) => `${x.fecha} ${x.hora}`.localeCompare(`${y.fecha} ${y.hora}`))[0];
  if (!cita) {
    // No llegó y responde al aviso: el asistente le pregunta qué pasó y le ofrece
    // el siguiente día hábil; si está pausado en este chat, queda para una persona.
    const ultima = citas.find((c) => c.estado !== "reprogramada" && c.estado !== "cancelada");
    if (ultima?.estado === "no_asistio" && conv?.agente_pausado) await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conversacionId);
    return null;
  }
  const { data: m } = await db.from("wa_mensajes").select("contenido, direccion").eq("id", mensajeId).maybeSingle();
  if (!m || m.direccion !== "entrante") return null;
  const r = interpretarRespuestaCita(String(m.contenido ?? ""));
  if (r === "confirma") {
    if (cita.estado !== "confirmada") await confirmarCita(cita.id, ACTOR_SISTEMA);
  } else if (r === "pide_otra_fecha") {
    if (cita.estado !== "pide_otra_fecha") await pedirOtraFecha(cita.id, ACTOR_SISTEMA);
    // El asistente le pregunta por qué, intenta que vaya y, si no, le ofrece el
    // siguiente día hábil. Solo si está pausado en este chat queda para una persona.
    if (conv?.agente_pausado) await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conversacionId);
  } else if (r === "no_interesa") {
    // El cierre por desistimiento lo decide una persona.
    await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conversacionId);
  }
  return r;
}
