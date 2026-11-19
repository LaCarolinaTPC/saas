/**
 * Respuesta automática del agente a un mensaje entrante. La dispara el
 * webhook de WhatsApp con after(), ya respondido el 200 a Meta, así que nada
 * de esto bloquea ni hace reintentar el webhook.
 */
import { citaDeConversacion, reprogramarPorAsistente } from "@/lib/seleccion/agenda-servidor";
import { ACTOR_AGENTE } from "@/lib/contratacion/servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto } from "../whatsapp";
import { registrarSaliente } from "../registro";
import { getAgenteConClaves, mensajesALeer, modeloSolicitado, type AgenteConfig } from "./config";
import {
  MOTIVO_TRANSFERENCIA,
  notaRevision,
  construirHistorial,
  construirSistema,
  decidirRespuesta,
  pareceAvisoDeRevision,
  parsearFrases,
  pideHumano,
  reglasSeleccion,
  resumirRecibidos,
  textoReciente,
  type MensajeHistorial,
} from "./motor";
import { generarRespuesta } from "./proveedores";
import { actualizarDesdeChat, regresoDeConversacion } from "@/lib/seleccion/proceso-desde-chat";
import { leerFotosPendientes, lecturasDeConversacion } from "@/lib/seleccion/lectura-fotos";
import { vinculoDeConversacion } from "@/lib/seleccion/vinculo-servidor";
import {
  antecedentesEnRevisionDeConversacion,
  cerradoPorAntecedentesDeConversacion,
  contextoSeleccion,
  fechaRechazadaDeConversacion,
  licenciaVerificadaDeConversacion,
  verificacionDemoradaDeConversacion,
} from "@/lib/seleccion/servidor";

export const FIRMA_AGENTE = "Agente IA";

type MotivoPausa = "humano" | "solicitud" | "agente" | "manual";

/** Detiene el agente en la conversación; requiereHumano la destaca en la bandeja. */
export async function pausarAgente(conversacionId: string, motivo: MotivoPausa, requiereHumano: boolean): Promise<void> {
  const db = createAdminClient();
  await db
    .from("wa_conversaciones")
    .update({
      agente_pausado: true,
      agente_motivo_pausa: motivo,
      agente_pausado_at: new Date().toISOString(),
      requiere_humano: requiereHumano,
    })
    .eq("id", conversacionId);
}

async function registrarEjecucion(fila: {
  conversacionId: string;
  config: AgenteConfig;
  modeloUsado?: string | null;
  tokensEntrada?: number | null;
  tokensSalida?: number | null;
  duracionMs?: number;
  resultado: "respondido" | "transferido" | "error";
  error?: string;
}): Promise<void> {
  const db = createAdminClient();
  await db.from("wa_agente_ejecuciones").insert({
    conversacion_id: fila.conversacionId,
    proveedor: fila.config.proveedor,
    modelo_solicitado: modeloSolicitado(fila.config),
    modelo_usado: fila.modeloUsado ?? null,
    tokens_entrada: fila.tokensEntrada ?? null,
    tokens_salida: fila.tokensSalida ?? null,
    duracion_ms: fila.duracionMs ?? null,
    resultado: fila.resultado,
    error: fila.error?.slice(0, 1000) ?? null,
  });
}

async function enviarComoAgente(conversacionId: string, telefono: string, texto: string): Promise<boolean> {
  const envio = await enviarTexto(telefono, texto);
  await registrarSaliente(conversacionId, envio, { contenido: texto }, FIRMA_AGENTE, { porIa: true });
  return envio.ok;
}

/** Pasa la conversación a un humano: despide al agente con el mensaje configurado y lo pausa. */
async function transferir(
  conversacionId: string,
  telefono: string,
  motivo: MotivoPausa,
  despedida: string
): Promise<void> {
  if (despedida.trim()) await enviarComoAgente(conversacionId, telefono, despedida.trim());
  await pausarAgente(conversacionId, motivo, true);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Espera (hasta `maxMs`) a que el webhook termine de copiar los archivos que
 * la persona acaba de mandar: el mensaje se guarda antes que la copia. Si no
 * se espera, el asistente ve la foto como no descargada (o no la puede leer).
 */
async function esperarMediosPendientes(conversacionId: string, maxMs = 10_000): Promise<void> {
  const db = createAdminClient();
  const desde = new Date(Date.now() - 5 * 60_000).toISOString();
  for (let t = 0; t < maxMs; t += 1_500) {
    const { count } = await db
      .from("wa_mensajes")
      .select("id", { count: "exact", head: true })
      .eq("conversacion_id", conversacionId)
      .eq("direccion", "entrante")
      .not("media_id", "is", null)
      .is("media_path", null)
      .neq("media_tipo", "sticker")
      .gte("created_at", desde);
    if (!count) return;
    await esperar(1_500);
  }
}

/** Historial del chat con la lectura automática de las fotos junto a su mensaje. */
async function historialConLecturas(conversacionId: string, limite: number): Promise<MensajeHistorial[]> {
  const db = createAdminClient();
  const [{ data: filas }, lecturas] = await Promise.all([
    db
      .from("wa_mensajes")
      .select("id, direccion, contenido, media_tipo, media_path")
      .eq("conversacion_id", conversacionId)
      .order("timestamp", { ascending: false })
      .limit(limite),
    lecturasDeConversacion(conversacionId).catch(() => new Map<string, string>()),
  ]);
  return (filas ?? []).reverse().map((m) => ({
    direccion: m.direccion as "entrante" | "saliente",
    contenido: m.contenido ?? "",
    mediaTipo: m.media_tipo,
    lectura: lecturas.get(m.id as string) ?? null,
    // Los stickers no importan; el resto sin copia local no se tiene.
    sinArchivo: m.direccion === "entrante" && !!m.media_tipo && m.media_tipo !== "sticker" && !m.media_path,
  }));
}

/** ¿La persona ya autorizó el tratamiento de datos, según lo leído del chat? */
async function autorizoEnElChat(conversacionId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("wa_conversaciones").select("prefiltro").eq("id", conversacionId).maybeSingle();
  return (data?.prefiltro as { autorizacion?: string | null } | null)?.autorizacion === "si";
}

/**
 * Segundo mensaje del asistente, por su cuenta: al recibir la autorización
 * anunció que estaba revisando los datos; terminada la consulta del RUNT le
 * cuenta el resultado y sigue con lo que falte. No sale si el agente quedó
 * pausado o si la persona ya escribió otra cosa (esa respuesta lo cubre).
 */
async function enviarSeguimientoRevision(
  conversacionId: string,
  telefono: string,
  nombreContacto: string | null,
  config: AgenteConfig,
  claves: Awaited<ReturnType<typeof getAgenteConClaves>>["claves"],
  recibidos: string
): Promise<void> {
  const db = createAdminClient();
  const { data: conv } = await db.from("wa_conversaciones").select("agente_pausado").eq("id", conversacionId).maybeSingle();
  if (!conv || conv.agente_pausado) return;
  const historial = await historialConLecturas(conversacionId, mensajesALeer(config));
  if (historial[historial.length - 1]?.direccion !== "saliente") return;

  const [ctx, licencia, vinculo, fechaRechazada, demorada] = await Promise.all([
    contextoSeleccion().catch(() => null),
    licenciaVerificadaDeConversacion(conversacionId).catch(() => null),
    vinculoDeConversacion(conversacionId).catch(() => null),
    fechaRechazadaDeConversacion(conversacionId).catch(() => null),
    verificacionDemoradaDeConversacion(conversacionId).catch(() => false),
  ]);
  const sistema = construirSistema(
    config.prompt,
    nombreContacto,
    new Date(),
    reglasSeleccion(config, recibidos, ctx?.autorizacion ?? "", ctx?.requisitos ?? null, licencia, true, false, false, vinculo?.tipo ?? null, fechaRechazada, demorada)
  );
  const inicio = Date.now();
  const nota = notaRevision(fechaRechazada, demorada, licencia, ctx?.requisitos?.licencias);
  const r = await generarRespuesta(config, claves, sistema, [...construirHistorial(historial), { role: "user", content: nota }]);
  const { texto, motivo } = decidirRespuesta(r, ctx?.autorizacion ?? "");
  const base = { conversacionId, config, modeloUsado: r.modeloUsado, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, duracionMs: Date.now() - inicio };
  if (motivo || !texto.trim()) {
    await registrarEjecucion({ ...base, resultado: "error", error: "Seguimiento de la revisión sin texto para enviar." });
    return;
  }
  // Otra vez: si alguien tomó el chat o la persona escribió mientras el modelo pensaba, no sale.
  const { data: despues } = await db.from("wa_conversaciones").select("agente_pausado").eq("id", conversacionId).maybeSingle();
  const { data: ultimo } = await db
    .from("wa_mensajes")
    .select("direccion")
    .eq("conversacion_id", conversacionId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!despues || despues.agente_pausado || ultimo?.direccion !== "saliente") return;
  const ok = await enviarComoAgente(conversacionId, telefono, texto);
  await registrarEjecucion({ ...base, resultado: ok ? "respondido" : "error", error: ok ? undefined : "WhatsApp rechazó el envío del seguimiento." });
}

/**
 * El cron terminó una verificación que se había demorado (RNMC en curso o
 * reintentado tras un error de Croma): el asistente le escribe al aspirante
 * con el resultado, como le prometió. Igual que el seguimiento normal: no sale
 * si el agente está pausado, si está apagado o si la persona escribió después
 * (esa respuesta ya lo cubre). Nunca lanza.
 */
export async function avisarResultadoRevision(procesoId: string): Promise<void> {
  try {
    const { config, claves } = await getAgenteConClaves();
    if (!config.activo || config.preguntasRequisitos.trim() === "") return;
    const db = createAdminClient();
    const { data: conv } = await db
      .from("wa_conversaciones")
      .select("id, ultimo_entrante_at, wa_contactos(telefono, nombre)")
      .eq("proceso_id", procesoId)
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!conv) return;
    // Fuera de la ventana de 24 h de WhatsApp no se puede escribir texto libre.
    const ultimoEntrante = Date.parse((conv.ultimo_entrante_at as string | null) ?? "");
    if (!Number.isFinite(ultimoEntrante) || Date.now() - ultimoEntrante > 23 * 3_600_000) return;
    const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as { telefono: string; nombre: string | null } | null;
    if (!contacto?.telefono) return;
    const { data: medios } = await db
      .from("wa_mensajes")
      .select("media_tipo")
      .eq("conversacion_id", conv.id)
      .eq("direccion", "entrante")
      .not("media_tipo", "is", null)
      .limit(200);
    const recibidos = resumirRecibidos((medios ?? []).map((m) => ({ direccion: "entrante", mediaTipo: m.media_tipo })));
    await enviarSeguimientoRevision(conv.id as string, contacto.telefono, contacto.nombre, config, claves, recibidos);
  } catch (e) {
    console.error("[seleccion] aviso del resultado de la revisión:", e);
  }
}

/**
 * Responde al mensaje entrante `mensajeId` si el agente está activo y la
 * conversación no la tiene un humano. Espera unos segundos y solo sigue si
 * ese mensaje sigue siendo el último: así una ráfaga de mensajes recibe una
 * sola respuesta (la del último) y no se pisa con alguien que contestó a mano.
 * Sin espera cuando lo pide una persona (al devolverle el chat a la IA).
 */
export async function responderConAgente(
  conversacionId: string,
  mensajeId: string,
  opciones: { esperar?: boolean } = {}
): Promise<void> {
  const { config, claves } = await getAgenteConClaves();
  if (!config.activo) return;

  const db = createAdminClient();
  const estado = async () => {
    const { data } = await db
      .from("wa_conversaciones")
      .select("agente_pausado, wa_contactos(telefono, nombre)")
      .eq("id", conversacionId)
      .maybeSingle();
    return data;
  };

  const inicial = await estado();
  if (!inicial || inicial.agente_pausado) return;

  if (opciones.esperar !== false && config.esperaSegundos > 0) await esperar(config.esperaSegundos * 1000);

  // Tras la espera: ¿sigue activo y este sigue siendo el último mensaje?
  const conv = await estado();
  if (!conv || conv.agente_pausado) return;
  const { data: ultimo } = await db
    .from("wa_mensajes")
    .select("id")
    .eq("conversacion_id", conversacionId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultimo?.id !== mensajeId) return;

  const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as
    | { telefono: string; nombre: string | null }
    | null;
  if (!contacto?.telefono) return;

  await esperarMediosPendientes(conversacionId).catch(() => {});

  // Foto nueva (cédula): se lee antes de responder, para que el asistente
  // muestre lo leído y pida confirmarlo en vez de preguntar los datos.
  if (config.preguntasRequisitos.trim() !== "") {
    await Promise.race([
      leerFotosPendientes(conversacionId, config, claves).catch((e) => console.error("[seleccion] lectura de la foto:", e)),
      esperar(25_000),
    ]);
  }

  const historial = await historialConLecturas(conversacionId, mensajesALeer(config));

  if (pideHumano(textoReciente(historial), parsearFrases(config.frasesTransferencia))) {
    await transferir(conversacionId, contacto.telefono, "solicitud", config.mensajeTransferencia);
    await registrarEjecucion({ conversacionId, config, resultado: "transferido", error: "La persona pidió hablar con alguien." });
    return;
  }

  const turnos = construirHistorial(historial);
  if (turnos.length === 0) return;

  // Archivos de toda la conversación (no solo de la memoria del agente), para
  // que sepa qué documentos ya llegaron aunque el chat sea largo.
  const { data: medios } = await db
    .from("wa_mensajes")
    .select("media_tipo")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .not("media_tipo", "is", null)
    .limit(200);
  const recibidos = resumirRecibidos((medios ?? []).map((m) => ({ direccion: "entrante", mediaTipo: m.media_tipo })));

  // Con el proceso de selección activo, en paralelo con la respuesta se leen
  // los datos del aspirante y se crea o actualiza su proceso (A1, A4, A5). Va
  // en paralelo para que la respuesta no espere a Croma, y nunca hace fallar la respuesta.
  const enSeleccion = config.preguntasRequisitos.trim() !== "";
  // Con la autorización recién dada, el asistente avisa que está revisando y,
  // terminada la consulta del RUNT, manda el resultado (enviarSeguimientoRevision).
  // Ese segundo mensaje espera a que salga esta respuesta, para no adelantarse.
  let marcarEnviada: (texto: string | null) => void = () => {};
  const respuestaEnviada = new Promise<string | null>((ok) => (marcarEnviada = ok));
  let seguimientoHecho = false;
  const seguir = async (soloSiAviso: boolean) => {
    const enviado = await respuestaEnviada;
    if (!enviado || seguimientoHecho) return;
    const [licencia, fechaRechazada] = await Promise.all([
      licenciaVerificadaDeConversacion(conversacionId).catch(() => null),
      fechaRechazadaDeConversacion(conversacionId).catch(() => null),
    ]);
    // Sin aviso de espera, solo vale la pena escribir si hay algo que decirle
    // (la licencia no cumple o la fecha de expedición no coincide).
    if (soloSiAviso && !pareceAvisoDeRevision(enviado) && !fechaRechazada && (!licencia || licencia.estado === "cumple")) return;
    seguimientoHecho = true;
    await enviarSeguimientoRevision(conversacionId, contacto.telefono, contacto.nombre, config, claves, recibidos);
  };
  const extraccion = enSeleccion
    ? actualizarDesdeChat(conversacionId, config, claves, { trasRunt: () => seguir(true) }).catch((e) =>
        console.error("[seleccion] extracción:", e)
      )
    : Promise.resolve();
  // Si avisó que estaba revisando pero la extracción no llegó a consultar, igual se sigue.
  const terminar = async () => {
    marcarEnviada(null);
    await extraccion;
    const enviado = await respuestaEnviada;
    if (enSeleccion && enviado && !seguimientoHecho && pareceAvisoDeRevision(enviado) && (await autorizoEnElChat(conversacionId))) {
      await seguir(false).catch((e) => console.error("[seleccion] seguimiento de la revisión:", e));
    }
  };

  const inicio = Date.now();
  try {
    // ¿Ya es (o fue) conductor de la empresa? Con la cédula leída o la que acaba de escribir.
    const [ctx, licencia, enRevision, cerradoAntecedentes, vinculo, fechaRechazada, demorada] = enSeleccion
      ? await Promise.all([
          contextoSeleccion().catch(() => null),
          licenciaVerificadaDeConversacion(conversacionId).catch(() => null),
          antecedentesEnRevisionDeConversacion(conversacionId).catch(() => false),
          cerradoPorAntecedentesDeConversacion(conversacionId).catch(() => false),
          vinculoDeConversacion(conversacionId).catch(() => null),
          fechaRechazadaDeConversacion(conversacionId).catch(() => null),
          verificacionDemoradaDeConversacion(conversacionId).catch(() => false),
        ])
      : [null, null, false, false, null, null, false];
    // Entrega 2: con una cita en pie, el asistente responde cuándo y dónde es (y no mueve fechas).
    const cita = enSeleccion ? await citaDeConversacion(conversacionId).catch(() => null) : null;
    // Vuelve después de un cierre automático: el asistente retoma y pregunta de nuevo lo que lo descartó.
    const regreso = enSeleccion ? await regresoDeConversacion(conversacionId).catch(() => null) : null;
    const sistema = construirSistema(config.prompt, contacto.nombre, new Date(), {
      ...reglasSeleccion(
        config,
        recibidos,
        ctx?.autorizacion ?? "",
        ctx?.requisitos ?? null,
        licencia,
        false,
        enRevision,
        cerradoAntecedentes,
        vinculo?.tipo ?? null,
        fechaRechazada,
        demorada
      ),
      cita,
      regreso,
    });
    const r = await generarRespuesta(config, claves, sistema, turnos);
    const duracionMs = Date.now() - inicio;
    const decision = decidirRespuesta(r, ctx?.autorizacion ?? "");
    const { motivo } = decision;
    let texto = decision.texto;
    const base = { conversacionId, config, modeloUsado: r.modeloUsado, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, duracionMs };

    // Entrega 2: la persona eligió otro día y el asistente movió la cita con la marca.
    if (decision.reprogramar && cita && !motivo) {
      const { data: conv } = await createAdminClient().from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
      const movida = conv?.proceso_id
        ? await reprogramarPorAsistente(conv.proceso_id as string, decision.reprogramar, ACTOR_AGENTE).catch(() => ({ ok: false as const }))
        : { ok: false as const };
      if (!movida.ok) {
        // No se pudo mover (el día ya no sirve o cambió algo): no se le confirma una fecha falsa.
        texto = "Déjame confirmar ese día con Gestión Humana y te escribimos enseguida para dejar lista tu nueva cita.";
        await createAdminClient().from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conversacionId);
      }
    }

    if (motivo) {
      // El modelo ya escribió su propia despedida; si no, va la configurada.
      await transferir(conversacionId, contacto.telefono, "agente", texto || config.mensajeTransferencia);
      await registrarEjecucion({ ...base, resultado: "transferido", error: motivo === "marca" ? undefined : MOTIVO_TRANSFERENCIA[motivo] });
      await terminar();
      return;
    }

    // Si alguien contestó a mano mientras el modelo pensaba, el agente se calla.
    const despues = await estado();
    if (!despues || despues.agente_pausado) {
      await terminar();
      return;
    }

    const ok = await enviarComoAgente(conversacionId, contacto.telefono, texto);
    marcarEnviada(ok ? texto : null);
    await registrarEjecucion({ ...base, resultado: ok ? "respondido" : "error", error: ok ? undefined : "WhatsApp rechazó el envío." });
    await terminar();
  } catch (e) {
    // Si el proveedor falla, la persona no recibe nada raro: queda para un humano.
    await pausarAgente(conversacionId, "agente", true);
    await registrarEjecucion({
      conversacionId,
      config,
      duracionMs: Date.now() - inicio,
      resultado: "error",
      error: e instanceof Error ? e.message : String(e),
    });
    console.error("agente whatsapp:", e);
    await terminar();
  }
}
