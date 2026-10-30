/**
 * Accidentes de trabajo (Recursos Humanos – SST) — reglas PURAS: catálogos,
 * validación del formulario y la caracterización. Sin E/S: se prueban con
 * `npm run test:sst`.
 *
 * Los catálogos son las listas desplegables del Excel «INFORMACION ACCIDENTES
 * DE TRABAJO» (clasificación de la ARL); los grupos de parte del cuerpo, los de
 * su pestaña de caracterización. Cada lista termina en «otro».
 */

type Opcion = { key: string; label: string };

export const TIPOS_LESION = [
  { key: "golpe_contusion", label: "Golpe o contusión" },
  { key: "herida_abierta", label: "Herida abierta" },
  { key: "desgarro_muscular", label: "Desgarro muscular" },
  { key: "quemadura", label: "Quemadura" },
  { key: "lesiones_multiples", label: "Lesiones múltiples" },
  { key: "fractura", label: "Fractura" },
  { key: "luxacion", label: "Luxación" },
  { key: "torcedura_esguince", label: "Torcedura / esguince" },
  { key: "hernia", label: "Hernia" },
  { key: "laceracion_sin_herida", label: "Laceración del músculo sin herida" },
  { key: "amputacion", label: "Amputación o enucleación" },
  { key: "rasguno_pinchazo", label: "Rasguño o pinchazo" },
  { key: "ojo_cuerpo_extrano", label: "Lesión en ojo por cuerpo extraño" },
  { key: "aplastamiento", label: "Aplastamiento" },
  { key: "intoxicacion", label: "Envenenamiento o intoxicación aguda" },
  { key: "alergia", label: "Alergia" },
  { key: "otro", label: "Otro" },
] as const satisfies readonly Opcion[];

export const GRUPOS_PARTE_CUERPO = [
  { key: "cabeza_cara", label: "Cabeza / cara" },
  { key: "ojo", label: "Ojo" },
  { key: "cuello", label: "Cuello" },
  { key: "torax", label: "Tórax" },
  { key: "tronco", label: "Tronco" },
  { key: "abdomen", label: "Abdomen" },
  { key: "miembros_superiores", label: "Miembros superiores" },
  { key: "manos", label: "Manos" },
  { key: "miembros_inferiores", label: "Miembros inferiores" },
  { key: "pies", label: "Pies" },
  { key: "ubicaciones_multiples", label: "Ubicaciones múltiples" },
  { key: "otro", label: "Otro" },
] as const satisfies readonly Opcion[];

export const MECANISMOS = [
  { key: "sobre_esfuerzo", label: "Sobreesfuerzo, esfuerzo excesivo, falso movimiento" },
  { key: "pisadas_choques_golpes", label: "Pisadas, choques o golpes" },
  { key: "caida_personas", label: "Caída de personas" },
  { key: "caida_objetos", label: "Caída de objetos" },
  { key: "atrapamiento", label: "Atrapamiento" },
  { key: "temperatura_extrema", label: "Exposición o contacto con temperatura extrema" },
  { key: "electricidad", label: "Exposición o contacto con electricidad" },
  { key: "radiaciones", label: "Exposición o contacto con radiaciones" },
  { key: "sustancias_nocivas", label: "Exposición o contacto con sustancias nocivas o salpicadura" },
  { key: "contacto_particulas", label: "Contacto con partículas" },
  { key: "otro", label: "Otro" },
] as const satisfies readonly Opcion[];

export const AGENTES = [
  { key: "maquinas_equipos", label: "Máquinas y/o equipos" },
  { key: "medios_transporte", label: "Medios de transporte" },
  { key: "aparatos", label: "Aparatos" },
  { key: "herramientas", label: "Herramientas, implementos o utensilios" },
  { key: "materiales_sustancias", label: "Materiales o sustancias" },
  { key: "radiaciones", label: "Radiaciones" },
  { key: "ambiente_trabajo", label: "Ambiente de trabajo" },
  { key: "animales", label: "Animales" },
  { key: "otro", label: "Otro" },
] as const satisfies readonly Opcion[];

export const ESTADOS_INVESTIGACION = [
  { key: "pendiente", label: "Pendiente" },
  { key: "en_curso", label: "En curso" },
  { key: "cerrada", label: "Cerrada" },
] as const satisfies readonly Opcion[];

export type TipoLesion = (typeof TIPOS_LESION)[number]["key"];
export type GrupoParteCuerpo = (typeof GRUPOS_PARTE_CUERPO)[number]["key"];
export type Mecanismo = (typeof MECANISMOS)[number]["key"];
export type Agente = (typeof AGENTES)[number]["key"];
export type EstadoInvestigacion = (typeof ESTADOS_INVESTIGACION)[number]["key"];

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** Lunes primero, como la caracterización del Excel. */
export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const etiqueta = (lista: readonly Opcion[], k: string | null | undefined) => lista.find((x) => x.key === k)?.label ?? (k || "—");
export const etiquetaTipoLesion = (k: string | null | undefined) => etiqueta(TIPOS_LESION, k);
export const etiquetaGrupoParte = (k: string | null | undefined) => etiqueta(GRUPOS_PARTE_CUERPO, k);
export const etiquetaMecanismo = (k: string | null | undefined) => etiqueta(MECANISMOS, k);
export const etiquetaAgente = (k: string | null | undefined) => etiqueta(AGENTES, k);
export const etiquetaEstadoInvestigacion = (k: string | null | undefined) => etiqueta(ESTADOS_INVESTIGACION, k);

/** Día de la semana de una fecha ISO, lunes = 0 (sin zona horaria). PURO. */
export function diaSemana(fecha: string): number {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00Z`).getUTCDay(); // domingo = 0
  return (d + 6) % 7;
}

// ── Registro ────────────────────────────────────────────────────────────────

export interface DatosAccidenteTrabajo {
  fechaAt: string;
  hora: string | null;
  fechaNotificacion: string | null;
  cedula: string | null;
  nombre: string;
  cargo: string | null;
  empresaUsuaria: string | null;
  ciudad: string | null;
  sexo: "M" | "F" | null;
  tipoLesion: TipoLesion;
  parteCuerpo: string | null;
  parteCuerpoGrupo: GrupoParteCuerpo;
  mecanismo: Mecanismo;
  agente: Agente;
  descripcion: string | null;
  accidenteTransito: boolean;
  diasIncapacidad: number;
  estadoInvestigacion: EstadoInvestigacion | null;
  cierreAdministrativoArl: boolean | null;
  observaciones: string | null;
}

export interface AccidenteTrabajo extends DatosAccidenteTrabajo {
  id: string;
  anio: number;
  caso: number;
  origen: "gestivo" | "historico";
  createdByEmail: string | null;
  createdAt: string;
  updatedByEmail: string | null;
  updatedAt: string | null;
}

export const MAX_TEXTO = 4000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const esFecha = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const enLista = <K extends string>(lista: readonly { key: K }[], v: unknown): v is K => typeof v === "string" && lista.some((x) => x.key === v);
const texto = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Valida y normaliza el formulario. `hoy` para no aceptar accidentes futuros. */
export function validarAccidenteTrabajo(
  v: Record<string, unknown>,
  hoy: string
): { ok: true; datos: DatosAccidenteTrabajo } | { ok: false; error: string } {
  if (!esFecha(v.fechaAt)) return { ok: false, error: "La fecha del accidente no es válida." };
  if (v.fechaAt > hoy) return { ok: false, error: "La fecha del accidente no puede ser futura." };
  const hora = texto(v.hora, 5);
  if (hora && !HORA.test(hora)) return { ok: false, error: "La hora debe ir como HH:MM (24 horas)." };
  const fechaNotificacion = v.fechaNotificacion ? v.fechaNotificacion : null;
  if (fechaNotificacion !== null && !esFecha(fechaNotificacion)) return { ok: false, error: "La fecha de notificación no es válida." };
  if (fechaNotificacion && (fechaNotificacion as string) < v.fechaAt) {
    return { ok: false, error: "La notificación a la ARL no puede ser anterior al accidente." };
  }
  const nombre = texto(v.nombre);
  if (!nombre) return { ok: false, error: "Falta el nombre del trabajador." };
  const cedula = typeof v.cedula === "string" ? v.cedula.replace(/\D/g, "") || null : null;
  if (!enLista(TIPOS_LESION, v.tipoLesion)) return { ok: false, error: "Elija el tipo de lesión." };
  if (!enLista(GRUPOS_PARTE_CUERPO, v.parteCuerpoGrupo)) return { ok: false, error: "Elija la parte del cuerpo afectada." };
  if (!enLista(MECANISMOS, v.mecanismo)) return { ok: false, error: "Elija el mecanismo del accidente." };
  if (!enLista(AGENTES, v.agente)) return { ok: false, error: "Elija el agente del accidente." };
  const dias = v.diasIncapacidad === "" || v.diasIncapacidad == null ? 0 : Number(v.diasIncapacidad);
  if (!Number.isInteger(dias) || dias < 0 || dias > 540) return { ok: false, error: "Los días de incapacidad deben ser un número entero entre 0 y 540." };
  const sexo = v.sexo === "M" || v.sexo === "F" ? v.sexo : null;
  const descripcion = texto(v.descripcion, MAX_TEXTO);
  const observaciones = texto(v.observaciones, MAX_TEXTO);
  return {
    ok: true,
    datos: {
      fechaAt: v.fechaAt,
      hora,
      fechaNotificacion: fechaNotificacion as string | null,
      cedula,
      nombre,
      cargo: texto(v.cargo),
      empresaUsuaria: texto(v.empresaUsuaria),
      ciudad: texto(v.ciudad),
      sexo,
      tipoLesion: v.tipoLesion,
      parteCuerpo: texto(v.parteCuerpo),
      parteCuerpoGrupo: v.parteCuerpoGrupo,
      mecanismo: v.mecanismo,
      agente: v.agente,
      descripcion,
      accidenteTransito: v.accidenteTransito === true,
      diasIncapacidad: dias,
      estadoInvestigacion: enLista(ESTADOS_INVESTIGACION, v.estadoInvestigacion) ? v.estadoInvestigacion : null,
      cierreAdministrativoArl: typeof v.cierreAdministrativoArl === "boolean" ? v.cierreAdministrativoArl : null,
      observaciones,
    },
  };
}

// ── Caracterización ─────────────────────────────────────────────────────────

export interface Conteo {
  key: string;
  label: string;
  n: number;
  /** Porcentaje sobre el total del periodo (0–100, un decimal). */
  pct: number;
}

export interface Caracterizacion {
  total: number;
  diasIncapacidad: number;
  promedioDias: number;
  transito: number;
  trabajadores: number;
  /** Trabajadores con 2+ accidentes en el periodo. */
  repetidos: { cedula: string | null; nombre: string; n: number }[];
  porMes: Conteo[];
  porTipoLesion: Conteo[];
  porParteCuerpo: Conteo[];
  porMecanismo: Conteo[];
  porAgente: Conteo[];
  porDia: Conteo[];
  porCargo: Conteo[];
  porSexo: Conteo[];
}

const pct = (n: number, total: number) => (total ? Math.round((n * 1000) / total) / 10 : 0);

/** Cuenta por un catálogo, en su orden y con todas sus opciones (también las de 0). */
function porCatalogo(lista: readonly Opcion[], valores: string[], total: number): Conteo[] {
  return lista.map((o) => {
    const n = valores.filter((v) => v === o.key).length;
    return { key: o.key, label: o.label, n, pct: pct(n, total) };
  });
}

/** Cuenta por un texto libre (cargo), del más frecuente al menos. */
function porTexto(valores: (string | null)[], total: number): Conteo[] {
  const m = new Map<string, number>();
  for (const v of valores) {
    const k = (v ?? "Sin dato").trim() || "Sin dato";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => ({ key: k, label: k, n, pct: pct(n, total) }));
}

/**
 * La caracterización de la accidentalidad, la misma de la pestaña «Carac.» del
 * Excel pero calculada de los registros: por mes, tipo de lesión, parte del
 * cuerpo, mecanismo, agente y día de la semana, más días de incapacidad,
 * accidentes de tránsito y trabajadores con más de un accidente.
 */
export function caracterizar(casos: readonly Pick<AccidenteTrabajo, "fechaAt" | "cedula" | "nombre" | "cargo" | "sexo" | "tipoLesion" | "parteCuerpoGrupo" | "mecanismo" | "agente" | "accidenteTransito" | "diasIncapacidad">[]): Caracterizacion {
  const total = casos.length;
  const dias = casos.reduce((s, c) => s + (c.diasIncapacidad ?? 0), 0);
  const porPersona = new Map<string, { cedula: string | null; nombre: string; n: number }>();
  for (const c of casos) {
    const k = c.cedula || c.nombre.trim().toUpperCase();
    const e = porPersona.get(k) ?? { cedula: c.cedula, nombre: c.nombre, n: 0 };
    e.n += 1;
    porPersona.set(k, e);
  }
  const mes = casos.map((c) => Number(c.fechaAt.slice(5, 7)) - 1);
  const dia = casos.map((c) => diaSemana(c.fechaAt));
  return {
    total,
    diasIncapacidad: dias,
    promedioDias: total ? Math.round((dias * 10) / total) / 10 : 0,
    transito: casos.filter((c) => c.accidenteTransito).length,
    trabajadores: porPersona.size,
    repetidos: [...porPersona.values()].filter((p) => p.n > 1).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre)),
    porMes: MESES.map((label, i) => {
      const n = mes.filter((m) => m === i).length;
      return { key: String(i + 1), label, n, pct: pct(n, total) };
    }),
    porTipoLesion: porCatalogo(TIPOS_LESION, casos.map((c) => c.tipoLesion), total),
    porParteCuerpo: porCatalogo(GRUPOS_PARTE_CUERPO, casos.map((c) => c.parteCuerpoGrupo), total),
    porMecanismo: porCatalogo(MECANISMOS, casos.map((c) => c.mecanismo), total),
    porAgente: porCatalogo(AGENTES, casos.map((c) => c.agente), total),
    porDia: DIAS_SEMANA.map((label, i) => {
      const n = dia.filter((d) => d === i).length;
      return { key: String(i), label, n, pct: pct(n, total) };
    }),
    porCargo: porTexto(casos.map((c) => c.cargo), total),
    porSexo: porTexto(casos.map((c) => (c.sexo === "M" ? "Masculino" : c.sexo === "F" ? "Femenino" : null)), total),
  };
}
