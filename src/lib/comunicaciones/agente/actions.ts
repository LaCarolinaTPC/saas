"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { getAgenteConClaves, type AgenteConfig, type NivelCosto, type ModoOpenRouter, type Proveedor } from "./config";
import { construirSistema, construirHistorial, interpretarRespuesta } from "./motor";
import { generarRespuesta } from "./proveedores";

export interface AgenteFormulario {
  activo: boolean;
  proveedor: Proveedor;
  modelo: string;
  openrouterModo: ModoOpenRouter;
  openrouterNivelCosto: NivelCosto;
  openrouterModelosPermitidos: string;
  prompt: string;
  mensajeTransferencia: string;
  frasesTransferencia: string;
  mensajesHistorial: number;
  esperaSegundos: number;
}

const PROVEEDORES: Proveedor[] = ["anthropic", "openai", "openrouter"];
const NIVELES: NivelCosto[] = ["low", "medium", "high"];

function validar(f: AgenteFormulario): string | null {
  if (!PROVEEDORES.includes(f.proveedor)) return "Proveedor no válido.";
  if (!NIVELES.includes(f.openrouterNivelCosto)) return "Nivel de costo no válido.";
  if (f.openrouterModo !== "auto" && f.openrouterModo !== "manual") return "Modo de OpenRouter no válido.";
  if (f.proveedor === "openrouter" && f.openrouterModo === "manual" && !f.modelo.trim()) {
    return "Indica el modelo de OpenRouter (p. ej. google/gemini-2.5-flash) o usa el modo automático.";
  }
  if (!Number.isInteger(f.mensajesHistorial) || f.mensajesHistorial < 2 || f.mensajesHistorial > 60) {
    return "El historial debe estar entre 2 y 60 mensajes.";
  }
  if (!Number.isInteger(f.esperaSegundos) || f.esperaSegundos < 0 || f.esperaSegundos > 20) {
    return "La espera debe estar entre 0 y 20 segundos.";
  }
  if (f.activo && !f.prompt.trim()) return "Escribe el prompt antes de activar el agente.";
  return null;
}

/** Configuración del formulario con las API keys de Configuración → Proveedores de IA. */
async function resolver(f: AgenteFormulario) {
  const { claves } = await getAgenteConClaves();
  const config: AgenteConfig = {
    activo: f.activo,
    proveedor: f.proveedor,
    modelo: f.modelo.trim() || null,
    openrouterModo: f.openrouterModo,
    openrouterNivelCosto: f.openrouterNivelCosto,
    openrouterModelosPermitidos: f.openrouterModelosPermitidos.trim() || null,
    prompt: f.prompt,
    mensajeTransferencia: f.mensajeTransferencia,
    frasesTransferencia: f.frasesTransferencia,
    mensajesHistorial: f.mensajesHistorial,
    esperaSegundos: f.esperaSegundos,
  };
  return { config, claves };
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
    actualizado_por: perms.userEmail ?? null,
    updated_at: new Date().toISOString(),
  });
  if (eDb) return { ok: false, error: eDb.message };

  revalidatePath("/comunicaciones/agente");
  revalidatePath("/comunicaciones");
  return { ok: true };
}

/**
 * Prueba el agente con lo que hay en el formulario (sin guardarlo) y un
 * mensaje de ejemplo. No envía nada por WhatsApp.
 */
export async function probarAgente(
  f: AgenteFormulario,
  mensajePrueba: string
): Promise<
  | { ok: true; texto: string; transferir: boolean; modeloUsado: string; tokensEntrada: number | null; tokensSalida: number | null; duracionMs: number }
  | { ok: false; error: string }
> {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) return { ok: false, error: "Solo el administrador puede probar el agente." };
  if (!mensajePrueba.trim()) return { ok: false, error: "Escribe un mensaje de prueba." };
  const error = validar({ ...f, activo: false });
  if (error) return { ok: false, error };

  const { config, claves } = await resolver(f);
  const inicio = Date.now();
  try {
    const r = await generarRespuesta(
      config,
      claves,
      construirSistema(config.prompt, null, new Date()),
      construirHistorial([{ direccion: "entrante", contenido: mensajePrueba, mediaTipo: null }])
    );
    const { texto, transferir } = interpretarRespuesta(r.texto);
    return {
      ok: true,
      texto: r.rechazo ? "(El modelo se negó a responder: la conversación pasaría a un humano.)" : texto,
      transferir: transferir || r.rechazo,
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
 * reactiva. Reactivar también quita la marca "requiere humano".
 */
export async function alternarAgenteConversacion(
  conversacionId: string,
  activo: boolean
): Promise<{ ok: boolean; error?: string }> {
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
  return { ok: true };
}
