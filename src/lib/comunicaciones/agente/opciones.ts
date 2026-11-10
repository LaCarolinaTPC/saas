/**
 * Tipos, modelos ofrecidos y valores por defecto del agente de IA. Sin
 * dependencias de servidor, para que los use también la pantalla de configuración.
 */

import type { ProveedorIA } from "@/lib/ia/proveedores";

export type Proveedor = ProveedorIA;
export type ModoOpenRouter = "auto" | "manual";
export type NivelCosto = "low" | "medium" | "high";

export interface AgenteConfig {
  activo: boolean;
  proveedor: Proveedor;
  modelo: string | null;
  openrouterModo: ModoOpenRouter;
  openrouterNivelCosto: NivelCosto;
  openrouterModelosPermitidos: string | null;
  prompt: string;
  mensajeTransferencia: string;
  frasesTransferencia: string;
  mensajesHistorial: number;
  esperaSegundos: number;
  /** Proceso de selección: listas de una por línea; vacía = la regla no se incluye. */
  preguntasRequisitos: string;
  documentosRequeridos: string;
  temasReservados: string;
  respuestaReservada: string;
  transferirAlCompletar: boolean;
  intentosSinEntender: number;
}

export interface AgenteClaves {
  anthropic: string | null;
  openai: string | null;
  openrouter: string | null;
}

/** Modelos de Claude que se ofrecen, con su precio por millón de tokens (entrada / salida). */
export const MODELOS_ANTHROPIC = [
  { id: "claude-opus-5-5", nombre: "Claude Opus 5.5", precio: "US$4 / US$20" },
  { id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5", precio: "US$2 / US$10" },
  { id: "claude-haiku-5-5", nombre: "Claude Haiku 5.5", precio: "US$0,10 / US$0,50" },
] as const;

export const MODELO_ANTHROPIC_POR_DEFECTO = "claude-opus-5-5";
export const MODELO_OPENAI_POR_DEFECTO = "gpt-5-mini";

export const CONFIG_POR_DEFECTO: AgenteConfig = {
  activo: false,
  proveedor: "openrouter",
  modelo: null,
  openrouterModo: "auto",
  openrouterNivelCosto: "low",
  openrouterModelosPermitidos: null,
  prompt: "",
  mensajeTransferencia:
    "Listo, ya le paso tu mensaje a una persona del equipo. Te responderemos lo antes posible.",
  frasesTransferencia: "hablar con una persona\nhablar con un asesor\nasesor humano\ncon un humano\nagente humano",
  mensajesHistorial: 20,
  esperaSegundos: 6,
  // Mismos valores por defecto que la migración 20261110185651.
  preguntasRequisitos: [
    "Nombre completo",
    "Edad",
    "Categoría de la licencia de conducción y fecha de vencimiento",
    "Ciudad y barrio donde vive",
    "Experiencia como conductor (años y tipo de vehículo)",
    "Si ha trabajado antes en La Carolina",
  ].join("\n"),
  documentosRequeridos: [
    "Hoja de vida (foto, PDF o un audio contando tu experiencia)",
    "Foto de la licencia de conducción por ambos lados",
    "Foto de la cédula por ambos lados",
    "Cartas laborales (si aún no las tienes, puedes ir consiguiéndolas)",
  ].join("\n"),
  temasReservados: ["Salario o sueldo", "Horarios y turnos", "Forma y fechas de pago"].join("\n"),
  respuestaReservada: "Esa información te la da directamente uno de nuestros representantes cuando te contactemos.",
  transferirAlCompletar: true,
  intentosSinEntender: 2,
};

/**
 * Mensajes del chat que lee el agente. Con el proceso de selección activo
 * lee al menos 60: preguntas y documentos ocupan más de 20 mensajes, y con
 * menos memoria vuelve a preguntar lo que la persona ya respondió.
 */
export const MIN_HISTORIAL_SELECCION = 60;

export function mensajesALeer(config: AgenteConfig): number {
  const hayProceso = config.preguntasRequisitos.trim() !== "" || config.documentosRequeridos.trim() !== "";
  return hayProceso ? Math.max(config.mensajesHistorial, MIN_HISTORIAL_SELECCION) : config.mensajesHistorial;
}

/** Modelo efectivo según el proveedor (lo que se pide, no necesariamente lo que responde). */
export function modeloSolicitado(config: AgenteConfig): string {
  if (config.proveedor === "anthropic") return config.modelo || MODELO_ANTHROPIC_POR_DEFECTO;
  if (config.proveedor === "openai") return config.modelo || MODELO_OPENAI_POR_DEFECTO;
  return config.openrouterModo === "auto" ? "openrouter/auto" : config.modelo || "openrouter/auto";
}
