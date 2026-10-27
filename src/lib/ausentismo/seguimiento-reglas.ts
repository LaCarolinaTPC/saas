/**
 * Seguimiento de reincidentes (Ausentismo › Reincidentes) — reglas PURAS:
 * catálogos, validación, la etiqueta de la columna y los valores sugeridos
 * del formulario. Sin E/S: se prueban con node --test (`npm run test:ausentismo`).
 */

export const TIPOS_SEGUIMIENTO = [
  { key: "eps", label: "EPS" },
  { key: "incapacidad", label: "Incapacidad" },
  { key: "ausentismo", label: "Ausentismo" },
] as const;
export type TipoSeguimiento = (typeof TIPOS_SEGUIMIENTO)[number]["key"];

export const RESPONSABLES_SEGUIMIENTO = [
  { key: "asistente_gh", label: "Asistente de gestión humana" },
  { key: "directora_gh", label: "Directora de gestión humana" },
  { key: "sst", label: "SST" },
] as const;
export type ResponsableSeguimiento = (typeof RESPONSABLES_SEGUIMIENTO)[number]["key"];

export const MOTIVOS_SEGUIMIENTO = [
  { key: "incapacidad_recurrente", label: "Recurrente en incapacidad" },
  { key: "eps_recurrente", label: "Recurrente en ir a la EPS" },
  { key: "faltas_injustificadas", label: "Recurrente en faltar injustificadamente" },
] as const;
export type MotivoSeguimiento = (typeof MOTIVOS_SEGUIMIENTO)[number]["key"];

export const ESTADOS_SEGUIMIENTO = [
  { key: "abierto", label: "Abierto" },
  { key: "cumplido", label: "Cumplido" },
  { key: "incumplido", label: "Incumplido" },
] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number]["key"];

/** Ejemplo que se muestra en «Compromiso de la empresa». */
export const EJEMPLO_COMPROMISO_EMPRESA = "Ajustar el turno mientras termina el tratamiento";

export const MAX_TEXTO_SEGUIMIENTO = 1000;

const etiqueta = <K extends string>(lista: readonly { key: K; label: string }[], k: string | null | undefined) =>
  lista.find((x) => x.key === k)?.label ?? (k || "—");
export const etiquetaTipo = (k: string | null | undefined) => etiqueta(TIPOS_SEGUIMIENTO, k);
export const etiquetaResponsable = (k: string | null | undefined) => etiqueta(RESPONSABLES_SEGUIMIENTO, k);
export const etiquetaMotivo = (k: string | null | undefined) => etiqueta(MOTIVOS_SEGUIMIENTO, k);
export const etiquetaEstado = (k: string | null | undefined) => etiqueta(ESTADOS_SEGUIMIENTO, k);

/** Lo que guarda y edita el formulario. */
export interface DatosSeguimiento {
  tipo: TipoSeguimiento;
  fecha: string;
  responsable: ResponsableSeguimiento;
  motivo: MotivoSeguimiento;
  accion: string | null;
  compromisoConductor: string | null;
  compromisoEmpresa: string | null;
  fechaLimite: string | null;
  estado: EstadoSeguimiento;
  proximaRevision: string | null;
}

/** Un seguimiento guardado (fila de `ausentismo_seguimientos`, en camelCase). */
export interface Seguimiento extends DatosSeguimiento {
  id: string;
  cedula: string;
  createdByEmail: string | null;
  createdAt: string;
  updatedByEmail: string | null;
  updatedAt: string | null;
}

/** Lo que necesita la columna: el más reciente. */
export type SeguimientoResumen = Pick<Seguimiento, "id" | "fecha" | "estado" | "fechaLimite" | "proximaRevision" | "responsable" | "motivo">;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esFecha = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const enLista = <K extends string>(lista: readonly { key: K }[], v: unknown): v is K => typeof v === "string" && lista.some((x) => x.key === v);
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Valida y normaliza lo que llega del formulario. Devuelve los datos limpios
 * o el primer error en español.
 */
export function validarSeguimiento(v: Record<string, unknown>): { ok: true; datos: DatosSeguimiento } | { ok: false; error: string } {
  if (!enLista(TIPOS_SEGUIMIENTO, v.tipo)) return { ok: false, error: "Elija el tipo (EPS, Incapacidad o Ausentismo)." };
  if (!esFecha(v.fecha)) return { ok: false, error: "La fecha del seguimiento no es válida." };
  if (!enLista(RESPONSABLES_SEGUIMIENTO, v.responsable)) return { ok: false, error: "Elija el responsable." };
  if (!enLista(MOTIVOS_SEGUIMIENTO, v.motivo)) return { ok: false, error: "Elija el motivo o hallazgo." };
  if (!enLista(ESTADOS_SEGUIMIENTO, v.estado)) return { ok: false, error: "Elija el estado." };
  const fechaLimite = v.fechaLimite == null || v.fechaLimite === "" ? null : v.fechaLimite;
  if (fechaLimite !== null && !esFecha(fechaLimite)) return { ok: false, error: "La fecha límite no es válida." };
  if (fechaLimite !== null && fechaLimite < v.fecha) return { ok: false, error: "La fecha límite no puede ser anterior a la fecha del seguimiento." };
  const proximaRevision = v.proximaRevision == null || v.proximaRevision === "" ? null : v.proximaRevision;
  if (proximaRevision !== null && !esFecha(proximaRevision)) return { ok: false, error: "La fecha de la próxima revisión no es válida." };
  const accion = texto(v.accion);
  const compromisoConductor = texto(v.compromisoConductor);
  const compromisoEmpresa = texto(v.compromisoEmpresa);
  for (const [nombre, t] of [
    ["La acción realizada", accion],
    ["El compromiso del conductor", compromisoConductor],
    ["El compromiso de la empresa", compromisoEmpresa],
  ] as const) {
    if (t && t.length > MAX_TEXTO_SEGUIMIENTO) return { ok: false, error: `${nombre} no puede pasar de ${MAX_TEXTO_SEGUIMIENTO} caracteres.` };
  }
  return {
    ok: true,
    datos: {
      tipo: v.tipo,
      fecha: v.fecha,
      responsable: v.responsable,
      motivo: v.motivo,
      accion,
      compromisoConductor,
      compromisoEmpresa,
      fechaLimite: fechaLimite as string | null,
      estado: v.estado,
      proximaRevision: proximaRevision as string | null,
    },
  };
}

export type ClaveEtiqueta = "sin" | "en_seguimiento" | "cumplido" | "incumplido";
export type AvisoSeguimiento = "vencido" | "revisar_hoy" | "revision_atrasada" | null;

/**
 * Etiqueta de la columna «Seguimiento», a partir del seguimiento más reciente.
 * Si sigue abierto, avisa si la fecha límite ya pasó o si toca revisarlo.
 */
export function etiquetaSeguimiento(
  ultimo: Pick<SeguimientoResumen, "estado" | "fechaLimite" | "proximaRevision"> | null,
  hoy: string
): { clave: ClaveEtiqueta; texto: string; aviso: AvisoSeguimiento; textoAviso: string | null } {
  if (!ultimo) return { clave: "sin", texto: "Sin seguimiento", aviso: null, textoAviso: null };
  if (ultimo.estado === "cumplido") return { clave: "cumplido", texto: "Compromiso cumplido", aviso: null, textoAviso: null };
  if (ultimo.estado === "incumplido") return { clave: "incumplido", texto: "Compromiso no cumplido", aviso: null, textoAviso: null };
  let aviso: AvisoSeguimiento = null;
  let textoAviso: string | null = null;
  if (ultimo.fechaLimite && ultimo.fechaLimite < hoy) {
    aviso = "vencido";
    textoAviso = `Vencido el ${ultimo.fechaLimite}`;
  } else if (ultimo.proximaRevision && ultimo.proximaRevision < hoy) {
    aviso = "revision_atrasada";
    textoAviso = `Revisión atrasada (${ultimo.proximaRevision})`;
  } else if (ultimo.proximaRevision === hoy) {
    aviso = "revisar_hoy";
    textoAviso = "Revisar hoy";
  }
  return { clave: "en_seguimiento", texto: "En seguimiento", aviso, textoAviso };
}

/** El más reciente: por fecha del seguimiento y, a igual fecha, el último creado. */
export function masReciente<T extends { fecha: string; createdAt: string }>(lista: readonly T[]): T | null {
  let mejor: T | null = null;
  for (const s of lista) {
    if (!mejor || s.fecha > mejor.fecha || (s.fecha === mejor.fecha && s.createdAt > mejor.createdAt)) mejor = s;
  }
  return mejor;
}

/**
 * Tipo y motivo sugeridos para un seguimiento nuevo, según lo que más pesa en
 * la reincidencia del conductor: faltas no justificadas, luego incapacidades,
 * luego citas EPS. El usuario los puede cambiar.
 */
export function sugeridos(r: { noJustificadas: number; incapacidades: number; eps: number }): { tipo: TipoSeguimiento; motivo: MotivoSeguimiento } {
  if (r.noJustificadas > 0 && r.noJustificadas >= Math.max(r.incapacidades, r.eps)) return { tipo: "ausentismo", motivo: "faltas_injustificadas" };
  if (r.incapacidades > 0 && r.incapacidades >= r.eps) return { tipo: "incapacidad", motivo: "incapacidad_recurrente" };
  if (r.eps > 0) return { tipo: "eps", motivo: "eps_recurrente" };
  return { tipo: "ausentismo", motivo: "faltas_injustificadas" };
}
