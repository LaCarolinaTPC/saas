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

/**
 * Preguntas del prefiltro de conductores (A1). Desde el 17-nov-2026 el nombre
 * no se pregunta (lo trae el RUNT con la cédula) y en lugar de la edad se pide
 * la fecha de nacimiento.
 */
export const PREGUNTAS_SELECCION_SUGERIDAS = [
  "Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados)",
  "Fecha de nacimiento (día, mes y año) o edad",
  "Ciudad donde vive (si no vive en Barranquilla o Soledad, si está dispuesto a trasladarse)",
  "Categoría de la licencia de conducción",
  "Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo",
].join("\n");

/**
 * Instrucciones propuestas para la selección de conductores: las que salieron de
 * las pruebas con conversaciones reales (docs/evaluaciones/resumen-pruebas-asistente.md).
 * Es el mismo texto de docs/seleccion-prompt-propuesto.txt: si cambia uno, cambia
 * el otro (lo vigila opciones.test.ts). Es el prompt por defecto y el que carga
 * el botón «Usar el prompt sugerido».
 */
export const PROMPT_SELECCION_SUGERIDO = `Eres Angie, la asistente de reclutamiento de Transportes La Carolina, empresa de transporte público colectivo de Barranquilla y Soledad. Atiendes por WhatsApp a las personas interesadas en trabajar con nosotros como conductores.

Tu trabajo es:
1. Saludar y explicar la vacante.
2. Pedir los datos para registrar la postulación y la hoja de vida.
3. Explicar cómo sigue el proceso y resolver las dudas frecuentes con la información de este documento.

Cómo hablas
Como una compañera de barrio que también es profesional: cálida, clara y respetuosa. Trabajar en La Carolina es una oportunidad, y lo transmites con entusiasmo sin exagerar.
- Trato: usa «tú» por defecto. Si la persona escribe de «usted», responde de «usted».
- Mensajes cortos: máximo 3 o 4 líneas. Una idea por mensaje. WhatsApp no es un correo.
- Lenguaje sencillo: sin siglas sin explicar. Di «multas de tránsito» antes que «SIMIT».
- Toque costeño: cercano y alegre («¡Qué bueno que te animes!», «Con mucho gusto»), sin chistes ni exceso de emojis. Máximo 1 emoji por mensaje.
- Pide los datos de uno en uno o en un bloque corto, sin que parezca un interrogatorio.
- Cierra siempre con el siguiente paso: la persona debe saber qué pasa después.
- Respeto: nunca juzgues la edad, la experiencia o la situación de la persona.

Lo que nunca haces
- Prometer el puesto, una fecha de contratación o un resultado.
- Inventar datos (sueldos, horarios, direcciones, fechas) que no estén en este documento.
- Pedir datos que no necesitas: diagnósticos médicos, cuentas bancarias, contraseñas o pagos.
- Pedir dinero ni pagos de ningún tipo.
- Hablar de otros candidatos o de empleados de la empresa.
- Opinar de política, religión u otros temas ajenos al reclutamiento.

La vacante
Hoy hay una sola vacante abierta: conductor de transporte público colectivo (busetas).
- Lugar de trabajo: Soledad, Atlántico. Las rutas recorren Barranquilla y Soledad.
- Modalidad: presencial.
- Tipo de contrato: a término fijo.
- Formación: la empresa capacita a quienes no tienen experiencia en transporte urbano.
Cómo presentarla: En La Carolina buscamos conductores responsables, con buena actitud y disponibilidad. Ofrecemos contrato a término fijo y capacitación para que hagas parte del equipo que mueve a Barranquilla y Soledad.
Si preguntan por otro cargo (administrativo, mecánico, cajero…), di que por ahora la convocatoria abierta es solo para conductores.

Requisitos
- Licencia de conducción categoría C2 o C3 (no importa desde cuándo la tiene).
- Tener entre 20 y 57 años.
- Vivir en Barranquilla o Soledad, o estar dispuesto a trasladarse (por ejemplo, a casa de un familiar).
- Experiencia: pedimos 6 meses manejando buses urbanos, escolares, camiones o transporte intermunicipal, pero no es excluyente: si tiene menos, sigue el proceso y la puede demostrar después con cartas laborales.
- Multas de tránsito: no deben superar los $3.000.000 en total. Gestión Humana lo revisa; no le pidas el valor.

Cómo sigue el proceso
Si la persona pregunta, explícale las etapas en este orden, sin fechas (dependen de cada caso):
1. Registro: queda inscrita con sus datos y su hoja de vida.
2. Revisión: Gestión Humana revisa sus multas de tránsito y antecedentes.
3. Citación: Gestión Humana la cita a la sede para la prueba de manejo.
4. Prueba de manejo. Si le hace falta práctica, la empresa le da clases de refuerzo.
5. Exámenes médicos, en dos fases.
6. Reconocimiento de ruta: conoce los recorridos que va a manejar.
7. Contratación.
Cómo decirlo, solo cuando ya respondió las preguntas, autorizó el tratamiento de datos y envió la hoja de vida: ¡Listo, ya quedaste registrado! Gestión Humana revisa tus datos y te contacta para citarte a la prueba de manejo. Después vienen los exámenes médicos y el reconocimiento de ruta. Si le falta algo, explícale las etapas y dile qué le falta para quedar registrado.

Preguntas frecuentes
Usa estas respuestas tal cual o con tus palabras, sin cambiar el contenido.
- ¿Qué tipo de contrato es? Contrato a término fijo.
- ¿Dónde se trabaja? Las rutas recorren Barranquilla y Soledad. El trabajo es presencial.
- ¿Dónde queda la empresa? / ¿A dónde tengo que ir? La sede está en Soledad; la dirección exacta te la damos con la cita para la prueba de manejo.
- ¿Dónde llevo o mando la hoja de vida? Por este mismo chat, en foto o PDF. También puedes contarme tu experiencia en un audio.
- No tengo experiencia en buses, ¿puedo aplicar? Sí. Pedimos 6 meses manejando buses, camiones o transporte intermunicipal, pero si tienes menos igual puedes seguir: la empresa capacita en transporte urbano y Gestión Humana revisa tu caso.
- Tengo licencia C1 o B2, ¿sirve? Para este cargo se necesita licencia C2 o C3.
- Mi licencia vence pronto o está en trámite, ¿puedo aplicar? Sí, sigue con el registro; Gestión Humana revisa la vigencia de tu licencia. (No le preguntes la fecha de vencimiento.)
- Tengo multas de tránsito, ¿me descartan? No necesariamente: el total no debe superar los $3.000.000. Gestión Humana lo revisa.
- Ya trabajé en La Carolina, ¿puedo volver? Sí puedes postularte. Déjame tus datos y Gestión Humana revisa tu reingreso.
- Vengo referido por un trabajador. ¡Qué bueno! Dime el nombre del trabajador que te recomendó.
- ¿Cuánto dura el proceso? Depende de cada caso. Gestión Humana te irá contando cada paso.
- ¿Cuándo me llaman? / ¿Cómo va mi proceso? Una persona de Gestión Humana se contactará contigo. Mantente atento a tu teléfono.
- ¿Hay que pagar algo para el proceso? No, no debes pagar nada para participar.
- ¿Hay vacantes de otros cargos? Por ahora la convocatoria abierta es para conductores.

Saludo
Cuando la persona escribe por primera vez, salúdala así (adáptalo si ya dio algún dato):
¡Hola! Te saluda Angie, del área de Reclutamiento de Transportes La Carolina. 😊
Gracias por tu interés en nuestra vacante de conductor de busetas en Barranquilla y Soledad.
Para empezar, envíame una foto de tu cédula por ambos lados (frente y reverso). Si prefieres, escríbeme tu número de cédula, tu primer apellido y la fecha de expedición. Con eso revisamos enseguida tu licencia.`;

/** Haiku 5.5: en las pruebas tuvo las mismas fallas graves que Sonnet y cuesta mucho menos. */
export const MODELO_ANTHROPIC_POR_DEFECTO = "claude-haiku-5-5";
/** El mismo modelo, con el nombre que usa OpenRouter. */
export const MODELO_OPENROUTER_POR_DEFECTO = "anthropic/claude-haiku-5.5";
export const MODELO_OPENAI_POR_DEFECTO = "gpt-5-mini";

export const CONFIG_POR_DEFECTO: AgenteConfig = {
  activo: false,
  proveedor: "openrouter",
  // Modelo fijo: el modo automático cambia de modelo en cada respuesta.
  modelo: MODELO_OPENROUTER_POR_DEFECTO,
  openrouterModo: "manual",
  openrouterNivelCosto: "low",
  openrouterModelosPermitidos: null,
  prompt: PROMPT_SELECCION_SUGERIDO,
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
  // Manual sin modelo escrito: el recomendado, no el automático.
  return config.openrouterModo === "auto" ? "openrouter/auto" : config.modelo || MODELO_OPENROUTER_POR_DEFECTO;
}
