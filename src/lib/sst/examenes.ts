/**
 * Exámenes médicos ocupacionales periódicos (Recursos Humanos – SST) — reglas
 * PURAS: grupos de control, próximo examen, semáforo de vencimiento y
 * validación de los formularios. Sin E/S: se prueban con `npm run test:sst`.
 *
 * Reemplaza el Excel «LISTADO PERSONAL EXAMEN PERIODICO»: sus hojas mensuales
 * son las atenciones (`sst_examenes_periodicos`) y sus hojas de control, la
 * población que se vigila (`sst_examenes_personas`). Ver
 * docs/modulos/examenes-periodicos.md.
 */

type Opcion = { key: string; label: string };

/** Las cinco hojas de control del Excel. */
export const GRUPOS_EXAMEN = [
  { key: "conductores", label: "Conductores La Carolina" },
  { key: "administrativos", label: "Administrativos La Carolina" },
  { key: "reubicados", label: "Reubicados La Carolina" },
  { key: "metrorecaudo", label: "Metrorecaudo" },
  { key: "anaya_giraldo", label: "Anaya Giraldo" },
] as const satisfies readonly Opcion[];
export type GrupoExamen = (typeof GRUPOS_EXAMEN)[number]["key"];

export const ESTADOS_EXAMEN = [
  { key: "vencido", label: "Vencido" },
  { key: "por_vencer", label: "Por vencer" },
  { key: "sin_examen", label: "Sin examen" },
  { key: "vigente", label: "Vigente" },
] as const satisfies readonly Opcion[];
export type EstadoExamen = (typeof ESTADOS_EXAMEN)[number]["key"];

export const MOTIVOS_INACTIVO = [
  { key: "retirado", label: "Retirado" },
  { key: "otro", label: "Otro" },
] as const satisfies readonly Opcion[];
export type MotivoInactivo = (typeof MOTIVOS_INACTIVO)[number]["key"];

/** Un examen que vence en este número de días o menos está «por vencer». */
export const POR_VENCER_DIAS = 30;
/** Periodicidad por defecto (meses) y las que se ofrecen en el formulario. */
export const PERIODICIDAD_DEFECTO = 12;
export const PERIODICIDADES = [12, 24, 36] as const;
export const PERIODICIDAD_MIN = 6;
export const PERIODICIDAD_MAX = 60;
export const MAX_TEXTO = 4000;

const etiqueta = (lista: readonly Opcion[], k: string) => lista.find((o) => o.key === k)?.label ?? k;
export const etiquetaGrupo = (k: string) => etiqueta(GRUPOS_EXAMEN, k);
export const etiquetaEstado = (k: string) => etiqueta(ESTADOS_EXAMEN, k);
export const esGrupo = (v: unknown): v is GrupoExamen => typeof v === "string" && GRUPOS_EXAMEN.some((g) => g.key === v);

// ── Fechas (AAAA-MM-DD, sin zona) ───────────────────────────────────────────

/** Suma meses calendario; si el día no existe en el mes de llegada, el último del mes (31-ene + 1 = 28/29-feb). */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);
}

export const proximoExamen = (fechaAtencion: string, periodicidadMeses: number) => sumarMeses(fechaAtencion, periodicidadMeses);

/** Semáforo de una persona según su próximo examen (null = nunca se ha examinado). */
export function estadoExamen(proximo: string | null, hoy: string): { estado: EstadoExamen; dias: number | null } {
  if (!proximo) return { estado: "sin_examen", dias: null };
  const dias = diasEntre(hoy, proximo);
  if (dias < 0) return { estado: "vencido", dias };
  if (dias <= POR_VENCER_DIAS) return { estado: "por_vencer", dias };
  return { estado: "vigente", dias };
}

/** El texto de la columna «ALERTAS» del Excel. */
export function textoDias(dias: number | null): string {
  if (dias == null) return "Sin examen registrado";
  if (dias < 0) return `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}`;
  if (dias === 0) return "Vence hoy";
  return `Faltan ${dias} día${dias === 1 ? "" : "s"}`;
}

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface PersonaExamen {
  cedula: string;
  nombre: string;
  cargo: string | null;
  grupo: GrupoExamen;
  fechaIngreso: string | null;
  /** Cada cuántos meses le toca; sin exámenes, el primero vence a fechaIngreso + esto. */
  periodicidadMeses: number;
  activo: boolean;
  motivoInactivo: MotivoInactivo | null;
  inactivoDesde: string | null;
  observaciones: string | null;
  origen: "gestivo" | "historico";
}

export interface ExamenPeriodico {
  id: string;
  cedula: string;
  nombre: string;
  cargo: string | null;
  fechaAtencion: string;
  fechaEntrega: string | null;
  periodicidadMeses: number;
  proximoExamen: string;
  recomendaciones: string | null;
  observaciones: string | null;
  origen: "gestivo" | "historico";
  createdByEmail: string | null;
  createdAt: string;
  updatedByEmail: string | null;
  updatedAt: string | null;
}

// ── Validación ──────────────────────────────────────────────────────────────

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esFecha = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const texto = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const cedulaDe = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "");

export interface DatosExamen {
  cedula: string;
  nombre: string;
  cargo: string | null;
  /** Grupo de control: solo se usa si la persona todavía no está en el control. */
  grupo: GrupoExamen;
  fechaAtencion: string;
  fechaEntrega: string | null;
  periodicidadMeses: number;
  proximoExamen: string;
  recomendaciones: string | null;
  observaciones: string | null;
}

/** Valida y normaliza el formulario de un examen. `hoy` para no aceptar atenciones futuras. */
export function validarExamen(v: Record<string, unknown>, hoy: string): { ok: true; datos: DatosExamen } | { ok: false; error: string } {
  const cedula = cedulaDe(v.cedula);
  if (cedula.length < 5 || cedula.length > 12) return { ok: false, error: "La cédula debe tener entre 5 y 12 dígitos." };
  const nombre = texto(v.nombre);
  if (!nombre) return { ok: false, error: "Falta el nombre del trabajador." };
  if (!esGrupo(v.grupo)) return { ok: false, error: "Elija el grupo de control." };
  if (!esFecha(v.fechaAtencion)) return { ok: false, error: "La fecha de atención no es válida." };
  if (v.fechaAtencion > hoy) return { ok: false, error: "La fecha de atención no puede ser futura." };
  const fechaEntrega = v.fechaEntrega ? v.fechaEntrega : null;
  if (fechaEntrega !== null && !esFecha(fechaEntrega)) return { ok: false, error: "La fecha de entrega no es válida." };
  if (fechaEntrega && (fechaEntrega as string) < v.fechaAtencion) return { ok: false, error: "La entrega de resultados no puede ser anterior a la atención." };
  if (fechaEntrega && (fechaEntrega as string) > hoy) return { ok: false, error: "La fecha de entrega no puede ser futura." };
  const meses = v.periodicidadMeses === "" || v.periodicidadMeses == null ? PERIODICIDAD_DEFECTO : Number(v.periodicidadMeses);
  if (!Number.isInteger(meses) || meses < PERIODICIDAD_MIN || meses > PERIODICIDAD_MAX) {
    return { ok: false, error: `La periodicidad debe ser un número entero de meses entre ${PERIODICIDAD_MIN} y ${PERIODICIDAD_MAX}.` };
  }
  return {
    ok: true,
    datos: {
      cedula,
      nombre,
      cargo: texto(v.cargo),
      grupo: v.grupo,
      fechaAtencion: v.fechaAtencion,
      fechaEntrega: fechaEntrega as string | null,
      periodicidadMeses: meses,
      proximoExamen: proximoExamen(v.fechaAtencion, meses),
      recomendaciones: texto(v.recomendaciones, MAX_TEXTO),
      observaciones: texto(v.observaciones, MAX_TEXTO),
    },
  };
}

export interface DatosPersona {
  cedula: string;
  nombre: string;
  cargo: string | null;
  grupo: GrupoExamen;
  fechaIngreso: string | null;
  periodicidadMeses: number;
  activo: boolean;
  motivoInactivo: MotivoInactivo | null;
  inactivoDesde: string | null;
  observaciones: string | null;
}

/** Valida una persona del control. Una inactiva exige el motivo. */
export function validarPersona(v: Record<string, unknown>, hoy: string): { ok: true; datos: DatosPersona } | { ok: false; error: string } {
  const cedula = cedulaDe(v.cedula);
  if (cedula.length < 5 || cedula.length > 12) return { ok: false, error: "La cédula debe tener entre 5 y 12 dígitos." };
  const nombre = texto(v.nombre);
  if (!nombre) return { ok: false, error: "Falta el nombre." };
  if (!esGrupo(v.grupo)) return { ok: false, error: "Elija el grupo de control." };
  const fechaIngreso = v.fechaIngreso ? v.fechaIngreso : null;
  if (fechaIngreso !== null && !esFecha(fechaIngreso)) return { ok: false, error: "La fecha de ingreso no es válida." };
  if (fechaIngreso && (fechaIngreso as string) > hoy) return { ok: false, error: "La fecha de ingreso no puede ser futura." };
  const meses = v.periodicidadMeses === "" || v.periodicidadMeses == null ? PERIODICIDAD_DEFECTO : Number(v.periodicidadMeses);
  if (!Number.isInteger(meses) || meses < PERIODICIDAD_MIN || meses > PERIODICIDAD_MAX) {
    return { ok: false, error: `La periodicidad debe ser un número entero de meses entre ${PERIODICIDAD_MIN} y ${PERIODICIDAD_MAX}.` };
  }
  const activo = v.activo !== false;
  const motivo = MOTIVOS_INACTIVO.find((m) => m.key === v.motivoInactivo)?.key ?? null;
  if (!activo && !motivo) return { ok: false, error: "Indique por qué sale del control (retirado u otro)." };
  const inactivoDesde = !activo && v.inactivoDesde ? v.inactivoDesde : null;
  if (inactivoDesde !== null && !esFecha(inactivoDesde)) return { ok: false, error: "La fecha de salida del control no es válida." };
  if (inactivoDesde && (inactivoDesde as string) > hoy) return { ok: false, error: "La fecha de salida del control no puede ser futura." };
  return {
    ok: true,
    datos: {
      cedula,
      nombre,
      cargo: texto(v.cargo),
      grupo: v.grupo,
      fechaIngreso: fechaIngreso as string | null,
      periodicidadMeses: meses,
      activo,
      motivoInactivo: activo ? null : motivo,
      inactivoDesde: activo ? null : ((inactivoDesde as string | null) ?? hoy),
      observaciones: texto(v.observaciones, MAX_TEXTO),
    },
  };
}

// ── Control (una fila por persona) ──────────────────────────────────────────

export interface FilaControl {
  persona: PersonaExamen;
  /** Exámenes de la persona, el más reciente primero. */
  examenes: ExamenPeriodico[];
  ultimo: ExamenPeriodico | null;
  /** Próximo examen: el del último examen o, sin exámenes, fecha de ingreso + periodicidad. */
  proximo: string | null;
  /** De dónde sale el próximo examen. */
  base: "examen" | "ingreso" | null;
  estado: EstadoExamen;
  dias: number | null;
}

/** Próximo examen de quien no tiene exámenes: el examen de ingreso cuenta como el primero. */
export const proximoDesdeIngreso = (p: Pick<PersonaExamen, "fechaIngreso" | "periodicidadMeses">) =>
  p.fechaIngreso ? proximoExamen(p.fechaIngreso, p.periodicidadMeses) : null;

/**
 * Cruza la población con sus exámenes. El próximo examen es el del último
 * examen (por fecha de atención); sin exámenes, el de la fecha de ingreso (así
 * lo calcula el Excel de SST). Sin ninguno de los dos: «sin examen».
 */
export function armarControl(personas: readonly PersonaExamen[], examenes: readonly ExamenPeriodico[], hoy: string): FilaControl[] {
  const porCedula = new Map<string, ExamenPeriodico[]>();
  for (const e of examenes) {
    const l = porCedula.get(e.cedula) ?? [];
    l.push(e);
    porCedula.set(e.cedula, l);
  }
  return personas.map((p) => {
    const lista = (porCedula.get(p.cedula) ?? []).slice().sort((a, b) => b.fechaAtencion.localeCompare(a.fechaAtencion));
    const ultimo = lista[0] ?? null;
    const proximo = ultimo?.proximoExamen ?? proximoDesdeIngreso(p);
    const base = ultimo ? "examen" : proximo ? "ingreso" : null;
    const { estado, dias } = estadoExamen(proximo, hoy);
    return { persona: p, examenes: lista, ultimo, proximo, base, estado, dias };
  });
}

/** Orden del control: lo que pide atención primero (vencidos, por vencer, sin examen), y por días. */
export function ordenarControl(filas: FilaControl[]): FilaControl[] {
  const peso: Record<EstadoExamen, number> = { vencido: 0, por_vencer: 1, sin_examen: 2, vigente: 3 };
  return filas.slice().sort((a, b) => {
    if (a.persona.activo !== b.persona.activo) return a.persona.activo ? -1 : 1;
    return peso[a.estado] - peso[b.estado] || (a.dias ?? 0) - (b.dias ?? 0) || a.persona.nombre.localeCompare(b.persona.nombre);
  });
}

export interface ResumenControl {
  activos: number;
  vencido: number;
  por_vencer: number;
  sin_examen: number;
  vigente: number;
  /** Exámenes con atención en el año de `hoy`. */
  atendidosAnio: number;
}

/** Cifras de la pestaña de control: solo cuentan las personas activas. */
export function resumirControl(filas: readonly FilaControl[], hoy: string): ResumenControl {
  const r: ResumenControl = { activos: 0, vencido: 0, por_vencer: 0, sin_examen: 0, vigente: 0, atendidosAnio: 0 };
  const anio = hoy.slice(0, 4);
  for (const f of filas) {
    if (!f.persona.activo) continue;
    r.activos += 1;
    r[f.estado] += 1;
    r.atendidosAnio += f.examenes.filter((e) => e.fechaAtencion.startsWith(anio)).length;
  }
  return r;
}
