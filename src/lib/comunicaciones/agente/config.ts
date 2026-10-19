/**
 * Configuración del agente de IA (tabla wa_agente, una sola fila). Las API
 * keys no viven aquí: se administran en Configuración → Proveedores de IA
 * (src/lib/ia/claves.ts) y el agente usa la del proveedor elegido.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getClavesIA } from "@/lib/ia/claves";
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
  const [fila, claves] = await Promise.all([leerFila(), getClavesIA()]);
  return { config: aConfig(fila), claves };
}
