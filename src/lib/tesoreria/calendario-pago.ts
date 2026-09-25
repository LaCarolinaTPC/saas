/**
 * Calendario de pago de la liquidación de afiliados (módulo puro, sin datos).
 *
 * GEMA guarda el plazo de cada propietario (propietarios.plazo_pago) pero no
 * arma los periodos: quien imprime el GAF-R-12 escoge el rango a mano. La
 * regla la fijó Tesorería el 2026-09-25 y vive en tesoreria_calendario_pago
 * (migración 20260925194027) para poder cambiarla sin tocar código:
 *  - SEMANAL: de lunes a domingo.
 *  - DECADA: el nombre es de GEMA, pero el periodo es QUINCENAL (1-15 y
 *    16-fin de mes).
 *  - Se paga el primer martes después del corte; si ese martes o el lunes
 *    anterior es festivo, el miércoles.
 *
 * Fechas en ISO "AAAA-MM-DD" y aritmética en UTC: no dependen de la zona del
 * servidor. Días de la semana en numeración ISO: 1 = lunes … 7 = domingo.
 */

export type Plazo = "SEMANAL" | "DECADA";
export const PLAZOS: Plazo[] = ["SEMANAL", "DECADA"];

export interface ReglaPago {
  plazo: Plazo;
  etiqueta: string;
  /** SEMANAL: día ISO en que cierra la semana. DECADA: día del mes que cierra la primera quincena. */
  diaCorte: number;
  /** Día ISO de pago: el primero que llega después del corte. */
  diaPago: number;
  /** Día ISO al que se corre el pago cuando aplica una regla de festivo. */
  diaPagoAlterno: number;
  /** Correr el pago si el lunes de esa semana (ya pasado el corte) es festivo. */
  correrSiLunesFestivo: boolean;
  /** Correr el pago si el propio día de pago es festivo. */
  correrSiDiaPagoFestivo: boolean;
}

/** La regla acordada el 2026-09-25; se usa si la tabla aún no existe. */
export const REGLAS_DEFECTO: Record<Plazo, ReglaPago> = {
  SEMANAL: {
    plazo: "SEMANAL", etiqueta: "Semanal", diaCorte: 7, diaPago: 2, diaPagoAlterno: 3,
    correrSiLunesFestivo: true, correrSiDiaPagoFestivo: true,
  },
  DECADA: {
    plazo: "DECADA", etiqueta: "Quincenal", diaCorte: 15, diaPago: 2, diaPagoAlterno: 3,
    correrSiLunesFestivo: true, correrSiDiaPagoFestivo: true,
  },
};

export const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

export function esPlazo(v: string | null | undefined): v is Plazo {
  return v === "SEMANAL" || v === "DECADA";
}

// ── Fechas ──────────────────────────────────────────────────────────────────

const aDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);

export function sumarDias(iso: string, n: number): string {
  const d = aDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
}

/** Día ISO de la semana: 1 = lunes … 7 = domingo. */
export function diaIso(iso: string): number {
  const d = aDate(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// ── Festivos de Colombia ────────────────────────────────────────────────────

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes, dia);
}

/** Traslada al lunes siguiente (Ley 51 de 1983, "Ley Emiliani"); si ya es lunes, se queda. */
function aLunes(fecha: string): string {
  const d = diaIso(fecha);
  return d === 1 ? fecha : sumarDias(fecha, 8 - d);
}

const cacheFestivos = new Map<number, Set<string>>();

/**
 * Festivos nacionales de Colombia de un año: seis de fecha fija, siete que se
 * trasladan al lunes y cinco que dependen de la Pascua (tres de ellos
 * trasladados al lunes).
 */
export function festivosColombia(anio: number): Set<string> {
  const enCache = cacheFestivos.get(anio);
  if (enCache) return enCache;
  const pascua = domingoDePascua(anio);
  const fijos = [iso(anio, 1, 1), iso(anio, 5, 1), iso(anio, 7, 20), iso(anio, 8, 7), iso(anio, 12, 8), iso(anio, 12, 25)];
  const trasladables = [
    iso(anio, 1, 6), iso(anio, 3, 19), iso(anio, 6, 29), iso(anio, 8, 15),
    iso(anio, 10, 12), iso(anio, 11, 1), iso(anio, 11, 11),
  ].map(aLunes);
  const dePascua = [
    sumarDias(pascua, -3), // Jueves Santo
    sumarDias(pascua, -2), // Viernes Santo
    sumarDias(pascua, 43), // Ascensión (jueves +39, trasladada al lunes)
    sumarDias(pascua, 64), // Corpus Christi (jueves +60, trasladado)
    sumarDias(pascua, 71), // Sagrado Corazón (viernes +68, trasladado)
  ];
  const out = new Set([...fijos, ...trasladables, ...dePascua]);
  cacheFestivos.set(anio, out);
  return out;
}

export function esFestivo(fecha: string): boolean {
  return festivosColombia(Number(fecha.slice(0, 4))).has(fecha);
}

/** Lunes a viernes y no festivo. */
export function esDiaHabil(fecha: string): boolean {
  return diaIso(fecha) <= 5 && !esFestivo(fecha);
}

// ── Periodos ────────────────────────────────────────────────────────────────

export interface Periodo {
  plazo: Plazo;
  desde: string;
  hasta: string;
  /** "2026-W39" en semanal (semana ISO del corte), "2026-09-Q1" en quincenal. */
  clave: string;
  /** "Semana del 21 al 27 sep 2026", "Quincena del 1 al 15 sep 2026". */
  etiqueta: string;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fechaCorta(f: string): string {
  return `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;
}

/** "Semana del 21 al 27 sep 2026" · "del 28 sep al 4 oct 2026" · "del 29 dic 2025 al 4 ene 2026". */
function rotulo(nombre: string, desde: string, hasta: string): string {
  const dia = String(Number(desde.slice(8, 10)));
  const ini =
    desde.slice(0, 7) === hasta.slice(0, 7) ? dia
    : desde.slice(0, 4) === hasta.slice(0, 4) ? `${dia} ${MESES[Number(desde.slice(5, 7)) - 1]}`
    : fechaCorta(desde);
  return `${nombre} del ${ini} al ${fechaCorta(hasta)}`;
}

/** Número de semana ISO de una fecha. */
function semanaIso(fecha: string): { anio: number; semana: number } {
  const jueves = sumarDias(fecha, 4 - diaIso(fecha));
  const anio = Number(jueves.slice(0, 4));
  const semana = Math.floor((aDate(jueves).getTime() - aDate(iso(anio, 1, 1)).getTime()) / 86_400_000 / 7) + 1;
  return { anio, semana };
}

/** Periodo de la regla que contiene la fecha. */
export function periodoDe(regla: ReglaPago, fecha: string): Periodo {
  if (regla.plazo === "SEMANAL") {
    const hasta = sumarDias(fecha, (regla.diaCorte - diaIso(fecha) + 7) % 7);
    const desde = sumarDias(hasta, -6);
    const s = semanaIso(hasta);
    return {
      plazo: "SEMANAL", desde, hasta,
      clave: `${s.anio}-W${String(s.semana).padStart(2, "0")}`,
      etiqueta: rotulo("Semana", desde, hasta),
    };
  }
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  const primera = dia <= regla.diaCorte;
  const desde = primera ? iso(anio, mes, 1) : iso(anio, mes, regla.diaCorte + 1);
  const hasta = primera ? iso(anio, mes, regla.diaCorte) : iso(anio, mes, ultimoDiaDelMes(anio, mes));
  return {
    plazo: "DECADA", desde, hasta,
    clave: `${fecha.slice(0, 7)}-Q${primera ? 1 : 2}`,
    etiqueta: rotulo("Quincena", desde, hasta),
  };
}

export function periodoAnterior(regla: ReglaPago, p: Periodo): Periodo {
  return periodoDe(regla, sumarDias(p.desde, -1));
}

export function periodoSiguiente(regla: ReglaPago, p: Periodo): Periodo {
  return periodoDe(regla, sumarDias(p.hasta, 1));
}

/** El último periodo ya cerrado a la fecha (el que termina antes de `hoy`). */
export function ultimoPeriodoCerrado(regla: ReglaPago, hoy: string): Periodo {
  const actual = periodoDe(regla, hoy);
  return actual.hasta < hoy ? actual : periodoAnterior(regla, actual);
}

/** Los `n` periodos más recientes hasta el que contiene `hoy`, del más nuevo al más viejo. */
export function periodosRecientes(regla: ReglaPago, hoy: string, n: number): Periodo[] {
  const out = [periodoDe(regla, hoy)];
  while (out.length < n) out.push(periodoAnterior(regla, out[out.length - 1]));
  return out;
}

// ── Fecha de pago ───────────────────────────────────────────────────────────

export interface FechaPago {
  fecha: string;
  /** Fecha que tocaba según el día de pago, antes de correrla por festivo. */
  prevista: string;
  /** Por qué se corrió; null si se paga en el día normal. */
  motivo: string | null;
}

/**
 * Fecha de pago de un periodo: el primer `diaPago` después del corte. Si el
 * propio día es festivo, o el lunes de esa semana lo es (y ya pasó el corte:
 * es el día en que Tesorería prepara el pago), se corre a `diaPagoAlterno`
 * de la misma semana. Si ese también es festivo o no es hábil, al siguiente
 * día hábil.
 */
export function fechaPagoDe(regla: ReglaPago, p: Periodo): FechaPago {
  const prevista = sumarDias(p.hasta, ((regla.diaPago - diaIso(p.hasta) + 7) % 7) || 7);
  const lunes = sumarDias(prevista, 1 - diaIso(prevista));
  let motivo: string | null = null;
  if (regla.correrSiDiaPagoFestivo && esFestivo(prevista)) {
    motivo = `el ${DIAS_SEMANA[regla.diaPago - 1]} ${fechaCorta(prevista)} es festivo`;
  } else if (regla.correrSiLunesFestivo && lunes > p.hasta && lunes < prevista && esFestivo(lunes)) {
    motivo = `el lunes ${fechaCorta(lunes)} es festivo`;
  }
  if (!motivo) return { fecha: prevista, prevista, motivo: null };
  let fecha = sumarDias(prevista, ((regla.diaPagoAlterno - regla.diaPago + 7) % 7) || 7);
  while (!esDiaHabil(fecha)) fecha = sumarDias(fecha, 1);
  return { fecha, prevista, motivo };
}

export type EstadoPago = "en_curso" | "por_pagar" | "pagadero_hoy" | "fecha_cumplida";

export const ESTADO_PAGO_LABEL: Record<EstadoPago, string> = {
  en_curso: "Periodo en curso",
  por_pagar: "Por pagar",
  pagadero_hoy: "Se paga hoy",
  fecha_cumplida: "Fecha de pago cumplida",
};

/** Estado calculado del pago de un periodo a la fecha `hoy` (no sabe si se pagó). */
export function estadoPago(p: Periodo, pago: FechaPago, hoy: string): EstadoPago {
  if (hoy <= p.hasta) return "en_curso";
  if (hoy < pago.fecha) return "por_pagar";
  if (hoy === pago.fecha) return "pagadero_hoy";
  return "fecha_cumplida";
}

export interface PagoProgramado {
  periodo: Periodo;
  pago: FechaPago;
}

/**
 * Pagos de una regla cuya fecha de pago cae en [desde, hasta], del más
 * reciente al más viejo.
 */
export function pagosEntre(regla: ReglaPago, desde: string, hasta: string): PagoProgramado[] {
  const out: PagoProgramado[] = [];
  // El pago llega a lo sumo ~10 días después del corte: se arranca un poco
  // después de `hasta` y se retrocede hasta pasar `desde`.
  let p = periodoDe(regla, sumarDias(hasta, 1));
  for (let i = 0; i < 400; i++) {
    const pago = fechaPagoDe(regla, p);
    if (pago.fecha < desde) break;
    if (pago.fecha <= hasta) out.push({ periodo: p, pago });
    p = periodoAnterior(regla, p);
  }
  return out;
}
