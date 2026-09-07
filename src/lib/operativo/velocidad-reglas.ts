/**
 * Exceso de velocidad — reglas puras (cliente y servidor).
 *
 * Una incidencia es un episodio: eventos GPS del mismo vehículo con velocidad
 * mayor o igual al umbral, separados por menos de N minutos. La base los arma
 * (`get_incidencias_velocidad`) y les asigna el conductor del viaje que tenía
 * el vehículo despachado. Aquí se cortan por semana (lunes a domingo, dentro
 * del mes), se agrupan por conductor y se decide quién se reporta a RRHH.
 */

export interface ParametrosVelocidad {
  /** Velocidad desde la que un evento cuenta como exceso (>=). */
  umbralKmh: number;
  /** Incidencias en la misma semana desde las que se reporta a RRHH. */
  minimoIncidencias: number;
  /** Dos eventos separados por menos de estos minutos son la misma incidencia. */
  minutosAgrupacion: number;
  updatedByEmail?: string | null;
  updatedAt?: string | null;
}

export const PARAMETROS_DEFECTO: ParametrosVelocidad = {
  umbralKmh: 60,
  minimoIncidencias: 4,
  minutosAgrupacion: 5,
};

export interface Incidencia {
  /** Identificador estable dentro del informe: vehículo + inicio. */
  id: string;
  vehiculo: string;
  /** Hora local "YYYY-MM-DDTHH:MM:SS". */
  inicio: string;
  fin: string;
  /** "YYYY-MM-DD" del inicio. */
  fecha: string;
  eventos: number;
  velocidadMax: number;
  velocidadProm: number | null;
  latitud: number | null;
  longitud: number | null;
  direccion: string | null;
  cedula: string | null;
  codigo: string | null;
  nombre: string | null;
  ruta: string | null;
  viaje: number | null;
  horaDespacho: string | null;
  horaLlegada: string | null;
}

export interface Semana {
  /** 1..n dentro del periodo consultado. */
  numero: number;
  /** Lunes. */
  desde: string;
  /** Domingo (aunque caiga en el mes siguiente). */
  hasta: string;
  label: string;
}

export interface ReporteRrhh {
  id: string;
  cedula: string;
  codigo: string | null;
  nombre: string;
  semanaDesde: string;
  semanaHasta: string;
  incidencias: number;
  velocidadMax: number | null;
  reportadoEn: string;
  observaciones: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

export interface ConductorSemana {
  /** Clave estable: cédula + semana. */
  key: string;
  cedula: string;
  codigo: string | null;
  nombre: string;
  semana: Semana;
  incidencias: Incidencia[];
  velocidadMax: number;
  vehiculos: string[];
  rutas: string[];
  /** Alcanzó el mínimo de incidencias de la semana. */
  reportable: boolean;
  reporte: ReporteRrhh | null;
}

export interface ResumenSemana {
  semana: Semana;
  conductores: number;
  reportables: number;
  reportados: number;
  incidencias: number;
  sinConductor: number;
}

// ── Fechas ───────────────────────────────────────────────────────────────────

export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Días máximos que se consultan de una vez: un mes son ~12.000 incidencias (~5 MB). */
export const MAX_DIAS_RANGO = 92;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function mesLabel(mes: string): string {
  const m = Number(mes.slice(5, 7));
  return `${MESES[m - 1] ?? mes} de ${mes.slice(0, 4)}`;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function sumarDias(fechaISO: string, n: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** Días calendario inclusivos entre dos fechas ISO. */
export function diasInclusivos(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Primer y último día del mes "YYYY-MM". */
export function limitesDelMes(mes: string): { desde: string; hasta: string } {
  const d = new Date(`${mes}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return { desde: `${mes}-01`, hasta: iso(d) };
}

/**
 * Si el rango es un mes calendario completo devuelve ese mes; si no, null.
 * El mes en curso cuenta como completo cuando termina hoy (no hay días futuros
 * que consultar).
 */
export function mesCompleto(desde: string, hasta: string, hoy?: string): string | null {
  const mes = mesDe(desde);
  const l = limitesDelMes(mes);
  if (l.desde !== desde) return null;
  if (l.hasta === hasta) return mes;
  return hoy && hasta === hoy && mesDe(hoy) === mes ? mes : null;
}

/** "3 de septiembre de 2026". */
export function fechaLarga(fechaISO: string): string {
  return `${Number(fechaISO.slice(8, 10))} de ${MESES[Number(fechaISO.slice(5, 7)) - 1]} de ${fechaISO.slice(0, 4)}`;
}

/** "del 3 al 15 de septiembre de 2026" · "del 28 de agosto al 7 de septiembre de 2026". */
export function rangoLabel(desde: string, hasta: string): string {
  if (desde === hasta) return `el ${fechaLarga(desde)}`;
  const mismoMes = mesDe(desde) === mesDe(hasta);
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  const ini = mismoMes
    ? String(Number(desde.slice(8, 10)))
    : mismoAnio
      ? `${Number(desde.slice(8, 10))} de ${MESES[Number(desde.slice(5, 7)) - 1]}`
      : fechaLarga(desde);
  return `del ${ini} al ${fechaLarga(hasta)}`;
}

/** "DD/MM/AAAA". */
export function ddmmaaaa(fechaISO: string): string {
  return `${fechaISO.slice(8, 10)}/${fechaISO.slice(5, 7)}/${fechaISO.slice(0, 4)}`;
}

/** "DD/MM" para etiquetas cortas. */
export function ddmm(fechaISO: string): string {
  return `${fechaISO.slice(8, 10)}/${fechaISO.slice(5, 7)}`;
}

/** Lunes de la semana (lunes a domingo) a la que pertenece la fecha. */
export function lunesDe(fechaISO: string): string {
  // getUTCDay: 0 domingo … 6 sábado. Días transcurridos desde el lunes.
  const dow = new Date(`${fechaISO}T00:00:00Z`).getUTCDay();
  return sumarDias(fechaISO, -((dow + 6) % 7));
}

/**
 * Semanas completas de lunes a domingo que cubren el periodo consultado: la
 * primera arranca el lunes de la semana de `desde` y la última termina el
 * domingo de la semana de `hasta`, aunque esos días caigan en otro mes. La
 * semana nunca se recorta al mes: el mínimo de incidencias para reportar a
 * RRHH se cuenta sobre la semana entera. Numeración 1..n dentro del periodo.
 */
export function semanasDelRango(desde: string, hasta: string): Semana[] {
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta) || hasta < desde) return [];
  const out: Semana[] = [];
  for (let lunes = lunesDe(desde); lunes <= hasta; lunes = sumarDias(lunes, 7)) {
    const domingo = sumarDias(lunes, 6);
    const n = out.length + 1;
    out.push({ numero: n, desde: lunes, hasta: domingo, label: `Semana ${n} · ${ddmm(lunes)} al ${ddmm(domingo)}` });
  }
  return out;
}

/**
 * Fechas que hay que consultar para que las semanas del periodo salgan
 * completas: del primer lunes al último domingo, sin pasar de hoy.
 */
export function rangoDeConsulta(semanas: Semana[], hoy: string): { desde: string; hasta: string } {
  const desde = semanas[0].desde;
  const hasta = semanas[semanas.length - 1].hasta;
  return { desde, hasta: hasta > hoy ? hoy : hasta };
}

export function semanaDe(fecha: string, semanas: Semana[]): Semana | null {
  return semanas.find((s) => fecha >= s.desde && fecha <= s.hasta) ?? null;
}

/** Mes "YYYY-MM" de una fecha ISO. */
export function mesDe(fechaISO: string): string {
  return fechaISO.slice(0, 7);
}

/** Mes anterior o siguiente. */
export function mesVecino(mes: string, delta: number): string {
  const d = new Date(`${mes}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

// ── Velocidad ────────────────────────────────────────────────────────────────

export type NivelVelocidad = "bajo" | "moderado" | "alto" | "critico";

/** Bandas del análisis de mayo 2026: 60–65 bajo, 66–70 moderado, 71–80 alto, 81+ crítico. */
export function nivelVelocidad(kmh: number): NivelVelocidad {
  if (kmh > 80) return "critico";
  if (kmh > 70) return "alto";
  if (kmh > 65) return "moderado";
  return "bajo";
}

export const NIVEL_VELOCIDAD_LABEL: Record<NivelVelocidad, string> = {
  bajo: "Bajo (hasta 65)",
  moderado: "Moderado (66–70)",
  alto: "Alto (71–80)",
  critico: "Crítico (más de 80)",
};

export const NIVEL_VELOCIDAD_COLOR: Record<NivelVelocidad, { fuerte: string; suave: string; texto: string }> = {
  bajo: { fuerte: "#F59E0B", suave: "#FFFBEB", texto: "#92400E" },
  moderado: { fuerte: "#EA580C", suave: "#FFF7ED", texto: "#9A3412" },
  alto: { fuerte: "#DC2626", suave: "#FEF2F2", texto: "#991B1B" },
  critico: { fuerte: "#7F1D1D", suave: "#FEE2E2", texto: "#7F1D1D" },
};

/** Duración de la incidencia en minutos (al menos 1). */
export function duracionMinutos(i: { inicio: string; fin: string }): number {
  const ms = Date.parse(`${i.fin}Z`) - Date.parse(`${i.inicio}Z`);
  return Math.max(1, Math.round(ms / 60_000));
}

/** "HH:MM" de una marca "YYYY-MM-DDTHH:MM:SS". */
export function horaDe(ts: string): string {
  return ts.slice(11, 16);
}

export function enlaceMapa(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// ── Agrupación por conductor y semana ────────────────────────────────────────

/** Los reportes vigentes se emparejan con la semana por su fecha de inicio. */
function reporteDe(reportes: ReporteRrhh[], cedula: string, semana: Semana): ReporteRrhh | null {
  return reportes.find((r) => r.cedula === cedula && r.semanaDesde <= semana.hasta && r.semanaHasta >= semana.desde) ?? null;
}

export function agruparPorConductorSemana(
  incidencias: Incidencia[],
  semanas: Semana[],
  reportes: ReporteRrhh[],
  minimo: number
): ConductorSemana[] {
  const grupos = new Map<string, ConductorSemana>();
  for (const i of incidencias) {
    if (!i.cedula) continue;
    const semana = semanaDe(i.fecha, semanas);
    if (!semana) continue;
    const key = `${i.cedula}|${semana.desde}`;
    let g = grupos.get(key);
    if (!g) {
      g = {
        key,
        cedula: i.cedula,
        codigo: i.codigo,
        nombre: i.nombre ?? i.cedula,
        semana,
        incidencias: [],
        velocidadMax: 0,
        vehiculos: [],
        rutas: [],
        reportable: false,
        reporte: null,
      };
      grupos.set(key, g);
    }
    g.incidencias.push(i);
    if (i.velocidadMax > g.velocidadMax) g.velocidadMax = i.velocidadMax;
    if (!g.vehiculos.includes(i.vehiculo)) g.vehiculos.push(i.vehiculo);
    if (i.ruta && !g.rutas.includes(i.ruta)) g.rutas.push(i.ruta);
    if (!g.codigo && i.codigo) g.codigo = i.codigo;
  }
  const out = [...grupos.values()];
  for (const g of out) {
    g.incidencias.sort((a, b) => a.inicio.localeCompare(b.inicio));
    g.vehiculos.sort();
    g.rutas.sort((a, b) => a.localeCompare(b, "es"));
    g.reportable = g.incidencias.length >= minimo;
    g.reporte = reporteDe(reportes, g.cedula, g.semana);
  }
  // Semana, luego más incidencias, luego mayor velocidad.
  out.sort(
    (a, b) =>
      a.semana.numero - b.semana.numero ||
      b.incidencias.length - a.incidencias.length ||
      b.velocidadMax - a.velocidadMax ||
      a.nombre.localeCompare(b.nombre, "es")
  );
  return out;
}

export function resumirSemanas(
  semanas: Semana[],
  grupos: ConductorSemana[],
  incidencias: Incidencia[]
): ResumenSemana[] {
  return semanas.map((semana) => {
    const propios = grupos.filter((g) => g.semana.desde === semana.desde);
    return {
      semana,
      conductores: propios.length,
      reportables: propios.filter((g) => g.reportable).length,
      reportados: propios.filter((g) => g.reportable && g.reporte).length,
      incidencias: incidencias.filter((i) => i.fecha >= semana.desde && i.fecha <= semana.hasta).length,
      sinConductor: incidencias.filter((i) => !i.cedula && i.fecha >= semana.desde && i.fecha <= semana.hasta).length,
    };
  });
}

// ── Consolidado: una fila por conductor, una columna por semana ──────────────

export interface CeldaConsolidado {
  incidencias: number;
  velocidadMax: number;
  reportable: boolean;
  reporte: ReporteRrhh | null;
  /** Grupo conductor-semana de origen, para saltar al detalle. */
  grupo: ConductorSemana;
}

export interface ConductorConsolidado {
  cedula: string;
  codigo: string | null;
  nombre: string;
  /** Por número de semana; sin entrada = sin incidencias esa semana. */
  semanas: Record<number, CeldaConsolidado>;
  total: number;
  velocidadMax: number;
  semanasReportables: number;
  semanasReportadas: number;
  vehiculos: string[];
}

export interface TotalSemanaConsolidado {
  incidencias: number;
  conductores: number;
  reportables: number;
  pendientes: number;
}

/**
 * Consolida los grupos conductor-semana en una fila por conductor con una
 * celda por semana. Orden: más incidencias en el periodo, mayor velocidad
 * máxima, nombre.
 */
export function consolidarPorConductor(grupos: ConductorSemana[]): ConductorConsolidado[] {
  const filas = new Map<string, ConductorConsolidado>();
  for (const g of grupos) {
    let f = filas.get(g.cedula);
    if (!f) {
      f = {
        cedula: g.cedula, codigo: g.codigo, nombre: g.nombre, semanas: {},
        total: 0, velocidadMax: 0, semanasReportables: 0, semanasReportadas: 0, vehiculos: [],
      };
      filas.set(g.cedula, f);
    }
    f.semanas[g.semana.numero] = {
      incidencias: g.incidencias.length, velocidadMax: g.velocidadMax, reportable: g.reportable, reporte: g.reporte, grupo: g,
    };
    f.total += g.incidencias.length;
    if (g.velocidadMax > f.velocidadMax) f.velocidadMax = g.velocidadMax;
    if (g.reportable) f.semanasReportables += 1;
    if (g.reportable && g.reporte) f.semanasReportadas += 1;
    if (!f.codigo && g.codigo) f.codigo = g.codigo;
    for (const v of g.vehiculos) if (!f.vehiculos.includes(v)) f.vehiculos.push(v);
  }
  const out = [...filas.values()];
  for (const f of out) f.vehiculos.sort();
  out.sort((a, b) => b.total - a.total || b.velocidadMax - a.velocidadMax || a.nombre.localeCompare(b.nombre, "es"));
  return out;
}

/** Totales por columna (semana) de las filas consolidadas que se muestran. */
export function totalesConsolidado(filas: ConductorConsolidado[], semanas: Semana[]): Record<number, TotalSemanaConsolidado> {
  const out: Record<number, TotalSemanaConsolidado> = {};
  for (const s of semanas) {
    const t: TotalSemanaConsolidado = { incidencias: 0, conductores: 0, reportables: 0, pendientes: 0 };
    for (const f of filas) {
      const c = f.semanas[s.numero];
      if (!c) continue;
      t.incidencias += c.incidencias;
      t.conductores += 1;
      if (c.reportable) t.reportables += 1;
      if (c.reportable && !c.reporte) t.pendientes += 1;
    }
    out[s.numero] = t;
  }
  return out;
}

/** "S1 31/08–06/09": encabezado corto de la columna de una semana. */
export function semanaCorta(s: Semana): string {
  return `S${s.numero} ${ddmm(s.desde)}–${ddmm(s.hasta)}`;
}

/** Texto por semana del estado ante RRHH: "S1 reportado 05/09 · S2 pendiente". */
export function estadoRrhhTexto(f: ConductorConsolidado, semanas: Semana[]): string {
  return semanas
    .map((s) => f.semanas[s.numero])
    .filter((c): c is CeldaConsolidado => !!c && c.reportable)
    .map((c) => `S${c.grupo.semana.numero} ${c.reporte ? `reportado ${ddmm(c.reporte.reportadoEn)}` : "pendiente"}`)
    .join(" · ");
}

/** Texto de la regla vigente, para la pantalla y el pie de los informes. */
export function reglaTexto(p: ParametrosVelocidad): string[] {
  return [
    `Exceso: evento GPS con velocidad de ${p.umbralKmh} km/h o más (GEMA solo reporta desde 50 km/h).`,
    `Incidencia: eventos del mismo vehículo separados por menos de ${p.minutosAgrupacion} minutos cuentan como una sola, con su velocidad máxima.`,
    `El conductor es el del viaje que tenía el vehículo despachado a esa hora; sin viaje que la cubra, la incidencia queda "sin conductor" y se revisa por vehículo.`,
    `Semanas completas de lunes a domingo, aunque crucen de un mes a otro: el periodo consultado se amplía hasta cubrirlas. Se reporta a RRHH el conductor con ${p.minimoIncidencias} o más incidencias en la misma semana.`,
  ];
}
