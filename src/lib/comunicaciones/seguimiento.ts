/**
 * Seguimiento a quien no responde en WhatsApp — reglas PURAS (sin E/S; se
 * prueban con `npm run test:comunicaciones`). Las aplica
 * `seguimiento-ejecutar.ts` cada 15 minutos.
 *
 * - **Recordatorio**: el último mensaje del chat es nuestro (de la IA, de
 *   alguien de GH o un recordatorio anterior), el aspirante lleva `horasEspera`
 *   sin responder y en este silencio se le han enviado menos de
 *   `maxRecordatorios` → se le envía `mensaje` («¿sigues interesado?»). Así
 *   cada recordatorio sale `horasEspera` después del anterior. Solo dentro del
 *   horario, con la ventana de 24 h de Meta abierta (fuera de ella WhatsApp no
 *   deja enviar texto libre) y mientras se esperan sus datos: si ya completó lo
 *   que se pide por el chat o su proceso pasó de la preselección, no.
 * - **Para GH**: se le enviaron todos los recordatorios (o se cerró la ventana
 *   antes), siguió sin responder `horasEscalar` horas después del último y no
 *   se ha marcado → el chat queda «Para humano» para que alguien decida.
 *
 * Un silencio termina cuando la persona vuelve a escribir: la cuenta vuelve a
 * cero y se le puede recordar otra vez si se queda callada.
 */

export interface ConfigSeguimiento {
  activo: boolean;
  horasEspera: number;
  mensaje: string;
  /** HH:MM, hora de Bogotá. */
  horaDesde: string;
  horaHasta: string;
  /**
   * Textos del 2.º recordatorio en adelante (el 1.º es `mensaje`). Si hay más
   * recordatorios que textos, se repite el último.
   */
  mensajesSiguientes: string[];
  /** 0 = no marcar para GH. */
  horasEscalar: number;
  /** Recordatorios por silencio (cada uno `horasEspera` después del anterior). */
  maxRecordatorios: number;
}

export const SEGUIMIENTO_POR_DEFECTO: ConfigSeguimiento = {
  activo: true,
  horasEspera: 2,
  // Guion de Gestión Humana del 19-nov-2026.
  mensaje: "¡Hola nuevamente! 👋\nNo queremos que pierdas la oportunidad de conocer lo que Transportes La Carolina tiene para ti.\nEstamos interesados en conocer tu perfil y avanzar contigo en nuestro proceso de selección.\nSi aún estás interesado, ¡respóndenos por este medio! Queremos saber de ti.",
  mensajesSiguientes: [
    "¡Tenemos grandes beneficios para ti y tu familia!\nAl vincularte con Transportes La Carolina podrás disfrutar de:\n🚘 Formación continua en nuestra Escuela de Conducción.\n🏠 Apoyo para alcanzar el sueño de tener vivienda propia.\n🗓️ Descansos programados.\n💰 Facilidades para préstamos.\n🎓 Convenios universitarios para ti y tu familia.\n👨‍👩‍👧‍👦 Actividades de integración familiar.\n¡Más que un empleo, queremos ofrecerte oportunidades para crecer!\n¿Te animas a continuar con tu postulación?",
    "🚍 ¡Esta oportunidad puede ser el comienzo de una nueva experiencia para ti!\nEn Transportes La Carolina queremos brindarte la oportunidad de crecer laboral y personalmente, con beneficios pensados también en tu bienestar y el de tu familia.\nNo dejes pasar la oportunidad de conocer todo lo que tenemos para ofrecerte. ¡Dar el primer paso está en tus manos!\n¿Qué esperas para postularte? Responde a este mensaje y te guiaremos para continuar con tu proceso de selección.",
  ],
  horaDesde: "07:00",
  horaHasta: "20:00",
  horasEscalar: 24,
  maxRecordatorios: 3,
};

export const MAX_RECORDATORIOS_TOPE = 10;

/** Lo que hace falta de una conversación para decidir. */
export interface ConversacionSeguimiento {
  ultimoMensajeAt: string;
  ultimoEntranteAt: string | null;
  /** El último mensaje lo enviamos nosotros (no el aspirante). */
  ultimoEsNuestro: boolean;
  seguimientoEnviadoAt: string | null;
  seguimientoEscaladoAt: string | null;
  requiereHumano: boolean;
  cerrada: boolean;
  /** Recordatorios enviados en el silencio de `seguimientoEnviadoAt` (0 si la columna aún no existe). */
  seguimientoConteo?: number;
  /**
   * Se esperan datos o documentos del aspirante. false si ya completó lo que
   * se pide por el chat, si su proceso pasó de la preselección (o se cerró) o
   * si no busca trabajo: entonces no tiene sentido preguntarle si sigue interesado.
   */
  esperaRespuesta?: boolean;
}

const HORA = 3_600_000;
/** Margen antes de que cierre la ventana de 24 h (el envío no debe llegar tarde). */
const MARGEN_VENTANA_MS = 15 * 60_000;
const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** HH:MM de Bogotá de un instante. */
export function horaBogota(ahora: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ahora);
}

/** ¿`ahora` está dentro del horario [desde, hasta)? (Admite horarios que cruzan la medianoche.) */
export function enHorario(ahora: Date, desde: string, hasta: string): boolean {
  const h = horaBogota(ahora);
  return desde <= hasta ? h >= desde && h < hasta : h >= desde || h < hasta;
}

/** La ventana de 24 h de Meta sigue abierta (con margen). */
export function ventanaAbierta(ultimoEntranteAt: string | null, ahora: Date): boolean {
  const t = ms(ultimoEntranteAt);
  return Number.isFinite(t) && ahora.getTime() - t < 24 * HORA - MARGEN_VENTANA_MS;
}

/** ¿Ya se le recordó en este silencio? (después de su último mensaje) */
export function yaRecordado(c: Pick<ConversacionSeguimiento, "seguimientoEnviadoAt" | "ultimoEntranteAt">): boolean {
  const env = ms(c.seguimientoEnviadoAt);
  if (!Number.isFinite(env)) return false;
  const ent = ms(c.ultimoEntranteAt);
  return !Number.isFinite(ent) || env > ent;
}

/** Cuántos recordatorios lleva en este silencio (0 si respondió después del último). */
export function recordatoriosEnviados(c: Pick<ConversacionSeguimiento, "seguimientoEnviadoAt" | "ultimoEntranteAt" | "seguimientoConteo">): number {
  if (!yaRecordado(c)) return 0;
  // Los enviados antes de que existiera la cuenta valen por uno.
  return Math.max(1, c.seguimientoConteo ?? 0);
}

export function debeRecordar(c: ConversacionSeguimiento, ahora: Date, cfg: ConfigSeguimiento): boolean {
  if (!cfg.activo || c.cerrada || !c.ultimoEsNuestro || c.esperaRespuesta === false) return false;
  if (!enHorario(ahora, cfg.horaDesde, cfg.horaHasta)) return false;
  if (!ventanaAbierta(c.ultimoEntranteAt, ahora)) return false;
  if (recordatoriosEnviados(c) >= Math.max(1, cfg.maxRecordatorios)) return false;
  return ahora.getTime() - ms(c.ultimoMensajeAt) >= cfg.horasEspera * HORA;
}

export function debeEscalar(c: ConversacionSeguimiento, ahora: Date, cfg: ConfigSeguimiento): boolean {
  if (!cfg.activo || cfg.horasEscalar <= 0 || c.cerrada || c.requiereHumano || c.esperaRespuesta === false) return false;
  if (!yaRecordado(c)) return false; // respondió después del recordatorio, o nunca se le recordó
  // Primero salen todos los recordatorios, salvo que la ventana de 24 h se cierre antes.
  if (recordatoriosEnviados(c) < Math.max(1, cfg.maxRecordatorios) && ventanaAbierta(c.ultimoEntranteAt, ahora)) return false;
  const env = ms(c.seguimientoEnviadoAt);
  const esc = ms(c.seguimientoEscaladoAt);
  if (Number.isFinite(esc) && esc >= env) return false; // ya se marcó por este recordatorio
  return ahora.getTime() - env >= cfg.horasEscalar * HORA;
}

/** Texto del recordatorio número `n` (1, 2, 3…): el suyo o, si no hay, el último configurado. */
export function mensajeDelRecordatorio(cfg: Pick<ConfigSeguimiento, "mensaje" | "mensajesSiguientes">, n: number): string {
  const textos = [cfg.mensaje, ...(cfg.mensajesSiguientes ?? [])].filter((t) => t?.trim());
  if (!textos.length) return cfg.mensaje;
  return textos[Math.min(Math.max(n, 1), textos.length) - 1];
}

/** Un primer nombre real rara vez pasa de 12 letras; más largo es un nombre pegado. */
const NOMBRE_MAX = 12;

/** El texto con {nombre} (primer nombre, en tipo título) o sin él. */
export function textoRecordatorio(plantilla: string, nombre: string | null): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  // Nombres de WhatsApp pegados («Manuelguillermomarriaga»), con números o
  // símbolos no sirven de saludo: se omite el nombre.
  const usable = primero.length <= NOMBRE_MAX && /^\p{L}+$/u.test(primero);
  const bonito = usable ? primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase() : "";
  // Sin nombre se quita el marcador con la coma o el espacio que lo antecede:
  // «Hola {nombre}, ¿…» → «Hola, ¿…»; «¿Sigues ahí, {nombre}?» → «¿Sigues ahí?».
  // Los textos pegados en el SQL Editor de Windows traen «\r\n».
  const base = plantilla.replace(/\r\n?/g, "\n");
  const texto = bonito ? base.replace(/\{nombre\}/g, bonito) : base.replace(/,?[ \t]*\{nombre\}/g, "");
  return texto.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
}

/** Valida el formulario de configuración. */
export function validarSeguimiento(v: Partial<ConfigSeguimiento>): { ok: true; config: ConfigSeguimiento } | { ok: false; error: string } {
  const horasEspera = Number(v.horasEspera);
  if (!Number.isFinite(horasEspera) || horasEspera < 0.5 || horasEspera > 20) return { ok: false, error: "Las horas de espera deben estar entre 0,5 y 20." };
  const horasEscalar = Number(v.horasEscalar);
  if (!Number.isInteger(horasEscalar) || horasEscalar < 0 || horasEscalar > 168) return { ok: false, error: "Las horas para marcar a GH deben ser un entero de 0 a 168." };
  const maxRecordatorios = Number(v.maxRecordatorios ?? SEGUIMIENTO_POR_DEFECTO.maxRecordatorios);
  if (!Number.isInteger(maxRecordatorios) || maxRecordatorios < 1 || maxRecordatorios > MAX_RECORDATORIOS_TOPE) {
    return { ok: false, error: `Las veces que se le recuerda deben ser un entero de 1 a ${MAX_RECORDATORIOS_TOPE}.` };
  }
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(v.horaDesde ?? "") || !hhmm.test(v.horaHasta ?? "")) return { ok: false, error: "El horario debe ser HH:MM." };
  if (v.horaDesde === v.horaHasta) return { ok: false, error: "El horario de inicio y fin no pueden ser iguales." };
  const mensaje = (v.mensaje ?? "").trim();
  if (mensaje.length < 10) return { ok: false, error: "Escriba el mensaje del recordatorio." };
  if (mensaje.length > 1000) return { ok: false, error: "El mensaje no puede pasar de 1000 caracteres." };
  // Solo los que se van a usar; uno vacío repite el anterior.
  const mensajesSiguientes = (v.mensajesSiguientes ?? []).slice(0, Math.max(0, maxRecordatorios - 1)).map((t) => String(t ?? "").trim());
  while (mensajesSiguientes.length && !mensajesSiguientes[mensajesSiguientes.length - 1]) mensajesSiguientes.pop();
  if (mensajesSiguientes.some((t) => t && t.length < 10)) return { ok: false, error: "Cada recordatorio debe tener al menos 10 caracteres (o quedar vacío para repetir el anterior)." };
  if (mensajesSiguientes.some((t) => t.length > 1000)) return { ok: false, error: "Ningún recordatorio puede pasar de 1000 caracteres." };
  return {
    ok: true,
    config: { activo: v.activo !== false, horasEspera: Math.round(horasEspera * 10) / 10, mensaje, horaDesde: v.horaDesde!, horaHasta: v.horaHasta!, horasEscalar, maxRecordatorios, mensajesSiguientes },
  };
}
