"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import {
  getAgenteConClaves,
  getAgenteConfig,
  mensajesALeer,
  type NivelCosto,
  type Proveedor,
} from "./config";
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
  type MotivoTransferencia,
} from "./motor";
import { generarRespuesta } from "./proveedores";
import { configDesdeFormulario, type AgenteFormulario } from "./formulario";
import { responderConAgente } from "./responder";
import { SISTEMA_EXTRACCION, interpretarExtraccion, transcribir, type DatosPrefiltro } from "@/lib/seleccion/extraccion";
import { contextoSeleccion } from "@/lib/seleccion/servidor";

export type { AgenteFormulario };

const MAX_LISTA = 3000;
const PROVEEDORES: Proveedor[] = ["anthropic", "openai", "openrouter"];
const NIVELES: NivelCosto[] = ["low", "medium", "high"];

function validar(f: AgenteFormulario): string | null {
  if (!PROVEEDORES.includes(f.proveedor)) return "Proveedor no válido.";
  if (!NIVELES.includes(f.openrouterNivelCosto)) return "Nivel de costo no válido.";
  if (f.openrouterModo !== "auto" && f.openrouterModo !== "manual") return "Modo de OpenRouter no válido.";
  if (f.proveedor === "openrouter" && f.openrouterModo === "manual" && !f.modelo.trim()) {
    return "Indica el modelo de OpenRouter (el recomendado es anthropic/claude-haiku-5.5) o usa el modo automático.";
  }
  if (!Number.isInteger(f.mensajesHistorial) || f.mensajesHistorial < 2 || f.mensajesHistorial > 60) {
    return "El historial debe estar entre 2 y 60 mensajes.";
  }
  if (!Number.isInteger(f.esperaSegundos) || f.esperaSegundos < 0 || f.esperaSegundos > 20) {
    return "La espera debe estar entre 0 y 20 segundos.";
  }
  if (!Number.isInteger(f.intentosSinEntender) || f.intentosSinEntender < 1 || f.intentosSinEntender > 5) {
    return "Las veces que pide aclarar deben estar entre 1 y 5.";
  }
  if ([f.preguntasRequisitos, f.documentosRequeridos, f.temasReservados].some((l) => l.length > MAX_LISTA)) {
    return `Cada lista del proceso de selección admite hasta ${MAX_LISTA} caracteres.`;
  }
  if (f.respuestaReservada.length > 500) return "La respuesta para los temas reservados admite hasta 500 caracteres.";
  if (f.activo && !f.prompt.trim()) return "Escribe el prompt antes de activar el agente.";
  return null;
}

/** Configuración del formulario con las API keys de Configuración → Proveedores de IA. */
async function resolver(f: AgenteFormulario) {
  const { claves } = await getAgenteConClaves();
  return { config: configDesdeFormulario(f), claves };
}

/** Guarda la configuración del agente (solo administradores). */
export async function guardarAgente(f: AgenteFormulario): Promise<{ ok: boolean; error?: string }> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) return { ok: false, error: "Solo el administrador puede configurar el agente." };
  const error = validar(f);
  if (error) return { ok: false, error };

  const { claves } = await resolver(f);
  if (f.activo && !claves[f.proveedor]) {
    return { ok: false, error: "Ese proveedor no tiene API key: agrégala en Configuración → Proveedores de IA." };
  }

  const db = createAdminClient();
  const { error: eDb } = await db.from("wa_agente").upsert({
    id: 1,
    activo: f.activo,
    proveedor: f.proveedor,
    modelo: f.modelo.trim() || null,
    openrouter_modo: f.openrouterModo,
    openrouter_nivel_costo: f.openrouterNivelCosto,
    openrouter_modelos_permitidos: f.openrouterModelosPermitidos.trim() || null,
    prompt: f.prompt,
    mensaje_transferencia: f.mensajeTransferencia.trim(),
    frases_transferencia: f.frasesTransferencia.trim(),
    mensajes_historial: f.mensajesHistorial,
    espera_segundos: f.esperaSegundos,
    preguntas_requisitos: f.preguntasRequisitos.trim(),
    documentos_requeridos: f.documentosRequeridos.trim(),
    temas_reservados: f.temasReservados.trim(),
    respuesta_reservada: f.respuestaReservada.trim(),
    transferir_al_completar: f.transferirAlCompletar,
    intentos_sin_entender: f.intentosSinEntender,
    actualizado_por: perms.userEmail ?? null,
    updated_at: new Date().toISOString(),
  });
  if (eDb) {
    // PostgREST responde PGRST204 (columna fuera del esquema) y Postgres 42703.
    if (eDb.code === "PGRST204" || eDb.code === "42703") {
      return {
        ok: false,
        error:
          "Falta aplicar la migración 20261110185651 (proceso de selección del agente) en el SQL Editor. El chat de prueba sí funciona sin ella.",
      };
    }
    return { ok: false, error: eDb.message };
  }

  revalidatePath("/comunicaciones/agente");
  revalidatePath("/comunicaciones");
  return { ok: true };
}

const MAX_MENSAJES_PRUEBA = 120;
const MAX_CARACTERES_PRUEBA = 2000;
const MEDIOS_PRUEBA = new Set(["image", "document", "audio", "video", "sticker"]);

export type ResultadoPrueba =
  | {
      ok: true;
      /** Texto que enviaría el agente (vacío si pasa directo por frase de transferencia). */
      texto: string;
      /** null = sigue la conversación; si no, pasaría a una persona por este motivo. */
      motivo: MotivoTransferencia | null;
      modeloUsado: string | null;
      tokensEntrada: number | null;
      tokensSalida: number | null;
      duracionMs: number;
      /** Datos del prefiltro que leería de la conversación (con el proceso de selección activo). */
      extraido?: DatosPrefiltro | null;
    }
  | { ok: false; error: string };

/**
 * Chat de prueba: responde al último mensaje de `mensajes` (toda la
 * conversación simulada) con lo que hay en el formulario, sin guardarlo, y
 * decide la transferencia igual que el chat real (responder.ts). No envía
 * nada por WhatsApp ni guarda nada en la base.
 */
export async function probarAgente(f: AgenteFormulario, mensajes: MensajeHistorial[]): Promise<ResultadoPrueba> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) return { ok: false, error: "Solo el administrador puede probar el agente." };
  if (!Array.isArray(mensajes) || mensajes.length === 0) return { ok: false, error: "Escribe un mensaje de prueba." };
  if (mensajes.length > MAX_MENSAJES_PRUEBA) {
    return { ok: false, error: `El chat de prueba admite hasta ${MAX_MENSAJES_PRUEBA} mensajes: reinícialo.` };
  }
  for (const m of mensajes) {
    if (m.direccion !== "entrante" && m.direccion !== "saliente") return { ok: false, error: "Mensaje de prueba no válido." };
    if (typeof m.contenido !== "string" || m.contenido.length > MAX_CARACTERES_PRUEBA) {
      return { ok: false, error: `Cada mensaje admite hasta ${MAX_CARACTERES_PRUEBA} caracteres.` };
    }
    if (m.mediaTipo !== null && !MEDIOS_PRUEBA.has(m.mediaTipo)) return { ok: false, error: "Tipo de archivo no válido." };
  }
  if (mensajes[mensajes.length - 1].direccion !== "entrante") {
    return { ok: false, error: "El último mensaje debe ser de la persona." };
  }
  const error = validar({ ...f, activo: false });
  if (error) return { ok: false, error };

  const { config, claves } = await resolver(f);

  // Igual que el chat real: una frase de transferencia pasa sin consultar al modelo.
  if (pideHumano(textoReciente(mensajes), parsearFrases(config.frasesTransferencia))) {
    return { ok: true, texto: "", motivo: "frase", modeloUsado: null, tokensEntrada: null, tokensSalida: null, duracionMs: 0 };
  }

  const historial = mensajes.slice(-mensajesALeer(config));
  const enSeleccion = config.preguntasRequisitos.trim() !== "";
  // Igual que el chat real: la extracción de datos corre en paralelo con la respuesta.
  const extraccion: Promise<DatosPrefiltro | null> = enSeleccion
    ? generarRespuesta(config, claves, SISTEMA_EXTRACCION, [
        { role: "user", content: transcribir(mensajes.map((m, i) => ({ ...m, id: String(i) }))).texto },
      ])
        .then((r) => interpretarExtraccion(r.texto))
        .catch(() => null)
    : Promise.resolve(null);
  const ctx = enSeleccion ? await contextoSeleccion().catch(() => null) : null;
  const inicio = Date.now();
  try {
    const r = await generarRespuesta(
      config,
      claves,
      construirSistema(config.prompt, null, new Date(), {
        ...reglasSeleccion(
          ctx?.respuestaReservada ? { ...config, respuestaReservada: ctx.respuestaReservada } : config,
          resumirRecibidos(mensajes),
          ctx?.autorizacion ?? "",
          ctx?.requisitos ?? null
        ),
        bienvenida: mensajes.some((m) => m.direccion === "saliente") ? "" : ctx?.bienvenida ?? "",
        nombreAsistente: ctx?.nombreAsistente ?? "",
        respuestas: ctx?.respuestas ?? [],
      }),
      construirHistorial(historial)
    );
    const { texto, motivo } = decidirRespuesta(r, ctx?.autorizacion ?? "");
    return {
      ok: true,
      extraido: await extraccion,
      texto,
      motivo,
      modeloUsado: r.modeloUsado,
      tokensEntrada: r.tokensEntrada,
      tokensSalida: r.tokensSalida,
      duracionMs: Date.now() - inicio,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "El proveedor no respondió." };
  }
}

/**
 * Pausa el agente en una conversación (un humano toma el control) o lo
 * reactiva. Reactivar también quita la marca "requiere humano" y, si el
 * cliente quedó esperando respuesta, la IA contesta de una vez leyendo la
 * conversación reciente (lo del cliente y lo que escribió el equipo).
 */
export async function alternarAgenteConversacion(
  conversacionId: string,
  activo: boolean
): Promise<{ ok: boolean; error?: string; aviso?: string }> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !perms.modules.includes("comunicaciones")) {
    return { ok: false, error: "Sin permiso para el módulo Comunicaciones." };
  }
  const db = createAdminClient();
  const { error } = await db
    .from("wa_conversaciones")
    .update(
      activo
        ? { agente_pausado: false, agente_motivo_pausa: null, agente_pausado_at: null, requiere_humano: false }
        : { agente_pausado: true, agente_motivo_pausa: "manual", agente_pausado_at: new Date().toISOString(), requiere_humano: false }
    )
    .eq("id", conversacionId);
  if (error) return { ok: false, error: `No se pudo cambiar el agente: ${error.message}` };
  revalidatePath("/comunicaciones");
  if (!activo) return { ok: true };

  const config = await getAgenteConfig();
  if (!config.activo) return { ok: true, aviso: "El agente está apagado: responderá cuando lo enciendas." };

  const { data: ultimo } = await db
    .from("wa_mensajes")
    .select("id, direccion, timestamp")
    .eq("conversacion_id", conversacionId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultimo || ultimo.direccion !== "entrante") {
    return { ok: true, aviso: "La IA retoma el chat: no hay nada pendiente del contacto, responderá cuando escriba." };
  }
  if (Date.now() - new Date(ultimo.timestamp).getTime() > 24 * 60 * 60 * 1000) {
    return {
      ok: true,
      aviso: "La IA retoma el chat, pero la ventana de 24 h está cerrada: responderá cuando el contacto vuelva a escribir.",
    };
  }
  after(() =>
    responderConAgente(conversacionId, ultimo.id, { esperar: false }).catch((e) =>
      console.error("agente whatsapp (reactivar):", e)
    )
  );
  return { ok: true, aviso: "La IA está respondiendo el último mensaje del contacto…" };
}
