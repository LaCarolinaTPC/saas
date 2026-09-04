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
  /** 1..n dentro del mes. */
  numero: number;
  /** Lunes (o el día 1 del mes si el mes arranca entre semana). */
  desde: string;
  /** Domingo (o el último día del mes). */
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

function sumarDias(fechaISO: string, n: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** "DD/MM" para etiquetas cortas. */
export function ddmm(fechaISO: string): string {
  return `${fechaISO.slice(8, 10)}/${fechaISO.slice(5, 7)}`;
}

/**
 * Semanas del mes de lunes a domingo, recortadas al mes: la primera empieza
 * el día 1 aunque no sea lunes y la última termina el último día del mes.
 */
export function semanasDelMes(mes: string): Semana[] {
  if (!MES_RE.test(mes)) return [];
  const primero = `${mes}-01`;
  const d = new Date(`${primero}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  const ultimo = iso(d);

  const out: Semana[] = [];
  let desde = primero;
  let n = 1;
  while (desde <= ultimo) {
    // getUTCDay: 0 domingo … 6 sábado. Días que faltan hasta el domingo.
    const dow = new Date(`${desde}T00:00:00Z`).getUTCDay();
    const hastaDomingo = sumarDias(desde, (7 - dow) % 7);
    const hasta = hastaDomingo < ultimo ? hastaDomingo : ultimo;
    out.push({ numero: n, desde, hasta, label: `Semana ${n} · ${ddmm(desde)} al ${ddmm(hasta)}` });
    desde = sumarDias(hasta, 1);
    n += 1;
  }
  return out;
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

/** Texto de la regla vigente, para la pantalla y el pie de los informes. */
export function reglaTexto(p: ParametrosVelocidad): string[] {
  return [
    `Exceso: evento GPS con velocidad de ${p.umbralKmh} km/h o más (GEMA solo reporta desde 50 km/h).`,
    `Incidencia: eventos del mismo vehículo separados por menos de ${p.minutosAgrupacion} minutos cuentan como una sola, con su velocidad máxima.`,
    `El conductor es el del viaje que tenía el vehículo despachado a esa hora; sin viaje que la cubra, la incidencia queda "sin conductor" y se revisa por vehículo.`,
    `Semanas de lunes a domingo recortadas al mes. Se reporta a RRHH el conductor con ${p.minimoIncidencias} o más incidencias en la misma semana.`,
  ];
}
