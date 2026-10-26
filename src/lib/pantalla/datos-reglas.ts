/**
 * Datos vivos de la pantalla informativa — reglas PURAS y forma de los datos.
 *
 * `datos.ts` lee la base y llama a estas funciones; el editor usa
 * `datosDeMuestra` para pintar los widgets sin consultar nada. Todas reciben
 * `hoy` (AAAA-MM-DD, Bogotá) como parámetro para poder probarlas.
 *
 * Privacidad: lo que sale de aquí se pinta en un televisor en un pasillo.
 * Marcaciones va solo en cifras; cumpleaños sin año ni edad.
 */

// ── Forma de los datos que viajan al TV ─────────────────────────────────────

export interface PuntoMes {
  /** "2026-10" */
  clave: string;
  /** "oct 26" */
  etiqueta: string;
  total: number;
  graves: number;
}

export interface FactorRiesgo {
  /** Clave de la Política de Correctivos: exceso_velocidad, uso_celular, no_distancia, fatiga. */
  clave: string;
  etiqueta: string;
  /** Accidentes con ese factor en el periodo. */
  accidentes: number;
  /** Accidentes del periodo (con o sin factor). */
  total: number;
  /** «mes» si hubo accidentes con factor este mes; si no, los últimos tres meses. */
  periodo: "mes" | "trimestre";
}

export interface DatosAccidentabilidad {
  mesActual: { clave: string; etiqueta: string; total: number; graves: number; fatales: number; variacion: number | null };
  mesAnterior: { clave: string; etiqueta: string; total: number };
  serie: PuntoMes[];
  diasSinAccidentes: number | null;
  ultimoAccidente: string | null;
  /** Ausente en datos guardados antes de este widget. */
  factor?: FactorRiesgo | null;
}

export interface SemanaVelocidad {
  /** Lunes. */
  desde: string;
  /** Hasta hoy (semana en curso) o domingo. */
  hasta: string;
  incidencias: number;
  /** Conductores distintos con al menos un exceso. */
  conductores: number;
}

export interface DatosVelocidad {
  actual: SemanaVelocidad;
  anterior: SemanaVelocidad;
  /** Conductores activos (base del porcentaje sin excesos). */
  activos: number | null;
  umbralKmh: number;
  /** Último día con datos de GPS: si va atrasado, se dice. */
  datosHasta: string | null;
  /**
   * La semana mostrada es la de hoy. Falso cuando el GPS todavía no trae datos
   * de esta semana (p. ej. un lunes): se muestra la última semana con datos,
   * porque «0 excesos esta semana» sería falso.
   */
  semanaEnCurso?: boolean;
}

/** Fecha desde la que se arman las semanas: hoy, o el último día con datos si va atrasado. */
export function baseVelocidad(hoy: string, datosHasta: string | null): { base: string; enCurso: boolean } {
  if (!datosHasta || datosHasta >= hoy) return { base: hoy, enCurso: true };
  const { actual } = semanasVelocidad(hoy);
  // Si ya hay datos de esta semana (aunque no de hoy), se sigue mostrando esta semana.
  if (datosHasta >= actual.desde) return { base: hoy, enCurso: true };
  return { base: datosHasta, enCurso: false };
}

export interface DatosVacantes {
  total: number;
  /** Títulos de las vacantes abiertas, las más recientes primero. */
  titulos: string[];
  /** Lo máximo que gana un padrino por un referido (esquema A de la política vigente). */
  padrinoMaximo: number | null;
  /** Referidos registrados este mes (no anulados). */
  referidosMes: number;
}

export interface DatosAusentismo {
  anio: number;
  totales: {
    eventos: number;
    dias: number;
    trabajadores: number;
    promedio: number;
    activos: number | null;
    pctAfectados: number | null;
  };
  mensual: { mes: string; etiqueta: string; eventos: number; dias: number; tasa: number | null; parcial: boolean }[];
}

export interface ConteosMarcaciones {
  fecha: string;
  esperados: number;
  trabajaron: number;
  porSalir: number;
  sinDespacho: number;
  conNovedad: number;
  marcaron: number;
  despachoSincronizadoHasta: string | null;
  /** De los que ya salieron a rodar hoy, cuántos pasaron la huella (ausente en datos viejos). */
  trabajaronConHuella?: number;
}

export interface PersonaFecha {
  nombre: string;
  dia: number;
  esHoy: boolean;
}

export interface PersonaAniversario extends PersonaFecha {
  anios: number;
}

export interface DatosPersonasMes {
  /** "2026-10" */
  mes: string;
  personas: PersonaFecha[];
}

export interface DatosAniversariosMes {
  mes: string;
  personas: PersonaAniversario[];
}

/**
 * Lo que necesitan los widgets. Clave ausente = no se pidió; `null` = se pidió
 * y falló (el widget dice «Sin datos» y el resto de la pantalla sigue).
 */
export interface DatosWidgets {
  hoy: string;
  accidentabilidad?: DatosAccidentabilidad | null;
  ausentismo?: DatosAusentismo | null;
  marcaciones?: ConteosMarcaciones | null;
  cumpleanos?: DatosPersonasMes | null;
  aniversarios?: DatosAniversariosMes | null;
  velocidad?: DatosVelocidad | null;
  vacantes?: DatosVacantes | null;
  bienvenidas?: DatosPersonasMes | null;
}

// ── Factor de riesgo ────────────────────────────────────────────────────────

/** Consejo para cada factor de la Política de Correctivos, en tono de recordatorio. */
export const CONSEJOS_FACTOR: Record<string, { titulo: string; consejo: string; emoji: string }> = {
  uso_celular: { titulo: "Uso del celular", consejo: "Cero celular al volante. Si tiene que contestar, deténgase en un lugar seguro.", emoji: "📵" },
  exceso_velocidad: { titulo: "Exceso de velocidad", consejo: "Respete los límites. Llegar un minuto antes no vale un accidente.", emoji: "🐢" },
  no_distancia: { titulo: "No guardar la distancia", consejo: "Deje espacio con el vehículo de adelante: al menos tres segundos.", emoji: "↔️" },
  fatiga: { titulo: "Fatiga", consejo: "Si siente sueño, avise y descanse. Dormir bien también es seguridad.", emoji: "😴" },
};

/**
 * El factor más frecuente: el del mes si hubo accidentes con factor, si no el
 * de los últimos tres meses. `conteo` viene ordenado (contarFactoresPolitica).
 */
export function elegirFactor(
  delMes: { conteo: readonly { clave: string; etiqueta: string; count: number }[]; total: number },
  delTrimestre: { conteo: readonly { clave: string; etiqueta: string; count: number }[]; total: number }
): FactorRiesgo | null {
  const usar = delMes.conteo[0] ? { ...delMes, periodo: "mes" as const } : delTrimestre.conteo[0] ? { ...delTrimestre, periodo: "trimestre" as const } : null;
  if (!usar) return null;
  const f = usar.conteo[0];
  return {
    clave: f.clave,
    etiqueta: CONSEJOS_FACTOR[f.clave]?.titulo ?? f.etiqueta,
    accidentes: f.count,
    total: usar.total,
    periodo: usar.periodo,
  };
}

// ── Velocidad ───────────────────────────────────────────────────────────────

const DIA = 86_400_000;
const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Lunes de la semana de `fecha` y el lunes de la anterior. */
export function semanasVelocidad(hoy: string): { actual: { desde: string; hasta: string }; anterior: { desde: string; hasta: string } } {
  const t = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = lunes
  const lunes = t - dow * DIA;
  return {
    actual: { desde: isoDe(lunes), hasta: hoy },
    anterior: { desde: isoDe(lunes - 7 * DIA), hasta: isoDe(lunes - DIA) },
  };
}

/** Totales de una semana: incidencias y conductores distintos (sin conductor no cuenta como persona). */
export function resumirVelocidad(
  incidencias: readonly { fecha: string; cedula: string | null }[],
  semana: { desde: string; hasta: string }
): SemanaVelocidad {
  const de = incidencias.filter((i) => i.fecha >= semana.desde && i.fecha <= semana.hasta);
  return {
    ...semana,
    incidencias: de.length,
    conductores: new Set(de.map((i) => i.cedula).filter(Boolean)).size,
  };
}

// ── Bienvenidas ─────────────────────────────────────────────────────────────

/** Quienes ingresaron en el mes de `hoy`, hasta hoy (no fechas futuras), por día. */
export function bienvenidasDelMes(
  personas: readonly { nombre: string; fecha_ingreso: string | null; orden?: OrdenNombre }[],
  hoy: string
): PersonaFecha[] {
  const mes = hoy.slice(0, 7);
  const vistos = new Set<string>();
  const out: PersonaFecha[] = [];
  for (const p of personas) {
    const f = p.fecha_ingreso;
    if (!f || f.slice(0, 7) !== mes || f.slice(0, 10) > hoy) continue;
    const nombre = nombreCorto(p.nombre, p.orden);
    const dia = +f.slice(8, 10);
    if (!nombre || vistos.has(`${nombre}|${dia}`)) continue;
    vistos.add(`${nombre}|${dia}`);
    out.push({ nombre, dia, esHoy: f.slice(0, 10) === hoy });
  }
  return out.sort((a, b) => b.dia - a.dia || a.nombre.localeCompare(b.nombre));
}

// ── Fechas ──────────────────────────────────────────────────────────────────

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-10" → "oct 26" (igual que el análisis de accidentabilidad). */
export function etiquetaMes(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES_CORTOS[(m ?? 1) - 1]} ${String(a).slice(2)}`;
}

/** "2026-10" → "octubre". */
export function nombreMes(ym: string): string {
  return MESES_LARGOS[Number(ym.slice(5, 7)) - 1] ?? "";
}

function sumarMeses(ym: string, n: number): string {
  const [a, m] = ym.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function mesActualYAnterior(hoy: string): { actual: string; anterior: string } {
  const actual = hoy.slice(0, 7);
  return { actual, anterior: sumarMeses(actual, -1) };
}

/** Los `n` meses que terminan en el de `hoy`, con el rango de fechas que los cubre. */
export function ultimosMeses(hoy: string, n = 12): { desde: string; hasta: string; meses: string[] } {
  const actual = hoy.slice(0, 7);
  const meses = Array.from({ length: n }, (_, i) => sumarMeses(actual, i - (n - 1)));
  return { desde: `${meses[0]}-01`, hasta: hoy, meses };
}

/** Serie con todos los meses pedidos, en cero donde no hubo nada. */
export function completarMeses(
  serie: readonly { clave: string; count: number; graves?: number }[],
  meses: readonly string[]
): PuntoMes[] {
  const por = new Map(serie.map((p) => [p.clave, p]));
  return meses.map((m) => {
    const p = por.get(m);
    return { clave: m, etiqueta: etiquetaMes(m), total: p?.count ?? 0, graves: p?.graves ?? 0 };
  });
}

const diaUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Días calendario desde el último accidente hasta hoy. Null si no hay ninguno. */
export function diasSinAccidentes(ultimaFechaIso: string | null, hoy: string): number | null {
  if (!ultimaFechaIso || !/^\d{4}-\d{2}-\d{2}/.test(ultimaFechaIso)) return null;
  return Math.max(0, Math.round((diaUTC(hoy) - diaUTC(ultimaFechaIso.slice(0, 10))) / 86_400_000));
}

const esBisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/**
 * Orden de las palabras en el maestro: GEMA (conductores) guarda
 * «APELLIDO APELLIDO NOMBRE NOMBRE»; empleados, «Nombre Apellido».
 */
export type OrdenNombre = "apellidos_primero" | "nombre_primero";

const titulo = (p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();

/** Primer nombre y primer apellido, en formato de título, para que quepa en pantalla. */
export function nombreCorto(nombre: string, orden: OrdenNombre = "nombre_primero"): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes.map(titulo).join("");
  let elegidas: string[];
  if (orden === "apellidos_primero") {
    // 4+: AP1 AP2 NOM1 NOM2 → Nom1 Ap1 · 3: AP1 AP2 NOM → Nom Ap1 · 2: AP NOM → Nom Ap
    elegidas = partes.length >= 3 ? [partes[2], partes[0]] : [partes[1], partes[0]];
  } else {
    // 4+: Nom1 Nom2 Ap1 Ap2 → Nom1 Ap1 · 2-3: Nom Ap… → Nom Ap
    elegidas = partes.length >= 4 ? [partes[0], partes[2]] : [partes[0], partes[1]];
  }
  return elegidas.map(titulo).join(" ");
}

/**
 * Quienes cumplen años en el mes de `hoy` desde hoy en adelante (los que ya
 * pasaron no se muestran), ordenados por día, sin año ni edad. El 29 de
 * febrero se celebra el 28 en años no bisiestos.
 */
export function cumpleanosDelMes(
  personas: readonly { nombre: string; fecha_nacimiento: string | null; orden?: OrdenNombre }[],
  hoy: string
): PersonaFecha[] {
  const anio = +hoy.slice(0, 4);
  const mes = +hoy.slice(5, 7);
  const diaHoy = +hoy.slice(8, 10);
  const vistos = new Set<string>();
  const out: PersonaFecha[] = [];
  for (const p of personas) {
    const f = p.fecha_nacimiento;
    if (!f || !/^\d{4}-\d{2}-\d{2}/.test(f)) continue;
    const m = +f.slice(5, 7);
    let d = +f.slice(8, 10);
    if (m === 2 && d === 29 && !esBisiesto(anio)) d = 28;
    if (m !== mes || d < diaHoy) continue;
    const nombre = nombreCorto(p.nombre, p.orden);
    if (!nombre) continue;
    const clave = `${nombre}|${d}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ nombre, dia: d, esHoy: d === diaHoy });
  }
  return out.sort((a, b) => a.dia - b.dia || a.nombre.localeCompare(b.nombre));
}

/**
 * Quienes cumplen años en la empresa este mes, desde hoy en adelante (los que
 * ya pasaron no se muestran). Excluye a quien ingresó este mismo año (0 años).
 */
export function aniversariosDelMes(
  personas: readonly { nombre: string; fecha_ingreso: string | null; orden?: OrdenNombre }[],
  hoy: string
): PersonaAniversario[] {
  const anio = +hoy.slice(0, 4);
  const mes = +hoy.slice(5, 7);
  const diaHoy = +hoy.slice(8, 10);
  const vistos = new Set<string>();
  const out: PersonaAniversario[] = [];
  for (const p of personas) {
    const f = p.fecha_ingreso;
    if (!f || !/^\d{4}-\d{2}-\d{2}/.test(f)) continue;
    const a = +f.slice(0, 4);
    let d = +f.slice(8, 10);
    if (+f.slice(5, 7) !== mes) continue;
    if (d === 29 && mes === 2 && !esBisiesto(anio)) d = 28;
    if (d < diaHoy) continue;
    const anios = anio - a;
    if (anios <= 0) continue;
    const nombre = nombreCorto(p.nombre, p.orden);
    if (!nombre) continue;
    const clave = `${nombre}|${d}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ nombre, dia: d, anios, esHoy: d === diaHoy });
  }
  return out.sort((a, b) => a.dia - b.dia || b.anios - a.anios || a.nombre.localeCompare(b.nombre));
}

/** Cifras del día a partir de las listas del resumen de marcaciones. */
export function conteosDeResumen(
  r: { sinDespacho: unknown[]; porSalir: unknown[]; trabajaron: unknown[]; conNovedad: unknown[]; marcaron: unknown[] },
  extra: { fecha: string; esperados: number; despachoSincronizadoHasta: string | null }
): ConteosMarcaciones {
  return {
    fecha: extra.fecha,
    esperados: extra.esperados,
    trabajaron: r.trabajaron.length,
    porSalir: r.porSalir.length,
    sinDespacho: r.sinDespacho.length,
    conNovedad: r.conNovedad.length,
    marcaron: r.marcaron.length,
    despachoSincronizadoHasta: extra.despachoSincronizadoHasta,
  };
}

/** Datos ficticios y estables para que el editor pinte los widgets sin consultar la base. */
export function datosDeMuestra(hoy: string): DatosWidgets {
  const { meses } = ultimosMeses(hoy, 12);
  const base = [4, 6, 3, 5, 7, 2, 4, 3, 5, 6, 2, 3];
  const { actual, anterior } = mesActualYAnterior(hoy);
  const mesesAnio = meses.filter((m) => m.startsWith(hoy.slice(0, 4)));
  // Igual que los datos reales: solo de hoy al fin de mes.
  const diaHoy = +hoy.slice(8, 10);
  const finMes = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7), 0)).getUTCDate();
  const proximos = (saltos: number[]) => [...new Set(saltos.map((s) => Math.min(finMes, diaHoy + s)))];
  const cumple = proximos([0, 2, 4, 5]).map((dia, i) => ({ nombre: ["Ana Pérez", "Luis Gómez", "Marta Ruiz", "Jorge Díaz"][i], dia, esHoy: dia === diaHoy }));
  const aniv = proximos([1, 3, 5]).map((dia, i) => ({ nombre: ["Carlos Rojas", "Diana Mora", "Pedro León"][i], dia, anios: [10, 3, 1][i], esHoy: dia === diaHoy }));
  return {
    hoy,
    accidentabilidad: {
      mesActual: { clave: actual, etiqueta: etiquetaMes(actual), total: 3, graves: 1, fatales: 0, variacion: -25 },
      mesAnterior: { clave: anterior, etiqueta: etiquetaMes(anterior), total: 4 },
      serie: meses.map((m, i) => ({ clave: m, etiqueta: etiquetaMes(m), total: base[i], graves: i % 3 === 0 ? 1 : 0 })),
      diasSinAccidentes: 12,
      ultimoAccidente: hoy,
      factor: { clave: "uso_celular", etiqueta: "Uso del celular", accidentes: 2, total: 3, periodo: "mes" },
    },
    velocidad: (() => {
      const s = semanasVelocidad(hoy);
      return {
        actual: { ...s.actual, incidencias: 38, conductores: 21 },
        anterior: { ...s.anterior, incidencias: 52, conductores: 27 },
        activos: 180,
        umbralKmh: 60,
        datosHasta: hoy,
      };
    })(),
    vacantes: {
      total: 3,
      titulos: ["Conductor de bus", "Auxiliar de mantenimiento", "Despachador"],
      padrinoMaximo: 700000,
      referidosMes: 4,
    },
    bienvenidas: {
      mes: actual,
      personas: [
        { nombre: "Andrés Mejía", dia: Math.max(1, diaHoy - 2), esHoy: false },
        { nombre: "Sofía Cárdenas", dia: Math.max(1, diaHoy - 9), esHoy: false },
      ],
    },
    ausentismo: {
      anio: +hoy.slice(0, 4),
      totales: { eventos: 184, dias: 1320, trabajadores: 92, promedio: 7.2, activos: 180, pctAfectados: 51.1 },
      mensual: mesesAnio.map((m, i) => ({
        mes: m,
        etiqueta: etiquetaMes(m),
        eventos: 12 + ((i * 7) % 9),
        dias: 90 + ((i * 37) % 70),
        tasa: 2 + ((i * 3) % 4) / 2,
        parcial: m === actual,
      })),
    },
    marcaciones: {
      fecha: hoy,
      esperados: 160,
      trabajaron: 141,
      porSalir: 9,
      sinDespacho: 6,
      conNovedad: 4,
      marcaron: 150,
      despachoSincronizadoHasta: null,
      trabajaronConHuella: 96,
    },
    cumpleanos: { mes: actual, personas: cumple },
    aniversarios: { mes: actual, personas: aniv },
  };
}
