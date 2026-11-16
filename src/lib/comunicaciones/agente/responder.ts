/**
 * Respuesta automática del agente a un mensaje entrante. La dispara el
 * webhook de WhatsApp con after(), ya respondido el 200 a Meta, así que nada
 * de esto bloquea ni hace reintentar el webhook.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto } from "../whatsapp";
import { registrarSaliente } from "../registro";
import { getAgenteConClaves, mensajesALeer, modeloSolicitado, type AgenteConfig } from "./config";
import {
  MOTIVO_TRANSFERENCIA,
  construirHistorial,
  construirSistema,
  decidirRespuesta,
  parsearFrases,
  pideHumano,
  reglasSeleccion,
  resumirRecibidos,
  textoReciente,
  type MensajeHistorial,
} from "./motor";
import { generarRespuesta } from "./proveedores";
import { actualizarDesdeChat } from "@/lib/seleccion/proceso-desde-chat";
import { contextoSeleccion, licenciaVerificadaDeConversacion } from "@/lib/seleccion/servidor";

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

  const { data: filas } = await db
    .from("wa_mensajes")
    .select("direccion, contenido, media_tipo")
    .eq("conversacion_id", conversacionId)
    .order("timestamp", { ascending: false })
    .limit(mensajesALeer(config));
  const historial: MensajeHistorial[] = (filas ?? [])
    .reverse()
    .map((m) => ({ direccion: m.direccion as "entrante" | "saliente", contenido: m.contenido ?? "", mediaTipo: m.media_tipo }));

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
  // en paralelo para caber en los 60 s del webhook, y nunca hace fallar la respuesta.
  const enSeleccion = config.preguntasRequisitos.trim() !== "";
  const extraccion = enSeleccion
    ? actualizarDesdeChat(conversacionId, config, claves).catch((e) => console.error("[seleccion] extracción:", e))
    : Promise.resolve();

  const inicio = Date.now();
  try {
    const [ctx, licencia] = enSeleccion
      ? await Promise.all([
          contextoSeleccion().catch(() => null),
          licenciaVerificadaDeConversacion(conversacionId).catch(() => null),
        ])
      : [null, null];
    const sistema = construirSistema(
      config.prompt,
      contacto.nombre,
      new Date(),
      reglasSeleccion(config, recibidos, ctx?.autorizacion ?? "", ctx?.requisitos ?? null, licencia)
    );
    const r = await generarRespuesta(config, claves, sistema, turnos);
    const duracionMs = Date.now() - inicio;
    const { texto, motivo } = decidirRespuesta(r, ctx?.autorizacion ?? "");
    const base = { conversacionId, config, modeloUsado: r.modeloUsado, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, duracionMs };

    if (motivo) {
      // El modelo ya escribió su propia despedida; si no, va la configurada.
      await transferir(conversacionId, contacto.telefono, "agente", texto || config.mensajeTransferencia);
      await registrarEjecucion({ ...base, resultado: "transferido", error: motivo === "marca" ? undefined : MOTIVO_TRANSFERENCIA[motivo] });
      await extraccion;
      return;
    }

    // Si alguien contestó a mano mientras el modelo pensaba, el agente se calla.
    const despues = await estado();
    if (!despues || despues.agente_pausado) {
      await extraccion;
      return;
    }

    const ok = await enviarComoAgente(conversacionId, contacto.telefono, texto);
    await registrarEjecucion({ ...base, resultado: ok ? "respondido" : "error", error: ok ? undefined : "WhatsApp rechazó el envío." });
    await extraccion;
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
    await extraccion;
  }
}
