/**
 * Simulador del cron para el chat de prueba (27-nov-2026). En desarrollo el
 * cron de Vercel no corre, así que lo que hace solo (cerrar a quien no pasó la
 * preselección, recordar la cita, marcar «No asistió», pedir el correo, el
 * aviso de rutas, recordar el certificado o los documentos, la reactivación
 * por silencio) no se veía en el chat de prueba. Mientras la página de pruebas
 * está abierta, corre esos pasos del cron SOLO para los candidatos de los chats
 * de prueba abiertos, con un reloj virtual (el tiempo se puede acelerar), y
 * devuelve lo que le llegaría a cada uno.
 *
 * Nunca toca procesos reales (solo origen «chat_prueba»), no envía WhatsApp
 * (a esos candidatos no les sale nada) y no consulta Croma. Solo servidor.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, cambiarEstadoProceso } from "@/lib/contratacion/servidor";
import { estadoInfo } from "@/lib/contratacion/constants";
import { cerrarNoPreseleccionados } from "./servidor";
import { ejecutarAgenda } from "./agenda-ejecutar";
import { avisosReconocimientoPendientes } from "./respuestas-examenes-servidor";
import { ejecutarCorreosPsico } from "./correo-psico-servidor";
import { ejecutarRecordatoriosCertificado } from "./certificado-banco-servidor";
import { ejecutarDocumentosPendientes } from "./documentos-ejecutar";
import { recogerMensajesPrueba, type MensajePrueba } from "./mensajes-prueba";
import { pasosDeSilencio } from "./silencio-prueba-servidor";

/** Lo que el chat de prueba sabe de sí mismo para el simulador. */
export interface ItemCronPrueba {
  idChat: number;
  /** El candidato del chat, si ya se guardó en Candidatos. */
  procesoId: string | null;
  /** Último mensaje del aspirante (ms). */
  ultimoEntranteAt: number | null;
  /** El último mensaje del chat es nuestro (el aspirante no ha contestado). */
  ultimoEsNuestro: boolean;
  hojaVida: boolean;
  buscaTrabajo: boolean;
  nombre: string | null;
}

/** Un paso de la reactivación por silencio, para el chat. */
export interface SilencioCronPrueba {
  /** Para no repetirlo: acción + último mensaje del aspirante. */
  clave: string;
  accion: string;
  texto: string | null;
  nota: string;
}

export interface ChatCronPrueba {
  idChat: number;
  procesoId: string | null;
  mensajes: MensajePrueba[];
  notas: string[];
  silencio: SilencioCronPrueba[];
}

export interface ResultadoCronPrueba {
  ahora: string;
  chats: ChatCronPrueba[];
  /** Lo que hizo cada paso (para depurar). */
  pasos: Record<string, unknown>;
}

const intentar = async <T,>(fn: () => Promise<T>): Promise<T | { error: string }> => {
  try {
    return await fn();
  } catch (e) {
    console.error("[cron de prueba]", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
};

const etiquetaEstado = (e: string | null | undefined) => (e ? estadoInfo(e)?.label ?? e : "—");

/** Un evento del proceso en palabras, para la nota del chat (null si ya se ve como mensaje). */
function notaDeEvento(e: { tipo: string; estado_anterior: string | null; estado_nuevo: string | null; causa: string | null; detalle: Record<string, unknown> | null }): string | null {
  const d = e.detalle ?? {};
  if (e.tipo === "estado" && e.estado_nuevo) {
    return `Gestivo (cron): pasó de «${etiquetaEstado(e.estado_anterior)}» a «${etiquetaEstado(e.estado_nuevo)}»${e.causa ? ` (${e.causa})` : ""}.`;
  }
  if (e.tipo === "cita") {
    if (d.accion === "alerta_no_confirmo") return "Gestivo (cron): no ha confirmado la cita; el chat queda para que una persona lo llame.";
    if (d.accion === "no_asistio") return "Gestivo (cron): pasó la tolerancia sin llegar: la cita queda «No asistió» (el aviso queda como borrador para revisar).";
  }
  if (e.tipo === "dato" && d.correo_psico === "sin_respuesta") return "Gestivo (cron): no respondió lo del correo; el chat queda para una persona.";
  if (e.tipo === "dato" && d.revision_requisito) return "Gestivo (cron): el requisito en rojo va a revisión de una persona (no se cierra solo).";
  return null;
}

export async function correrCronPrueba(items: ItemCronPrueba[], ahora: Date): Promise<ResultadoCronPrueba> {
  const db = createAdminClient();
  const pedidos = [...new Set(items.map((i) => i.procesoId).filter((x): x is string => typeof x === "string" && x.length > 0))];
  const { data: procesos } = pedidos.length
    ? await db.from("procesos_contratacion").select("id, estado, origen").in("id", pedidos)
    : { data: [] as { id: string; estado: string; origen: string | null }[] };
  // Solo candidatos del chat de prueba: nunca un proceso real.
  const ids = (procesos ?? []).filter((p) => p.origen === "chat_prueba").map((p) => p.id as string);
  const estado = new Map((procesos ?? []).map((p) => [p.id as string, p.estado as string]));
  // Desde el último evento que ya había (con el reloj de la base: el del servidor puede ir distinto).
  const { data: previo } = ids.length
    ? await db.from("procesos_contratacion_eventos").select("created_at").in("proceso_id", ids).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const desde = (previo?.created_at as string | undefined) ?? "1970-01-01T00:00:00Z";

  const { resultado: pasos, mensajes } = await recogerMensajesPrueba(async () => {
    if (!ids.length) return {};
    return {
      cierres: await intentar(() => cerrarNoPreseleccionados(ahora, ids)),
      agenda: await intentar(() => ejecutarAgenda(ahora, { soloProcesos: ids })),
      reconocimiento: await intentar(() => avisosReconocimientoPendientes(ahora, { soloProcesos: ids })),
      correos: await intentar(() => ejecutarCorreosPsico(ahora, { soloProcesos: ids })),
      certificado: await intentar(() => ejecutarRecordatoriosCertificado(ahora, { soloProcesos: ids })),
      documentos: await intentar(() => ejecutarDocumentosPendientes(ahora, { soloProcesos: ids })),
    };
  });

  // Lo que pasó en los procesos durante esta vuelta (cambios de estado, alertas…), en palabras.
  const { data: eventos } = ids.length
    ? await db
        .from("procesos_contratacion_eventos")
        .select("proceso_id, tipo, estado_anterior, estado_nuevo, causa, detalle")
        .in("proceso_id", ids)
        .gt("created_at", desde)
        .order("created_at")
    : { data: [] };

  // El estado después de los pasos: a quien se acaba de cerrar ya no le toca la reactivación.
  const { data: despues } = ids.length ? await db.from("procesos_contratacion").select("id, estado").in("id", ids) : { data: [] };
  for (const p of despues ?? []) estado.set(p.id as string, p.estado as string);

  const chats: ChatCronPrueba[] = [];
  for (const it of items) {
    const procesoId = it.procesoId && ids.includes(it.procesoId) ? it.procesoId : null;
    const notas = (eventos ?? [])
      .filter((e) => e.proceso_id === procesoId)
      .map((e) => notaDeEvento(e as Parameters<typeof notaDeEvento>[0]))
      .filter((x): x is string => !!x);
    // Reactivación por silencio: desde el último mensaje del aspirante, con el reloj virtual.
    const silencio: SilencioCronPrueba[] = [];
    const estadoActual = procesoId ? estado.get(procesoId) : null;
    const sigueAbierto = !estadoActual || !["cierre", "contratado"].includes(estadoActual);
    if (it.ultimoEsNuestro && it.ultimoEntranteAt && sigueAbierto) {
      const horas = (ahora.getTime() - it.ultimoEntranteAt) / 3_600_000;
      if (horas >= 1) {
        const r = await pasosDeSilencio({ horas, ahora: ahora.toISOString(), hojaVida: it.hojaVida, buscaTrabajo: it.buscaTrabajo, nombre: it.nombre }).catch(() => null);
        if (r?.ok) {
          for (const paso of r.pasos) {
            silencio.push({ clave: `${paso.accion}:${it.ultimoEntranteAt}`, accion: paso.accion, texto: paso.texto, nota: paso.nota });
            // Incomunicado: el candidato en Preselección se cierra como lo haría el cron.
            if (paso.accion === "incomunicado" && procesoId && estadoActual === "pendiente") {
              await cambiarEstadoProceso(procesoId, "cierre", {
                actor: ACTOR_SISTEMA,
                causa: "Incomunicado",
                detalle: { motivo: "Sin respuesta tras la reactivación (simulador del cron en el chat de prueba).", automatico: true },
              }).catch(() => null);
              notas.push("Gestivo (cron): sin respuesta tras la reactivación: el proceso se cierra como «Incomunicado».");
            }
          }
        }
      }
    }
    chats.push({ idChat: it.idChat, procesoId, mensajes: mensajes.filter((m) => m.procesoId && m.procesoId === procesoId), notas, silencio });
  }
  return { ahora: ahora.toISOString(), chats, pasos };
}
