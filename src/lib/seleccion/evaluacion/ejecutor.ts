/**
 * Corre una conversación simulada con las mismas piezas del chat real
 * (responder.ts): frases de transferencia, reglas del sistema, el modelo
 * configurado, la extracción y el semáforo. No envía WhatsApp ni escribe en la
 * base. Lo usan el evaluador (`scripts/evaluar-asistente.mts`) y el chat de
 * prueba de la pantalla del agente.
 */
import type { AgenteClaves, AgenteConfig } from "@/lib/comunicaciones/agente/config";
import { mensajesALeer } from "@/lib/comunicaciones/agente/opciones";
import {
  construirHistorial,
  construirSistema,
  decidirRespuesta,
  parsearFrases,
  pideHumano,
  reglasSeleccion,
  resumirRecibidos,
  textoReciente,
  type MensajeHistorial,
  type RequisitosCargo,
} from "@/lib/comunicaciones/agente/motor";
import { generarRespuesta, generarRespuestaLocal, type RespuestaModelo } from "@/lib/comunicaciones/agente/proveedores";
import type { TurnoModelo } from "@/lib/comunicaciones/agente/motor";
import { SISTEMA_EXTRACCION, interpretarExtraccion, transcribir, type DatosPrefiltro } from "../extraccion";
import type { ReglasPreseleccion } from "../preseleccion";
import { simularPreseleccion, type MensajeSimulado, type ResultadoConversacion } from "../simulacion";
import type { TurnoCaso } from "./casos";

export interface ContextoSimulacion {
  config: AgenteConfig;
  claves: AgenteClaves;
  autorizacion: string;
  requisitos: RequisitosCargo | null;
  reglas: ReglasPreseleccion;
  nombreContacto?: string | null;
  ahora?: Date;
  /** Solo pruebas: todo (asistente, extracción y aspirante) va a un servidor local tipo LM Studio. */
  local?: { url: string; modelo: string | null };
}

function llamar(
  config: AgenteConfig,
  claves: AgenteClaves,
  sistema: string,
  turnos: TurnoModelo[],
  local?: ContextoSimulacion["local"]
): Promise<RespuestaModelo> {
  return local ? generarRespuestaLocal(local.url, local.modelo, sistema, turnos) : generarRespuesta(config, claves, sistema, turnos);
}

/** Extracción de los datos de una conversación ya escrita. */
export async function extraerDeConversacion(
  mensajes: MensajeSimulado[],
  config: AgenteConfig,
  claves: AgenteClaves,
  local?: ContextoSimulacion["local"]
): Promise<DatosPrefiltro | null> {
  if (!mensajes.some((m) => m.direccion === "entrante")) return null;
  const { texto } = transcribir(mensajes.map((m, i) => ({ ...m, id: String(i) })));
  try {
    const r = await llamar(config, claves, SISTEMA_EXTRACCION, [{ role: "user", content: texto }], local);
    return interpretarExtraccion(r.texto);
  } catch {
    return null;
  }
}

/** Una respuesta del asistente a la conversación tal como va. */
export async function responderSimulado(
  mensajes: MensajeSimulado[],
  ctx: ContextoSimulacion
): Promise<{ texto: string; motivo: "frase" | "marca" | "rechazo" | "vacio" | null; modelo: string | null; tokensEntrada: number; tokensSalida: number; ms: number }> {
  const historial: MensajeHistorial[] = mensajes;
  if (pideHumano(textoReciente(historial), parsearFrases(ctx.config.frasesTransferencia))) {
    return { texto: "", motivo: "frase", modelo: null, tokensEntrada: 0, tokensSalida: 0, ms: 0 };
  }
  const sistema = construirSistema(
    ctx.config.prompt,
    ctx.nombreContacto ?? null,
    ctx.ahora ?? new Date(),
    reglasSeleccion(ctx.config, resumirRecibidos(historial), ctx.autorizacion, ctx.requisitos)
  );
  const inicio = Date.now();
  const r = await llamar(ctx.config, ctx.claves, sistema, construirHistorial(historial.slice(-mensajesALeer(ctx.config))), ctx.local);
  const { texto, motivo } = decidirRespuesta(r, ctx.autorizacion);
  return {
    texto,
    motivo,
    modelo: r.modeloUsado,
    tokensEntrada: r.tokensEntrada ?? 0,
    tokensSalida: r.tokensSalida ?? 0,
    ms: Date.now() - inicio,
  };
}

/**
 * Corre todos los turnos del aspirante, uno por uno, con la respuesta real
 * del modelo entre turnos. Se detiene si la conversación pasa a una persona.
 */
export async function correrConversacion(turnos: TurnoCaso[], ctx: ContextoSimulacion, simit: number | null = 0): Promise<ResultadoConversacion> {
  const r: ResultadoConversacion = {
    mensajes: [],
    transferencia: null,
    extraido: null,
    preseleccion: null,
    tokensEntrada: 0,
    tokensSalida: 0,
    latencias: [],
    modelos: [],
  };
  try {
    for (let i = 0; i < turnos.length; i++) {
      const t = turnos[i];
      r.mensajes.push({ direccion: "entrante", contenido: t.texto ?? "", mediaTipo: t.media ?? null });
      const resp = await responderSimulado(r.mensajes, ctx);
      r.tokensEntrada += resp.tokensEntrada;
      r.tokensSalida += resp.tokensSalida;
      if (resp.ms) r.latencias.push(resp.ms);
      if (resp.modelo) r.modelos.push(resp.modelo);
      const texto = resp.motivo && !resp.texto ? ctx.config.mensajeTransferencia.trim() : resp.texto;
      if (texto) r.mensajes.push({ direccion: "saliente", contenido: texto, mediaTipo: null });
      if (resp.motivo) {
        r.transferencia = { turno: i + 1, motivo: resp.motivo };
        break;
      }
    }
    r.extraido = await extraerDeConversacion(r.mensajes, ctx.config, ctx.claves, ctx.local);
    r.preseleccion = simularPreseleccion(r.extraido, simit, ctx.reglas, ctx.ahora);
  } catch (e) {
    r.error = e instanceof Error ? e.message : String(e);
  }
  return r;
}

// ── Aspirante simulado ───────────────────────────────────────────────────────

/** Configuración barata para el aspirante simulado (no es el asistente que se evalúa). */
function configSimulador(ctx: ContextoSimulacion): AgenteConfig {
  return ctx.claves.openrouter
    ? { ...ctx.config, proveedor: "openrouter", openrouterModo: "auto", openrouterNivelCosto: "low", modelo: null }
    : ctx.config;
}

const SISTEMA_ASPIRANTE = (perfil: string, estilo: string) =>
  [
    "Eres una persona que busca trabajo como conductor de bus y chatea por WhatsApp con el asistente de selección de una empresa de transporte.",
    `Tus datos y lo que haces: ${perfil}`,
    `Cómo escribes: ${estilo || "Mensajes cortos y naturales, como en WhatsApp."}`,
    "Responde SOLO como esa persona, a lo último que te dijeron, en un solo mensaje corto. No inventes datos que no estén en tu perfil: si te preguntan algo que no está, responde algo razonable y corto.",
    "Si te piden la hoja de vida, responde exactamente [HOJA DE VIDA] y nada más (eso representa que envías el archivo).",
    "Si te piden la foto de la licencia, responde exactamente [FOTO LICENCIA]; si te piden la de la cédula, [FOTO CÉDULA]; si te piden las dos, [FOTO LICENCIA] [FOTO CÉDULA]. Si te piden otro documento que no tienes, dilo en una frase.",
    "No envíes dos veces lo mismo: si ya lo enviaste y te lo vuelven a pedir, di que ya lo mandaste.",
    "Si ya no te preguntan nada y la conversación terminó, responde exactamente [FIN].",
  ].join("\n");

/** Siguiente mensaje del aspirante simulado, o null si terminó. */
async function turnoAspirante(mensajes: MensajeSimulado[], perfil: string, estilo: string, ctx: ContextoSimulacion): Promise<TurnoCaso | null> {
  // Para el aspirante, los papeles se invierten: el asistente es «user».
  const turnos = mensajes
    .filter((m) => m.contenido || m.mediaTipo)
    .map((m) => ({
      role: (m.direccion === "saliente" ? "user" : "assistant") as "user" | "assistant",
      content: m.mediaTipo ? `[Envió ${m.mediaTipo}] ${m.contenido}`.trim() : m.contenido,
    }));
  while (turnos.length && turnos[0].role === "assistant") turnos.shift();
  if (!turnos.length) return null;
  const r = await llamar(configSimulador(ctx), ctx.claves, SISTEMA_ASPIRANTE(perfil, estilo), turnos, ctx.local);
  const texto = r.texto.trim();
  if (!texto || /\[FIN\]/i.test(texto)) return null;
  const licencia = /\[FOTO LICENCIA\]/i.test(texto);
  const cedula = /\[FOTO C[EÉ]DULA\]/i.test(texto);
  if (licencia || cedula) {
    return { media: "image", texto: licencia && cedula ? "licencia y cédula por ambos lados" : licencia ? "licencia por ambos lados" : "cédula por ambos lados" };
  }
  if (/\[(HOJA DE VIDA|DOCUMENTO)\]/i.test(texto)) return { media: "document", texto: "mi hoja de vida" };
  return { texto };
}

/**
 * Corre un caso: los turnos fijos y, si tiene perfil, sigue con el aspirante
 * simulado hasta que termine, pase a una persona o llegue a maxTurnos.
 */
export async function correrCaso(
  caso: { turnos: TurnoCaso[]; perfil?: string; estilo?: string; maxTurnos?: number; simit?: number },
  ctx: ContextoSimulacion,
  opciones: { simulador?: boolean } = {}
): Promise<ResultadoConversacion> {
  if (!caso.perfil || opciones.simulador === false) return correrConversacion(caso.turnos, ctx, caso.simit ?? 0);
  const max = caso.maxTurnos ?? 12;
  const turnos: TurnoCaso[] = [...caso.turnos];
  // Se corre turno a turno para que el aspirante responda a lo que le dicen.
  let r = await correrConversacion(turnos, ctx, caso.simit ?? 0);
  while (!r.transferencia && !r.error && turnos.length < max) {
    const siguiente = await turnoAspirante(r.mensajes, caso.perfil, caso.estilo ?? "", ctx).catch(() => null);
    if (!siguiente) break;
    turnos.push(siguiente);
    r = await continuarConversacion(r, siguiente, ctx);
  }
  // La extracción y el semáforo, una sola vez con la conversación completa.
  r.extraido = await extraerDeConversacion(r.mensajes, ctx.config, ctx.claves, ctx.local);
  r.preseleccion = simularPreseleccion(r.extraido, caso.simit ?? 0, ctx.reglas, ctx.ahora);
  return r;
}

/** Agrega un turno del aspirante y la respuesta del asistente a una conversación ya corrida. */
async function continuarConversacion(previo: ResultadoConversacion, turno: TurnoCaso, ctx: ContextoSimulacion): Promise<ResultadoConversacion> {
  const r: ResultadoConversacion = { ...previo, mensajes: [...previo.mensajes], latencias: [...previo.latencias], modelos: [...previo.modelos] };
  try {
    r.mensajes.push({ direccion: "entrante", contenido: turno.texto ?? "", mediaTipo: turno.media ?? null });
    const resp = await responderSimulado(r.mensajes, ctx);
    r.tokensEntrada += resp.tokensEntrada;
    r.tokensSalida += resp.tokensSalida;
    if (resp.ms) r.latencias.push(resp.ms);
    if (resp.modelo) r.modelos.push(resp.modelo);
    const texto = resp.motivo && !resp.texto ? ctx.config.mensajeTransferencia.trim() : resp.texto;
    if (texto) r.mensajes.push({ direccion: "saliente", contenido: texto, mediaTipo: null });
    if (resp.motivo) r.transferencia = { turno: r.mensajes.filter((m) => m.direccion === "entrante").length, motivo: resp.motivo };
  } catch (e) {
    r.error = e instanceof Error ? e.message : String(e);
  }
  return r;
}
