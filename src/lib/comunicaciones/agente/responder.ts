/**
 * Respuesta automática del agente a un mensaje entrante. La dispara el
 * webhook de WhatsApp con after(), ya respondido el 200 a Meta, así que nada
 * de esto bloquea ni hace reintentar el webhook.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto } from "../whatsapp";
import { registrarSaliente } from "../registro";
import { getAgenteConClaves, modeloSolicitado, type AgenteConfig } from "./config";
import {
  construirHistorial,
  construirSistema,
  interpretarRespuesta,
  parsearFrases,
  pideHumano,
  type MensajeHistorial,
} from "./motor";
import { generarRespuesta } from "./proveedores";

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
    .limit(config.mensajesHistorial);
  const historial: MensajeHistorial[] = (filas ?? [])
    .reverse()
    .map((m) => ({ direccion: m.direccion as "entrante" | "saliente", contenido: m.contenido ?? "", mediaTipo: m.media_tipo }));

  // Lo que la persona escribió desde la última respuesta, para buscar las frases de transferencia.
  const recientes: string[] = [];
  for (let i = historial.length - 1; i >= 0 && historial[i].direccion === "entrante"; i--) {
    recientes.unshift(historial[i].contenido);
  }
  if (pideHumano(recientes.join("\n"), parsearFrases(config.frasesTransferencia))) {
    await transferir(conversacionId, contacto.telefono, "solicitud", config.mensajeTransferencia);
    await registrarEjecucion({ conversacionId, config, resultado: "transferido", error: "La persona pidió hablar con alguien." });
    return;
  }

  const turnos = construirHistorial(historial);
  if (turnos.length === 0) return;

  const inicio = Date.now();
  try {
    const sistema = construirSistema(config.prompt, contacto.nombre, new Date());
    const r = await generarRespuesta(config, claves, sistema, turnos);
    const duracionMs = Date.now() - inicio;
    const { texto, transferir: pideTransferir } = interpretarRespuesta(r.texto);
    const base = { conversacionId, config, modeloUsado: r.modeloUsado, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, duracionMs };

    if (r.rechazo || pideTransferir || !texto) {
      // El modelo ya escribió su propia despedida; si no, va la configurada.
      await transferir(conversacionId, contacto.telefono, "agente", texto || config.mensajeTransferencia);
      await registrarEjecucion({ ...base, resultado: "transferido", error: r.rechazo ? "El modelo se negó a responder." : undefined });
      return;
    }

    // Si alguien contestó a mano mientras el modelo pensaba, el agente se calla.
    const despues = await estado();
    if (!despues || despues.agente_pausado) return;

    const ok = await enviarComoAgente(conversacionId, contacto.telefono, texto);
    await registrarEjecucion({ ...base, resultado: ok ? "respondido" : "error", error: ok ? undefined : "WhatsApp rechazó el envío." });
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
  }
}
