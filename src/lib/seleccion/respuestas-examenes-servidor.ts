/**
 * Respuestas a las preguntas de los mensajes de exámenes (24-nov-2026): el
 * banco en la fase 1 y las rutas en la fase 2. Solo servidor; reglas puras en
 * ./respuestas-examenes.
 *
 * Al enviar el mensaje de cada fase se marca la pregunta (banco_preguntado_at,
 * rutas_preguntado_at). Cuando el aspirante responde, el webhook lo atiende
 * aquí antes que el asistente: guarda la respuesta, contesta con el mensaje del
 * catálogo y, si no tiene cuenta, le envía la carta del banco. Sin la
 * migración 20261124194635 no hace nada (el asistente responde como antes).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { enviarTexto } from "@/lib/comunicaciones/whatsapp";
import { registrarSaliente } from "@/lib/comunicaciones/registro";
import { FIRMA_SELECCION } from "./envio";
import { renderizarMensaje } from "./mensajes";
import { leerMensaje } from "./servidor";
import { interpretarBanco, interpretarRutas, mensajeRutas } from "./respuestas-examenes";

const ACTOR_WHATSAPP: ActorProceso = { tipo: "sistema", userId: null, userEmail: "WhatsApp" };

/** Se envió el mensaje de la fase 1: queda la pregunta del banco. */
export async function marcarBancoPreguntado(procesoId: string): Promise<void> {
  await createAdminClient().from("procesos_contratacion").update({ banco_preguntado_at: new Date().toISOString(), banco_respondido_at: null, banco_cuenta: null }).eq("id", procesoId);
}

/**
 * ¿El mensaje de la fase 1 que le llegó al aspirante traía la pregunta del banco?
 * (M2, 25-nov-2026). Con la ventana de 24 h cerrada sale la plantilla aprobada por
 * Meta, que puede ser la versión vieja, sin la pregunta: entonces no hay nada que
 * esperar de él y no se marca. `texto` es el del catálogo (lo que se ve en el chat
 * de prueba o queda en el borrador); si salió por WhatsApp, se mira lo que salió.
 */
export async function mensajeFase1PreguntaBanco(procesoId: string, envio: string | undefined, texto: string): Promise<boolean> {
  const pregunta = (t: unknown) => /banco/i.test(String(t ?? ""));
  if (envio === "prueba" || envio === "borrador") return pregunta(texto);
  if (envio !== "enviado") return false;
  const db = createAdminClient();
  const { data: convs } = await db.from("wa_conversaciones").select("id").eq("proceso_id", procesoId).limit(5);
  const ids = (convs ?? []).map((c) => c.id as string);
  if (!ids.length) return pregunta(texto);
  const { data: ultimo } = await db.from("wa_mensajes").select("contenido").in("conversacion_id", ids).eq("direccion", "saliente").order("timestamp", { ascending: false }).limit(1).maybeSingle();
  return ultimo ? pregunta(ultimo.contenido) : pregunta(texto);
}

/** Se envió el mensaje de la fase 2: queda la pregunta de las rutas. */
export async function marcarRutasPreguntado(procesoId: string): Promise<void> {
  await createAdminClient().from("procesos_contratacion").update({ rutas_preguntado_at: new Date().toISOString(), rutas_respondido_at: null, rutas_declaradas: null }).eq("id", procesoId);
}

interface ProcesoRespuestas {
  id: string;
  estado: string;
  banco_cuenta: string | null;
  banco_preguntado_at: string | null;
  banco_respondido_at: string | null;
  rutas_preguntado_at: string | null;
  rutas_respondido_at: string | null;
  correo_estado: string | null;
  correo_recordatorio_at: string | null;
  reconocimiento_estado: string | null;
}

async function leerProceso(procesoId: string): Promise<ProcesoRespuestas | null> {
  const { data, error } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id, estado, banco_cuenta, banco_preguntado_at, banco_respondido_at, rutas_preguntado_at, rutas_respondido_at, correo_estado, correo_recordatorio_at, reconocimiento_estado")
    .eq("id", procesoId)
    .maybeSingle();
  return error || !data ? null : (data as ProcesoRespuestas);
}

const ESTADOS_RUTAS = ["en_examenes", "en_examenes_fase2", "reconocimiento_ruta"];

/**
 * Las preguntas que esperan respuesta, de la más reciente a la más vieja: la
 * del banco (fase 1) y la de las rutas (aviso del reconocimiento, 24-nov-2026).
 */
function preguntasPendientes(p: ProcesoRespuestas): ("banco" | "rutas")[] {
  const out: { q: "banco" | "rutas"; at: string }[] = [];
  if (p.banco_preguntado_at && !p.banco_respondido_at && (p.estado === "en_examenes" || p.estado === "en_examenes_fase2")) {
    // Si después se le preguntó «¿Tu correo es…?», un sí o un no es para el correo.
    const correoDespues = p.correo_estado === "por_confirmar" && p.correo_recordatorio_at && p.correo_recordatorio_at > p.banco_preguntado_at;
    if (!correoDespues) out.push({ q: "banco", at: p.banco_preguntado_at });
  }
  if (p.rutas_preguntado_at && !p.rutas_respondido_at && ESTADOS_RUTAS.includes(p.estado)) out.push({ q: "rutas", at: p.rutas_preguntado_at });
  return out.sort((a, b) => b.at.localeCompare(a.at)).map((x) => x.q);
}

/** La que se le hizo de último (para el asistente). */
function preguntaPendiente(p: ProcesoRespuestas): "banco" | "rutas" | null {
  return preguntasPendientes(p)[0] ?? null;
}

async function textoCatalogo(clave: string, respaldo: string): Promise<string> {
  const m = await leerMensaje(clave).catch(() => null);
  return renderizarMensaje(m?.texto?.trim() ? m.texto : respaldo, {});
}

/**
 * Atiende la respuesta del aspirante si es a la pregunta del banco o de las
 * rutas. true = la atendió (el asistente no responde ese mensaje).
 */
export async function procesarRespuestaExamenes(conversacionId: string, mensajeId: string | null): Promise<boolean> {
  if (!mensajeId) return false;
  const db = createAdminClient();
  const [{ data: conv }, { data: msg }] = await Promise.all([
    db.from("wa_conversaciones").select("id, proceso_id, wa_contactos(telefono, tipo)").eq("id", conversacionId).maybeSingle(),
    db.from("wa_mensajes").select("contenido, direccion").eq("id", mensajeId).maybeSingle(),
  ]);
  if (!conv?.proceso_id || msg?.direccion !== "entrante") return false;
  const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as { telefono?: string; tipo?: string } | null;
  if (!contacto?.telefono || contacto.tipo === "laboratorio") return false;
  const p = await leerProceso(conv.proceso_id as string);
  // Cerrado o contratado: ya no se atienden las preguntas del mensaje de exámenes.
  if (!p || p.estado === "cierre" || p.estado === "contratado") return false;
  const pendientes = preguntasPendientes(p);
  if (!pendientes.length) return false;
  const texto = String(msg.contenido ?? "");
  // La respuesta es de la pregunta más reciente que la entienda (un número no es un sí/no).
  const pregunta = pendientes.find((q) => (q === "banco" ? interpretarBanco(texto) != null : interpretarRutas(texto) != null));
  if (!pregunta) return false;
  const responder = async (t: string) => {
    const envio = await enviarTexto(contacto.telefono!, t);
    await registrarSaliente(conversacionId, envio, { contenido: t }, FIRMA_SELECCION, { automatico: true });
  };
  const ahora = new Date().toISOString();

  if (pregunta === "banco") {
    const r = interpretarBanco(texto);
    if (!r) return false;
    await db.from("procesos_contratacion").update({ banco_cuenta: r, banco_respondido_at: ahora }).eq("id", p.id);
    await registrarEvento(p.id, { tipo: "dato", detalle: { banco_cuenta: r } }, ACTOR_WHATSAPP);
    if (r === "si") {
      await responder(await textoCatalogo("banco_si", "¡Perfecto, muchas gracias por confirmarnos! Le agradecemos enviarnos un certificado bancario actualizado de su cuenta del Banco de Bogotá. Puede compartirlo por este mismo medio."));
    } else {
      await responder(await textoCatalogo("banco_no", "¡Gracias por confirmarnos! Le enviamos la carta de autorización del Banco de Bogotá para que pueda abrir su cuenta de ahorros. Lleve la carta y su documento de identidad."));
      await enviarCartaDelBanco(p.id);
    }
    // Después del banco, el aviso del reconocimiento de ruta (con la pregunta de cuántas
    // conoce); si ya se le hizo, el correo para la prueba psicosensotécnica.
    if (!p.rutas_preguntado_at) await avisarReconocimiento(p.id);
    else await pedirCorreoDespues(p.id, p.correo_estado);
    return true;
  }

  const n = interpretarRutas(texto);
  if (n == null) return false;
  await db.from("procesos_contratacion").update({ rutas_declaradas: n, rutas_respondido_at: ahora }).eq("id", p.id);
  await registrarEvento(p.id, { tipo: "dato", detalle: { rutas_declaradas: n } }, ACTOR_WHATSAPP);
  const { leerAjustesAgenda } = await import("./agenda-servidor");
  const minimas = (await leerAjustesAgenda().catch(() => null))?.rutasMinimas ?? 2;
  const clave = mensajeRutas(n, minimas);
  // Dice que conoce las suficientes: queda por verificar; si no, pendiente de citar (si el encargado no lo tiene ya en curso).
  await db
    .from("procesos_contratacion")
    .update({ reconocimiento_estado: clave === "rutas_suficientes" ? "por_verificar" : "pendiente" })
    .eq("id", p.id)
    .or("reconocimiento_estado.is.null,reconocimiento_estado.in.(pendiente,por_verificar)");
  await responder(
    await textoCatalogo(
      clave,
      clave === "rutas_suficientes"
        ? "¡Excelente! Muchas gracias por la información. La persona encargada del reconocimiento de rutas lo verificará con usted y le indicará los siguientes pasos."
        : "Gracias por la información. Deberá realizar el reconocimiento y aprendizaje de rutas; la persona encargada le enviará la citación."
    )
  );
  // Después de las rutas, el correo para la prueba psicosensotécnica (si falta).
  await pedirCorreoDespues(p.id, p.correo_estado);
  return true;
}

/**
 * El aviso del reconocimiento de ruta, con la pregunta de cuántas rutas conoce
 * (fase 1, después de la respuesta del banco). Si sale, queda la pregunta
 * pendiente y el reconocimiento «pendiente» hasta que responda.
 */
export async function avisarReconocimiento(procesoId: string): Promise<string | undefined> {
  try {
    const { avisarProceso } = await import("./agenda-servidor");
    const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
    const { envio } = await avisarProceso(procesoId, "reconocimiento_aviso", { fecha: hoy, hora: "08:00" });
    if (envio === "enviado" || envio === "prueba" || envio === "borrador") {
      const ahora = new Date().toISOString();
      await createAdminClient()
        .from("procesos_contratacion")
        .update({ rutas_preguntado_at: ahora, rutas_respondido_at: null, rutas_declaradas: null, reconocimiento_aviso_at: ahora })
        .eq("id", procesoId);
      await createAdminClient().from("procesos_contratacion").update({ reconocimiento_estado: "pendiente" }).eq("id", procesoId).is("reconocimiento_estado", null);
      await registrarEvento(procesoId, { tipo: "dato", detalle: { reconocimiento_aviso: true, envio } }, { tipo: "sistema", userId: null, userEmail: "Sistema" });
    }
    return envio;
  } catch (e) {
    console.error("[seleccion] aviso del reconocimiento:", e);
    return undefined;
  }
}

/**
 * Revisión periódica: el aviso del reconocimiento a quien no respondió lo del
 * banco en 24 horas (para no dejarlo sin el aviso). Solo los que entraron con
 * el flujo nuevo (con la pregunta del banco), en el horario de los mensajes.
 */
export async function avisosReconocimientoPendientes(ahora = new Date()): Promise<{ avisos: number }> {
  const desde = new Date(ahora.getTime() - 24 * 3_600_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id, origen")
    .in("estado", ["en_examenes", "en_examenes_fase2"])
    .not("banco_preguntado_at", "is", null)
    .lt("banco_preguntado_at", desde)
    .is("rutas_preguntado_at", null)
    .or("reconocimiento_estado.is.null,reconocimiento_estado.neq.finalizado")
    .limit(30);
  if (error) return { avisos: 0 };
  const { leerConfigSeguimiento } = await import("@/lib/comunicaciones/seguimiento-ejecutar");
  const { enHorario } = await import("@/lib/comunicaciones/seguimiento");
  const { config } = await leerConfigSeguimiento();
  if (!enHorario(ahora, config.horaDesde, config.horaHasta)) return { avisos: 0 };
  let avisos = 0;
  for (const f of data ?? []) {
    if (f.origen === "chat_prueba") continue;
    const envio = await avisarReconocimiento(f.id as string);
    if (envio === "enviado" || envio === "borrador") avisos++;
  }
  return { avisos };
}

/** La carta del banco al aspirante (cita de la fase 1). Import tardío: laboratorios-servidor importa mucho. */
async function enviarCartaDelBanco(procesoId: string): Promise<void> {
  try {
    const { data: cita } = await createAdminClient()
      .from("seleccion_citas")
      .select("id")
      .eq("proceso_id", procesoId)
      .eq("tipo", "examen_f1")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cita) return;
    const { enviarDocumentosAspirante } = await import("./laboratorios-servidor");
    await enviarDocumentosAspirante(cita.id as string, { forzar: true });
  } catch (e) {
    console.error("[seleccion] carta del banco:", e);
  }
}

async function pedirCorreoDespues(procesoId: string, correoEstado: string | null): Promise<void> {
  if (correoEstado) return;
  try {
    const { leerAjustesCorreo, pedirCorreoPsico } = await import("./correo-psico-servidor");
    if ((await leerAjustesCorreo()).activo) await pedirCorreoPsico(procesoId, ACTOR_WHATSAPP);
  } catch (e) {
    console.error("[seleccion] pedir el correo después del banco:", e);
  }
}

/** Para el asistente: qué pregunta del mensaje de exámenes espera respuesta. */
export async function preguntaExamenDeConversacion(conversacionId: string): Promise<"banco" | "rutas" | null> {
  const { data: conv } = await createAdminClient().from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  if (!conv?.proceso_id) return null;
  const p = await leerProceso(conv.proceso_id as string);
  return p ? preguntaPendiente(p) : null;
}

/**
 * ¿Hay que esperar antes de pedir el correo? Mientras la pregunta del banco o
 * la de las rutas lleve menos de 24 horas sin respuesta: una pregunta a la vez.
 */
export async function esperandoBanco(procesoId: string, ahora = new Date()): Promise<boolean> {
  const p = await leerProceso(procesoId);
  const reciente = (at: string | null) => !!at && ahora.getTime() - new Date(at).getTime() < 24 * 3_600_000;
  if (p?.rutas_preguntado_at && !p.rutas_respondido_at && reciente(p.rutas_preguntado_at)) return true;
  if (!p?.banco_preguntado_at || p.banco_respondido_at) return false;
  return ahora.getTime() - new Date(p.banco_preguntado_at).getTime() < 24 * 3_600_000;
}
