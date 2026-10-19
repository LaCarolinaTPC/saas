/**
 * Configuración del agente de IA (tabla wa_agente, una sola fila). Las API
 * keys se guardan cifradas como las credenciales del canal; la de OpenAI, si
 * falta, se toma de Configuración (la misma de la transcripción).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAIKey } from "@/lib/settings";
import { descifrar } from "../cifrado";
import {
  CONFIG_POR_DEFECTO,
  type AgenteClaves,
  type AgenteConfig,
  type ModoOpenRouter,
  type NivelCosto,
  type Proveedor,
} from "./opciones";

export * from "./opciones";

interface FilaAgente {
  activo: boolean;
  proveedor: Proveedor;
  modelo: string | null;
  openrouter_modo: ModoOpenRouter;
  openrouter_nivel_costo: NivelCosto;
  openrouter_modelos_permitidos: string | null;
  anthropic_api_key: string | null;
  openai_api_key: string | null;
  openrouter_api_key: string | null;
  prompt: string;
  mensaje_transferencia: string;
  frases_transferencia: string;
  mensajes_historial: number;
  espera_segundos: number;
}

async function leerFila(): Promise<FilaAgente | null> {
  const db = createAdminClient();
  const { data } = await db.from("wa_agente").select("*").eq("id", 1).maybeSingle();
  return (data as FilaAgente | null) ?? null;
}

function aConfig(f: FilaAgente | null): AgenteConfig {
  if (!f) return CONFIG_POR_DEFECTO;
  return {
    activo: !!f.activo,
    proveedor: f.proveedor,
    modelo: f.modelo,
    openrouterModo: f.openrouter_modo,
    openrouterNivelCosto: f.openrouter_nivel_costo,
    openrouterModelosPermitidos: f.openrouter_modelos_permitidos,
    prompt: f.prompt ?? "",
    mensajeTransferencia: f.mensaje_transferencia,
    frasesTransferencia: f.frases_transferencia,
    mensajesHistorial: f.mensajes_historial,
    esperaSegundos: f.espera_segundos,
  };
}

export async function getAgenteConfig(): Promise<AgenteConfig> {
  return aConfig(await leerFila());
}

/** Configuración más las claves descifradas: solo para el servidor que llama al modelo. */
export async function getAgenteConClaves(): Promise<{ config: AgenteConfig; claves: AgenteClaves }> {
  const fila = await leerFila();
  const openaiGuardada = fila?.openai_api_key ? descifrar(fila.openai_api_key) : null;
  return {
    config: aConfig(fila),
    claves: {
      anthropic: fila?.anthropic_api_key ? descifrar(fila.anthropic_api_key) : null,
      openai: openaiGuardada || (await getOpenAIKey()),
      openrouter: fila?.openrouter_api_key ? descifrar(fila.openrouter_api_key) : null,
    },
  };
}

/** Qué claves hay guardadas, sin exponerlas, para la pantalla de configuración. */
export async function getEstadoClaves(): Promise<{ anthropic: boolean; openai: boolean; openaiDeConfiguracion: boolean; openrouter: boolean }> {
  const fila = await leerFila();
  const openaiConfiguracion = !fila?.openai_api_key && !!(await getOpenAIKey());
  return {
    anthropic: !!fila?.anthropic_api_key,
    openai: !!fila?.openai_api_key || openaiConfiguracion,
    openaiDeConfiguracion: openaiConfiguracion,
    openrouter: !!fila?.openrouter_api_key,
  };
}
