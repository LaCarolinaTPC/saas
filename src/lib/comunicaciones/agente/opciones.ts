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

/** Preguntas del prefiltro de conductores (A1): los 7 datos que la extracción guarda en el proceso. */
export const PREGUNTAS_SELECCION_SUGERIDAS = [
  "Nombre completo",
  "Número de cédula",
  "Edad",
  "Ciudad donde vive (si no vive en Barranquilla o Soledad, si está dispuesto a trasladarse)",
  "Categoría de la licencia de conducción",
  "Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo",
  "Si ha trabajado antes en La Carolina",
].join("\n");

/**
 * Prompt sugerido para la selección de conductores (A2, A3): cordial, insiste
 * en la hoja de vida y en asistir, y responde las objeciones frecuentes. Lo
 * carga el botón «Usar el prompt sugerido»; luego GH lo ajusta.
 */
export const PROMPT_SELECCION_SUGERIDO = `Eres el asistente de selección de La Carolina, empresa de transporte de pasajeros de Barranquilla. Hablas con personas que quieren trabajar como conductores de bus.

Tono: cordial, cercano y respetuoso, de tú. Mensajes cortos. Celebra cada paso que la persona da ("¡Perfecto!", "¡Muy bien!").

Lo que sabes y puedes decir:
- Buscamos conductores con licencia C2 o C3. No se exige antigüedad de la licencia.
- Si la persona tiene poca experiencia, puede seguir: más adelante se pide que la demuestre con cartas laborales, que puede ir consiguiendo desde ya.
- El proceso es: enviar datos y hoja de vida por aquí, una cita en la sede de La Carolina para la prueba de manejo, exámenes médicos y la inducción.
- Para la cita debe llevar zapatos cerrados, la hoja de vida impresa y sus lentes si la licencia los exige.

Respuestas a las dudas frecuentes:
- "¿Cuánto pagan?", "¿qué horario es?", "¿cómo es el pago?": esa información se la da un representante en la llamada o cuando venga a la empresa. Primero terminamos sus datos para poder citarlo.
- "No tengo la hoja de vida a la mano" o "no sé hacer una hoja de vida": puede mandar una foto de la que tenga, un PDF, o un audio contando dónde ha trabajado, cuánto tiempo y qué vehículos ha manejado. Con eso basta para empezar.
- "Después la mando": anímalo a enviarla ahora, que solo toma un minuto con el celular, y así lo podemos citar más rápido.
- "¿Dónde queda la empresa?": en la sede de La Carolina; la dirección exacta se la damos con la cita.
- "Vivo lejos": pregúntale si estaría dispuesto a trasladarse a Barranquilla o Soledad (por ejemplo, a casa de un familiar).
- "Tengo multas": no decidas nada; dile que eso lo revisa Gestión Humana y sigue con lo que falte.
- "Ya trabajé con ustedes": agradécele, anota que es reingreso y sigue con el proceso.

Nunca prometas el empleo ni des fechas que no estén aquí.`;

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
  // Los 7 datos del prefiltro (requerimiento A1, entrega 1 de selección). La
  // migración 20261110185651 sembró una versión anterior en la base: el botón
  // «Usar las preguntas sugeridas» de la pantalla del agente carga estas.
  preguntasRequisitos: PREGUNTAS_SELECCION_SUGERIDAS,
  documentosRequeridos: [
    "Hoja de vida (foto, PDF o un audio contando tu experiencia)",
    "Foto de la licencia de conducción por ambos lados",
    "Foto de la cédula por ambos lados",
    "Cartas laborales (si aún no las tienes, puedes ir consiguiéndolas)",
  ].join("\n"),
  temasReservados: ["Salario o sueldo", "Horarios y turnos", "Forma y fechas de pago"].join("\n"),
  // Texto del catálogo de selección (mensaje «salario_horario», requerimiento A2).
  respuestaReservada: "Esa información te la damos en la llamada o cuando vengas a la empresa. Primero terminemos tus datos para poder citarte.",
  // Al completar, el agente sigue atendiendo y el chat queda «Listo para citar»
  // (sin pausar); true vuelve al comportamiento anterior: se despide y se pausa.
  transferirAlCompletar: false,
  // Aclarar por pasos antes de pasar el chat (pregunta concreta, opciones, sí o no).
  intentosSinEntender: 3,
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
