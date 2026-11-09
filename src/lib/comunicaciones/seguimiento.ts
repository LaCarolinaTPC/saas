/**
 * Seguimiento a quien no responde en WhatsApp — reglas PURAS (sin E/S; se
 * prueban con `npm run test:comunicaciones`). Las aplica
 * `seguimiento-ejecutar.ts` cada 15 minutos.
 *
 * - **Recordatorio**: el último mensaje del chat es nuestro (de la IA o de
 *   alguien de GH), el aspirante lleva `horasEspera` sin responder y no se le
 *   ha recordado en este silencio → se le envía `mensaje` («¿sigues
 *   interesado?»). Solo dentro del horario y con la ventana de 24 h de Meta
 *   abierta (fuera de ella WhatsApp no deja enviar texto libre).
 * - **Para GH**: se le recordó, siguió sin responder `horasEscalar` horas y no
 *   se ha marcado → el chat queda «Para humano» para que alguien decida.
 *
 * Un silencio termina cuando la persona vuelve a escribir: entonces se le
 * puede volver a recordar si se queda callada otra vez.
 */

export interface ConfigSeguimiento {
  activo: boolean;
  horasEspera: number;
  mensaje: string;
  /** HH:MM, hora de Bogotá. */
  horaDesde: string;
  horaHasta: string;
  /** 0 = no marcar para GH. */
  horasEscalar: number;
}

export const SEGUIMIENTO_POR_DEFECTO: ConfigSeguimiento = {
  activo: true,
  horasEspera: 2,
  mensaje: "Hola {nombre}, ¿sigues interesado en el proceso de selección de La Carolina? Respóndenos para continuar.",
  horaDesde: "07:00",
  horaHasta: "20:00",
  horasEscalar: 24,
};

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

export function debeRecordar(c: ConversacionSeguimiento, ahora: Date, cfg: ConfigSeguimiento): boolean {
  if (!cfg.activo || c.cerrada || !c.ultimoEsNuestro) return false;
  if (!enHorario(ahora, cfg.horaDesde, cfg.horaHasta)) return false;
  if (!ventanaAbierta(c.ultimoEntranteAt, ahora)) return false;
  if (yaRecordado(c)) return false;
  return ahora.getTime() - ms(c.ultimoMensajeAt) >= cfg.horasEspera * HORA;
}

export function debeEscalar(c: ConversacionSeguimiento, ahora: Date, cfg: ConfigSeguimiento): boolean {
  if (!cfg.activo || cfg.horasEscalar <= 0 || c.cerrada || c.requiereHumano) return false;
  if (!yaRecordado(c)) return false; // respondió después del recordatorio, o nunca se le recordó
  const env = ms(c.seguimientoEnviadoAt);
  const esc = ms(c.seguimientoEscaladoAt);
  if (Number.isFinite(esc) && esc >= env) return false; // ya se marcó por este recordatorio
  return ahora.getTime() - env >= cfg.horasEscalar * HORA;
}

/** El texto con {nombre} (primer nombre, en tipo título) o sin él. */
export function textoRecordatorio(plantilla: string, nombre: string | null): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const bonito = primero ? primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase() : "";
  // Sin nombre se quita el marcador con la coma o el espacio que lo antecede:
  // «Hola {nombre}, ¿…» → «Hola, ¿…»; «¿Sigues ahí, {nombre}?» → «¿Sigues ahí?».
  const texto = bonito ? plantilla.replace(/\{nombre\}/g, bonito) : plantilla.replace(/,?\s*\{nombre\}/g, "");
  return texto.replace(/[ \t]{2,}/g, " ").trim();
}

/** Valida el formulario de configuración. */
export function validarSeguimiento(v: Partial<ConfigSeguimiento>): { ok: true; config: ConfigSeguimiento } | { ok: false; error: string } {
  const horasEspera = Number(v.horasEspera);
  if (!Number.isFinite(horasEspera) || horasEspera < 0.5 || horasEspera > 20) return { ok: false, error: "Las horas de espera deben estar entre 0,5 y 20." };
  const horasEscalar = Number(v.horasEscalar);
  if (!Number.isInteger(horasEscalar) || horasEscalar < 0 || horasEscalar > 168) return { ok: false, error: "Las horas para marcar a GH deben ser un entero de 0 a 168." };
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(v.horaDesde ?? "") || !hhmm.test(v.horaHasta ?? "")) return { ok: false, error: "El horario debe ser HH:MM." };
  if (v.horaDesde === v.horaHasta) return { ok: false, error: "El horario de inicio y fin no pueden ser iguales." };
  const mensaje = (v.mensaje ?? "").trim();
  if (mensaje.length < 10) return { ok: false, error: "Escriba el mensaje del recordatorio." };
  if (mensaje.length > 1000) return { ok: false, error: "El mensaje no puede pasar de 1000 caracteres." };
  return {
    ok: true,
    config: { activo: v.activo !== false, horasEspera: Math.round(horasEspera * 10) / 10, mensaje, horaDesde: v.horaDesde!, horaHasta: v.horaHasta!, horasEscalar },
  };
}
