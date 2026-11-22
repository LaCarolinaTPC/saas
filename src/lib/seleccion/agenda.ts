/**
 * Agenda de citas de la selección (entrega 2, D1–D4): cuándo se cita, qué
 * toca hacer con cada cita según la hora, cómo se lee la respuesta del
 * aspirante y qué pasa cuando el profesor no puede. Parte pura, con pruebas;
 * lo que escribe en la base está en agenda-servidor.ts y agenda-ejecutar.ts.
 *
 * Las fechas son AAAA-MM-DD y las horas HH:MM, siempre de Bogotá.
 */
import { horaBogota } from "@/lib/comunicaciones/seguimiento";
import { esDiaHabilRecobro, fechaBogota } from "@/lib/tesoreria/recobros";
import { diaIso, sumarDias } from "@/lib/tesoreria/calendario-pago";

export type TipoCita = "prueba_manejo" | "examen_f1" | "examen_f2" | "psicotecnica" | "reconocimiento";

/**
 * Citas que se recuerdan, se confirman y se marcan (llegó / no asistió) con
 * las mismas reglas: la prueba de manejo y, desde el 21-nov-2026, cada salida
 * de reconocimiento de ruta.
 */
export const TIPOS_CON_SEGUIMIENTO: readonly TipoCita[] = ["prueba_manejo", "reconocimiento"];

export const ETIQUETA_TIPO_CITA: Record<TipoCita, string> = {
  prueba_manejo: "Prueba de manejo",
  examen_f1: "Exámenes, fase 1",
  examen_f2: "Exámenes, fase 2",
  psicotecnica: "Prueba psicosensotécnica",
  reconocimiento: "Reconocimiento de ruta",
};
export type EstadoCita = "programada" | "confirmada" | "pide_otra_fecha" | "asistio" | "no_asistio" | "reprogramada" | "cancelada";

/** Cita tal como se guarda en seleccion_citas. */
export interface Cita {
  id: string;
  proceso_id: string;
  tipo: TipoCita;
  fecha: string;
  /** HH:MM o HH:MM:SS (así la devuelve la base). */
  hora: string;
  estado: EstadoCita;
  reprogramada_por: "aspirante" | "empresa" | null;
  confirmada_at: string | null;
  llego_at: string | null;
  recordatorio_at: string | null;
  alerta_at: string | null;
  inasistencia_at: string | null;
  creada_por: string | null;
  created_at: string;
  /** Dónde (entrega 4; la psicotécnica puede ser en una IPS). Vacío = la sede. */
  lugar?: string | null;
}

/** Estados en que la cita sigue en pie (se espera al aspirante). */
export const ESTADOS_CITA_VIGENTE: EstadoCita[] = ["programada", "confirmada", "pide_otra_fecha"];
export const citaVigente = (c: Pick<Cita, "estado">) => ESTADOS_CITA_VIGENTE.includes(c.estado);

export const ESTADO_CITA_LABEL: Record<EstadoCita, string> = {
  programada: "Sin confirmar",
  confirmada: "Confirmó",
  pide_otra_fecha: "Pide otra fecha",
  asistio: "Llegó",
  no_asistio: "No asistió",
  reprogramada: "Reprogramada",
  cancelada: "Cancelada",
};

export interface AjustesAgenda {
  citaHoraSemana: string;
  citaHoraSabado: string;
  citaLimiteMismoDia: string;
  recordatorioCitaHora: string;
  alertaNoConfirmoHora: string;
  toleranciaInasistenciaMinutos: number;
  reprogramacionesMax: number;
  recordatorioEscuelaHora: string;
  laboratorioHora: string;
  rutasMinimas: number;
  /** Hora de cada salida de reconocimiento de ruta (21-nov-2026). */
  reconocimientoHora: string;
}

/** Valores de la reunión con GH (2026-11-10); se cambian en seleccion_ajustes. */
export const AJUSTES_AGENDA_POR_DEFECTO: AjustesAgenda = {
  citaHoraSemana: "13:00",
  citaHoraSabado: "08:00",
  citaLimiteMismoDia: "12:00",
  recordatorioCitaHora: "08:00",
  alertaNoConfirmoHora: "11:00",
  toleranciaInasistenciaMinutos: 30,
  reprogramacionesMax: 2,
  recordatorioEscuelaHora: "07:30",
  // Salud Ocupacional, 21-nov-2026: a todos a las 6:30, por orden de llegada.
  laboratorioHora: "06:30",
  rutasMinimas: 2,
  reconocimientoHora: "09:00",
};

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** «13:00:00» o «13:00» → «13:00». */
export const hhmm = (hora: string | null | undefined): string => String(hora ?? "").slice(0, 5);

/** Lee los ajustes de la agenda; lo que falte o esté mal escrito queda con el valor por defecto. */
export function ajustesAgenda(filas: { clave: string; valor: unknown }[]): AjustesAgenda {
  const m = new Map(filas.map((f) => [f.clave, f.valor]));
  const d = AJUSTES_AGENDA_POR_DEFECTO;
  const hora = (k: string, def: string) => {
    const v = hhmm(String(m.get(k) ?? ""));
    return HORA_RE.test(v) ? v : def;
  };
  // 0 es válido (sin tolerancia, sin reprogramaciones).
  const num = (k: string, def: number) => {
    const v = m.get(k);
    const n = Number(v);
    return v !== undefined && v !== null && v !== "" && Number.isFinite(n) && n >= 0 ? n : def;
  };
  return {
    citaHoraSemana: hora("cita_hora_semana", d.citaHoraSemana),
    citaHoraSabado: hora("cita_hora_sabado", d.citaHoraSabado),
    citaLimiteMismoDia: hora("cita_limite_mismo_dia", d.citaLimiteMismoDia),
    recordatorioCitaHora: hora("recordatorio_cita_hora", d.recordatorioCitaHora),
    alertaNoConfirmoHora: hora("alerta_no_confirmo_hora", d.alertaNoConfirmoHora),
    toleranciaInasistenciaMinutos: num("tolerancia_inasistencia_minutos", d.toleranciaInasistenciaMinutos),
    reprogramacionesMax: num("reprogramaciones_max", d.reprogramacionesMax),
    recordatorioEscuelaHora: hora("recordatorio_escuela_hora", d.recordatorioEscuelaHora),
    laboratorioHora: hora("laboratorio_hora", d.laboratorioHora),
    rutasMinimas: num("rutas_minimas", d.rutasMinimas) || d.rutasMinimas,
    reconocimientoHora: hora("reconocimiento_hora", d.reconocimientoHora),
  };
}

/**
 * Día de la siguiente salida de reconocimiento de ruta: el siguiente día hábil
 * después de `desde` en que el profesor no marcó que no puede (lo acompaña él).
 */
export function proximaFechaReconocimiento(desde: string, excepciones: ExcepcionProfesor[] = []): string {
  let d = desde;
  for (let i = 0; i < 60; i++) {
    d = siguienteDiaHabil(d);
    if (!excepciones.some((e) => e.fecha === d && !e.disponible)) return d;
  }
  return siguienteDiaHabil(desde);
}

/** Día en que el profesor no puede (disponible = false) o puede a otra hora (disponible = true y hora). */
export interface ExcepcionProfesor {
  fecha: string;
  disponible: boolean;
  hora: string | null;
  motivo?: string | null;
  nota?: string | null;
}

/** Hora normal de la prueba de manejo ese día (sábado tiene la suya). */
export function horaNormal(fecha: string, a: AjustesAgenda): string {
  return diaIso(fecha) === 6 ? a.citaHoraSabado : a.citaHoraSemana;
}

/**
 * ¿Hay prueba de manejo ese día y a qué hora? null si no es día hábil o si el
 * profesor no puede. Si ese día puede a otra hora, devuelve esa.
 */
export function horaDelDia(fecha: string, a: AjustesAgenda, excepciones: ExcepcionProfesor[] = []): string | null {
  if (!esDiaHabilRecobro(fecha)) return null;
  const ex = excepciones.find((e) => e.fecha === fecha);
  if (ex && !ex.disponible) return null;
  const otra = ex?.hora ? hhmm(ex.hora) : "";
  return HORA_RE.test(otra) ? otra : horaNormal(fecha, a);
}

/**
 * Próxima cita para la prueba de manejo: hoy, si es antes de la hora límite,
 * hay prueba y su hora no ha pasado; si no, el siguiente día con prueba. Salta
 * domingos, festivos y los días en que el profesor no puede.
 */
export function proximaCita(ahora: Date, a: AjustesAgenda, excepciones: ExcepcionProfesor[] = [], desdeManana = false): { fecha: string; hora: string } {
  const hoy = fechaBogota(ahora.toISOString());
  const ya = horaBogota(ahora);
  if (!desdeManana) {
    const h = horaDelDia(hoy, a, excepciones);
    if (h && ya < a.citaLimiteMismoDia && ya < h) return { fecha: hoy, hora: h };
  }
  let d = hoy;
  // 60 días es de sobra: solo se agota si el profesor está fuera dos meses.
  for (let i = 0; i < 60; i++) {
    d = sumarDias(d, 1);
    const h = horaDelDia(d, a, excepciones);
    if (h) return { fecha: d, hora: h };
  }
  return { fecha: sumarDias(hoy, 1), hora: a.citaHoraSemana };
}

/** El siguiente día hábil (lunes a sábado, sin festivos) después de `fecha`. */
export function siguienteDiaHabil(fecha: string): string {
  let d = fecha;
  do d = sumarDias(d, 1);
  while (!esDiaHabilRecobro(d));
  return d;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-11-19» → «jueves 19 de noviembre». */
export function fechaEnTexto(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `${DIAS[diaIso(fecha) % 7]} ${d} de ${MESES[m - 1]}`;
}

/** «13:00» → «1:00 p. m.». */
export function horaEnTexto(hora: string): string {
  const [h, m] = hhmm(hora).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm(hora);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

/** Minutos desde la medianoche de una hora HH:MM. */
const minutos = (hora: string) => {
  const [h, m] = hhmm(hora).split(":").map(Number);
  return h * 60 + m;
};

export type AccionAgenda = "recordatorio" | "alerta_no_confirmo" | "inasistencia" | null;

/**
 * Qué toca hacer ahora con una cita de hoy (el cron lo revisa cada 15 min):
 * - a la hora + tolerancia, sin llegada registrada → no asistió;
 * - desde la hora de la alerta, sin confirmar → llamar;
 * - desde la hora del recordatorio → recordatorio (una vez).
 * Una cita de otro día, o que ya no está vigente, no hace nada.
 */
export function accionAgenda(c: Cita, ahora: Date, a: AjustesAgenda): AccionAgenda {
  if (!TIPOS_CON_SEGUIMIENTO.includes(c.tipo) || !citaVigente(c)) return null;
  const hoy = fechaBogota(ahora.toISOString());
  if (c.fecha !== hoy) return null;
  const ya = horaBogota(ahora);
  if (!c.inasistencia_at && !c.llego_at && minutos(ya) >= minutos(c.hora) + a.toleranciaInasistenciaMinutos) return "inasistencia";
  // Ya pasó la hora: ni recordatorio ni alerta (se le espera hasta la tolerancia).
  if (ya >= hhmm(c.hora)) return null;
  if (!c.alerta_at && c.estado === "programada" && ya >= a.alertaNoConfirmoHora) return "alerta_no_confirmo";
  if (!c.recordatorio_at && ya >= a.recordatorioCitaHora) return "recordatorio";
  return null;
}

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type RespuestaCita = "confirma" | "pide_otra_fecha" | "no_interesa" | null;

/**
 * Lee la respuesta del aspirante a la citación, al recordatorio o al aviso de
 * inasistencia. Los botones de las plantillas llegan como texto («Sí, voy»,
 * «Necesito otra fecha», «Sí, reprogramar», «Ya no me interesa»). Solo
 * respuestas cortas y claras: lo demás lo atiende el asistente o una persona.
 */
export function interpretarRespuestaCita(texto: string): RespuestaCita {
  const t = normalizar(texto);
  if (!t || t.split(" ").length > 8) return null;
  if (/\b(ya no me interesa|no me interesa|no estoy interesad[oa]|ya no quiero|no voy a ir|no ire|desisto)\b/.test(t)) return "no_interesa";
  if (/\b(otra fecha|otro dia|reprogram\w*|no puedo (ir|asistir|ese dia|hoy|manana)|no alcanzo|cambiar la (fecha|cita|hora))\b/.test(t)) return "pide_otra_fecha";
  if (/^(si|sii+|claro|listo|ok|okay|dale|confirmo|confirmado|de acuerdo|ahi estare|alla estare|si voy|si señor|si señora|si claro|si confirmo|si asisto|si asistire|voy|asistire|alli estare)\b/.test(t)) {
    return "confirma";
  }
  return null;
}

/** Reprogramaciones pedidas por el aspirante (las de la empresa no cuentan). */
export function reprogramacionesDe(citas: Pick<Cita, "tipo" | "estado" | "reprogramada_por">[], tipo: TipoCita = "prueba_manejo"): number {
  return citas.filter((c) => c.tipo === tipo && c.estado === "reprogramada" && c.reprogramada_por !== "empresa").length;
}

/** ¿Ya gastó las reprogramaciones permitidas? (se propone el cierre por desistimiento; lo confirma una persona) */
export function superaReprogramaciones(citas: Pick<Cita, "tipo" | "estado" | "reprogramada_por">[], a: AjustesAgenda, tipo: TipoCita = "prueba_manejo"): boolean {
  return reprogramacionesDe(citas, tipo) > a.reprogramacionesMax;
}

/**
 * Citas de ese día que ya no caben con la excepción del profesor. Prueba de
 * manejo: todas las vigentes si no puede; las de otra hora si cambió la hora.
 * Reconocimiento de ruta (lo acompaña el profesor, a su propia hora): solo si
 * ese día no puede.
 */
export function citasAfectadas<T extends Pick<Cita, "tipo" | "estado" | "fecha" | "hora">>(citas: T[], ex: ExcepcionProfesor): T[] {
  return citas.filter((c) => {
    if (!TIPOS_CON_SEGUIMIENTO.includes(c.tipo) || c.fecha !== ex.fecha || !citaVigente(c)) return false;
    if (!ex.disponible) return true;
    return c.tipo === "prueba_manejo" && Boolean(ex.hora) && hhmm(c.hora) !== hhmm(ex.hora);
  });
}

/** Rutas ya aprendidas (con al menos una salida «aprendida»), sin repetir. */
export function rutasAprendidas(salidas: { ruta: string; resultado: string }[]): string[] {
  return [...new Set(salidas.filter((s) => s.resultado === "aprendida").map((s) => s.ruta))];
}
