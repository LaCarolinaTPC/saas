/**
 * Procesos disciplinarios (Recursos Humanos) — reglas PURAS: catálogos,
 * validación del formulario y los resúmenes por conductor y por motivo.
 * Sin E/S: se prueban con node --test (`npm run test:disciplinarios`).
 */

export const TIPOS_PROCESO = [
  { key: "llamado_atencion", label: "Llamado de atención" },
  { key: "citacion_descargos", label: "Citación a descargos" },
] as const;
export type TipoProceso = (typeof TIPOS_PROCESO)[number]["key"];

/**
 * Motivos (el hecho concreto); «otro» pide el detalle. Los del final vienen
 * del vocabulario del Excel de RRHH.
 */
export const MOTIVOS_PROCESO = [
  { key: "faltas_injustificadas", label: "Faltas injustificadas / ausentismo" },
  { key: "llegadas_tarde", label: "Llegadas tarde / incumplimiento de turno" },
  { key: "accidente_transito", label: "Accidente de tránsito" },
  { key: "exceso_velocidad", label: "Exceso de velocidad" },
  { key: "uso_celular", label: "Uso del celular o manos libres conduciendo" },
  { key: "sin_cinturon", label: "Conducir sin cinturón" },
  { key: "usuario_estribo", label: "Usuario en el estribo" },
  { key: "maltrato", label: "Mal trato a usuarios o compañeros" },
  { key: "comportamiento", label: "Comportamiento inadecuado" },
  { key: "incumplimiento_ruta", label: "Incumplimiento de ruta o recorrido" },
  { key: "recaudo", label: "Inconsistencias en recaudo / timbradas" },
  { key: "cobro_viaje", label: "Cobro indebido de pasaje o viajes" },
  { key: "danos_vehiculo", label: "Daños o descuido del vehículo" },
  { key: "no_marcar_huella", label: "No marcar la huella" },
  { key: "sustancias", label: "Alcohol o sustancias" },
  { key: "incumplimiento_funciones", label: "Incumplimiento de funciones / obligaciones" },
  { key: "reglamento", label: "Incumplimiento del reglamento interno" },
  { key: "otro", label: "Otro" },
] as const;
export type MotivoProceso = (typeof MOTIVOS_PROCESO)[number]["key"];

/** Norma que se incumplió (columna FALTA u OBSERVACIÓN del Excel, según la hoja). */
export const NORMAS_INCUMPLIDAS = [
  { key: "normas_cst", label: "Normas del Código Sustantivo del Trabajo" },
  { key: "seguridad_vial", label: "Normas de seguridad vial" },
  { key: "funciones", label: "Funciones / obligaciones del cargo" },
  { key: "comportamiento", label: "Comportamiento" },
  { key: "reglamento", label: "Reglamento interno" },
  { key: "otra", label: "Otra" },
] as const;
export type NormaIncumplida = (typeof NORMAS_INCUMPLIDAS)[number]["key"];

export const AREAS_PROCESO = [
  { key: "operativa", label: "Operativa" },
  { key: "administrativa", label: "Administrativa" },
] as const;
export type AreaProceso = (typeof AREAS_PROCESO)[number]["key"];

export const MEDIDAS_PROCESO = [
  { key: "pendiente", label: "Pendiente de decisión" },
  { key: "sin_medida", label: "Sin medida (archivado)" },
  { key: "llamado_verbal", label: "Llamado de atención verbal" },
  { key: "llamado_escrito", label: "Llamado de atención escrito" },
  { key: "suspension", label: "Suspensión" },
  { key: "terminacion", label: "Terminación del contrato" },
  { key: "otra", label: "Otra" },
  // Solo histórico: el Excel no dice qué medida se tomó. No se ofrece al registrar.
  { key: "no_registrada", label: "No registrada (histórico)" },
] as const;
export type MedidaProceso = (typeof MEDIDAS_PROCESO)[number]["key"];

export const ORIGENES_PROCESO = [
  { key: "gestivo", label: "Gestivo" },
  { key: "historico", label: "Histórico (Excel)" },
] as const;
export type OrigenProceso = (typeof ORIGENES_PROCESO)[number]["key"];

export const RESPONSABLES_PROCESO = [
  { key: "asistente_gh", label: "Asistente de gestión humana" },
  { key: "directora_gh", label: "Directora de gestión humana" },
  { key: "sst", label: "SST" },
  { key: "operaciones", label: "Coordinación de operación" },
] as const;

export const MAX_TEXTO_PROCESO = 2000;
/** Cargo y «realizado por»: textos cortos. */
export const MAX_TEXTO_CORTO = 120;

const etiqueta = (lista: readonly { key: string; label: string }[], k: string | null | undefined) =>
  lista.find((x) => x.key === k)?.label ?? (k || "—");
export const etiquetaTipo = (k: string | null | undefined) => etiqueta(TIPOS_PROCESO, k);
export const etiquetaMotivo = (k: string | null | undefined, detalle?: string | null) =>
  k === "otro" && detalle ? `Otro: ${detalle}` : etiqueta(MOTIVOS_PROCESO, k);
export const etiquetaMedida = (k: string | null | undefined, dias?: number | null) =>
  k === "suspension" && dias ? `Suspensión de ${dias} día${dias === 1 ? "" : "s"}` : etiqueta(MEDIDAS_PROCESO, k);
export const etiquetaResponsable = (k: string | null | undefined) => etiqueta(RESPONSABLES_PROCESO, k);
export const etiquetaNorma = (k: string | null | undefined) => etiqueta(NORMAS_INCUMPLIDAS, k);
export const etiquetaArea = (k: string | null | undefined) => etiqueta(AREAS_PROCESO, k);
export const etiquetaOrigen = (k: string | null | undefined) => etiqueta(ORIGENES_PROCESO, k);

/** Lo que guarda y edita el formulario. */
export interface DatosProceso {
  tipo: TipoProceso;
  fechaHecho: string;
  motivo: MotivoProceso;
  motivoDetalle: string | null;
  descripcion: string | null;
  fechaCitacion: string | null;
  fechaDescargos: string | null;
  /** Solo descargos: true asistió, false no asistió, null aún no se sabe. */
  asistio: boolean | null;
  resumenDescargos: string | null;
  medida: MedidaProceso;
  diasSuspension: number | null;
  fechaMedida: string | null;
  medidaDetalle: string | null;
  responsable: string | null;
  normaIncumplida: NormaIncumplida | null;
  cargo: string | null;
  area: AreaProceso | null;
  /** Persona que hizo el proceso. */
  realizadoPor: string | null;
}

/** Un proceso guardado. */
export interface Proceso extends DatosProceso {
  id: string;
  consecutivo: number;
  cedula: string;
  codigo: string | null;
  nombre: string;
  origen: OrigenProceso;
  createdByEmail: string | null;
  createdAt: string;
  updatedByEmail: string | null;
  updatedAt: string | null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esFecha = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const enLista = <K extends string>(lista: readonly { key: K }[], v: unknown): v is K => typeof v === "string" && lista.some((x) => x.key === v);
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const fechaOpcional = (v: unknown) => (v == null || v === "" ? null : v);

/**
 * Valida y normaliza el formulario. Los datos de descargos solo se guardan en
 * una citación; los días de suspensión, solo si la medida es suspensión.
 */
export function validarProceso(v: Record<string, unknown>): { ok: true; datos: DatosProceso } | { ok: false; error: string } {
  if (!enLista(TIPOS_PROCESO, v.tipo)) return { ok: false, error: "Elija si es llamado de atención o citación a descargos." };
  if (!esFecha(v.fechaHecho)) return { ok: false, error: "La fecha de los hechos no es válida." };
  if (!enLista(MOTIVOS_PROCESO, v.motivo)) return { ok: false, error: "Elija el motivo." };
  const motivoDetalle = texto(v.motivoDetalle);
  if (v.motivo === "otro" && !motivoDetalle) return { ok: false, error: "Escriba cuál es el motivo." };
  if (!enLista(MEDIDAS_PROCESO, v.medida)) return { ok: false, error: "Elija la medida (o «Pendiente de decisión»)." };
  // «No registrada» solo la trae el histórico; al editarlo puede conservarse.
  if (v.medida === "no_registrada" && !v.permitirNoRegistrada) {
    return { ok: false, error: "Elija la medida (o «Pendiente de decisión»)." };
  }
  if (v.normaIncumplida != null && v.normaIncumplida !== "" && !enLista(NORMAS_INCUMPLIDAS, v.normaIncumplida)) {
    return { ok: false, error: "La norma incumplida no es válida." };
  }
  if (v.area != null && v.area !== "" && !enLista(AREAS_PROCESO, v.area)) return { ok: false, error: "El área no es válida." };
  const cargo = texto(v.cargo);
  const realizadoPor = texto(v.realizadoPor);
  for (const [nombre, t] of [["El cargo", cargo], ["«Realizado por»", realizadoPor]] as const) {
    if (t && t.length > MAX_TEXTO_CORTO) return { ok: false, error: `${nombre} no puede pasar de ${MAX_TEXTO_CORTO} caracteres.` };
  }

  const esCitacion = v.tipo === "citacion_descargos";
  const fechaCitacion = esCitacion ? fechaOpcional(v.fechaCitacion) : null;
  const fechaDescargos = esCitacion ? fechaOpcional(v.fechaDescargos) : null;
  for (const [nombre, f] of [
    ["de la citación", fechaCitacion],
    ["de los descargos", fechaDescargos],
    ["de la medida", fechaOpcional(v.fechaMedida)],
  ] as const) {
    if (f !== null && !esFecha(f)) return { ok: false, error: `La fecha ${nombre} no es válida.` };
  }
  if (fechaCitacion && (fechaCitacion as string) < v.fechaHecho) return { ok: false, error: "La citación no puede ser anterior a los hechos." };
  if (fechaDescargos && fechaCitacion && (fechaDescargos as string) < (fechaCitacion as string)) {
    return { ok: false, error: "Los descargos no pueden ser antes de la citación." };
  }
  const asistio = esCitacion && typeof v.asistio === "boolean" ? v.asistio : null;

  let diasSuspension: number | null = null;
  if (v.medida === "suspension") {
    const n = Number(v.diasSuspension);
    if (!Number.isInteger(n) || n < 1 || n > 60) return { ok: false, error: "Indique los días de suspensión (1 a 60)." };
    diasSuspension = n;
  }
  const medidaDetalle = texto(v.medidaDetalle);
  if (v.medida === "otra" && !medidaDetalle) return { ok: false, error: "Escriba cuál fue la medida." };

  const descripcion = texto(v.descripcion);
  const resumenDescargos = esCitacion ? texto(v.resumenDescargos) : null;
  for (const [nombre, t] of [
    ["La descripción de los hechos", descripcion],
    ["El resumen de los descargos", resumenDescargos],
    ["El detalle de la medida", medidaDetalle],
  ] as const) {
    if (t && t.length > MAX_TEXTO_PROCESO) return { ok: false, error: `${nombre} no puede pasar de ${MAX_TEXTO_PROCESO} caracteres.` };
  }
  return {
    ok: true,
    datos: {
      tipo: v.tipo,
      fechaHecho: v.fechaHecho,
      motivo: v.motivo,
      motivoDetalle: v.motivo === "otro" ? motivoDetalle : null,
      descripcion,
      fechaCitacion: fechaCitacion as string | null,
      fechaDescargos: fechaDescargos as string | null,
      asistio,
      resumenDescargos,
      medida: v.medida,
      diasSuspension,
      fechaMedida: (fechaOpcional(v.fechaMedida) as string | null) ?? null,
      medidaDetalle,
      responsable: enLista(RESPONSABLES_PROCESO, v.responsable) ? v.responsable : null,
      normaIncumplida: enLista(NORMAS_INCUMPLIDAS, v.normaIncumplida) ? v.normaIncumplida : null,
      cargo,
      area: enLista(AREAS_PROCESO, v.area) ? v.area : null,
      realizadoPor,
    },
  };
}

/** Abierto mientras la medida esté pendiente. */
export const estaAbierto = (p: Pick<Proceso, "medida">) => p.medida === "pendiente";

export interface ResumenConductor {
  cedula: string;
  codigo: string | null;
  nombre: string;
  total: number;
  llamados: number;
  citaciones: number;
  /** Descargos a los que asistió / no asistió (las citaciones sin dato no cuentan en ninguno). */
  asistencias: number;
  inasistencias: number;
  suspensiones: number;
  diasSuspension: number;
  terminaciones: number;
  abiertos: number;
  /** Motivos con su cantidad, del más repetido al menos. */
  motivos: { motivo: string; etiqueta: string; cantidad: number }[];
  ultimaFecha: string;
}

/**
 * Una fila por conductor con sus conteos: cuántos llamados y citaciones, a
 * cuántos descargos asistió y por qué motivos. Ordenado por más citaciones,
 * luego más procesos y luego el más reciente.
 */
export function resumenPorConductor(procesos: readonly Proceso[]): ResumenConductor[] {
  const porCedula = new Map<string, Proceso[]>();
  for (const p of procesos) porCedula.set(p.cedula, [...(porCedula.get(p.cedula) ?? []), p]);
  const filas: ResumenConductor[] = [];
  for (const [cedula, lista] of porCedula) {
    const reciente = [...lista].sort((a, b) => b.fechaHecho.localeCompare(a.fechaHecho))[0];
    const conteo = new Map<string, { etiqueta: string; cantidad: number }>();
    for (const p of lista) {
      const k = p.motivo === "otro" && p.motivoDetalle ? `otro:${p.motivoDetalle.toLowerCase()}` : p.motivo;
      const e = conteo.get(k);
      if (e) e.cantidad += 1;
      else conteo.set(k, { etiqueta: etiquetaMotivo(p.motivo, p.motivoDetalle), cantidad: 1 });
    }
    filas.push({
      cedula,
      codigo: reciente.codigo,
      nombre: reciente.nombre,
      total: lista.length,
      llamados: lista.filter((p) => p.tipo === "llamado_atencion").length,
      citaciones: lista.filter((p) => p.tipo === "citacion_descargos").length,
      asistencias: lista.filter((p) => p.tipo === "citacion_descargos" && p.asistio === true).length,
      inasistencias: lista.filter((p) => p.tipo === "citacion_descargos" && p.asistio === false).length,
      suspensiones: lista.filter((p) => p.medida === "suspension").length,
      diasSuspension: lista.reduce((s, p) => s + (p.medida === "suspension" ? (p.diasSuspension ?? 0) : 0), 0),
      terminaciones: lista.filter((p) => p.medida === "terminacion").length,
      abiertos: lista.filter(estaAbierto).length,
      motivos: [...conteo.entries()]
        .map(([motivo, x]) => ({ motivo, ...x }))
        .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta)),
      ultimaFecha: reciente.fechaHecho,
    });
  }
  return filas.sort((a, b) => b.citaciones - a.citaciones || b.total - a.total || b.ultimaFecha.localeCompare(a.ultimaFecha));
}

export interface ResumenMotivo {
  motivo: MotivoProceso;
  etiqueta: string;
  total: number;
  llamados: number;
  citaciones: number;
  /** Conductores distintos con ese motivo. */
  conductores: number;
}

/** Procesos por motivo (los «otro» juntos), del más frecuente al menos. */
export function resumenPorMotivo(procesos: readonly Proceso[]): ResumenMotivo[] {
  const m = new Map<MotivoProceso, { total: number; llamados: number; citaciones: number; cedulas: Set<string> }>();
  for (const p of procesos) {
    const e = m.get(p.motivo) ?? { total: 0, llamados: 0, citaciones: 0, cedulas: new Set<string>() };
    e.total += 1;
    if (p.tipo === "llamado_atencion") e.llamados += 1;
    else e.citaciones += 1;
    e.cedulas.add(p.cedula);
    m.set(p.motivo, e);
  }
  return [...m.entries()]
    .map(([motivo, e]) => ({ motivo, etiqueta: etiquetaMotivo(motivo), total: e.total, llamados: e.llamados, citaciones: e.citaciones, conductores: e.cedulas.size }))
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta));
}

// ── Filtros de la pantalla ──────────────────────────────────────────────────

/** Filtros de la pantalla, tal como viajan en la URL (vacío = todos). */
export interface FiltrosProceso {
  desde: string;
  hasta: string;
  q: string;
  tipo: string;
  motivo: string;
  norma: string;
  medida: string;
  /** abiertos | cerrados */
  estado: string;
  /** asistio | no_asistio | sin_dato (solo citaciones) */
  descargos: string;
  area: string;
  cargo: string;
  realizadoPor: string;
  origen: string;
  /** activo | retirado, según el maestro de conductores */
  situacion: string;
}

export const FILTROS_VACIOS: FiltrosProceso = {
  desde: "", hasta: "", q: "", tipo: "", motivo: "", norma: "", medida: "", estado: "", descargos: "",
  area: "", cargo: "", realizadoPor: "", origen: "", situacion: "",
};

/** Parámetro de la URL de cada filtro. */
export const PARAMS_FILTRO: Record<keyof FiltrosProceso, string> = {
  desde: "desde", hasta: "hasta", q: "q", tipo: "tipo", motivo: "motivo", norma: "norma", medida: "medida",
  estado: "estado", descargos: "descargos", area: "area", cargo: "cargo", realizadoPor: "por", origen: "origen",
  situacion: "situacion",
};

/** Los que van detrás de «Más filtros» (para contarlos en el botón). */
export const FILTROS_EXTRA: (keyof FiltrosProceso)[] = [
  "norma", "medida", "estado", "descargos", "area", "cargo", "realizadoPor", "origen", "situacion",
];

/** Lee los filtros de la URL; lo que no tiene forma válida queda vacío. */
export function filtrosDesdeUrl(sp: Record<string, string | undefined>): FiltrosProceso {
  const f = { ...FILTROS_VACIOS };
  for (const k of Object.keys(PARAMS_FILTRO) as (keyof FiltrosProceso)[]) {
    const v = (sp[PARAMS_FILTRO[k]] ?? "").trim().slice(0, 80);
    if (!v) continue;
    if ((k === "desde" || k === "hasta") && !esFecha(v)) continue;
    f[k] = v;
  }
  return f;
}

/** Desde y hasta de un año («2025» → 1 ene a 31 dic). */
export function rangoAnio(anio: string): { desde: string; hasta: string } {
  return /^\d{4}$/.test(anio) ? { desde: `${anio}-01-01`, hasta: `${anio}-12-31` } : { desde: "", hasta: "" };
}

/** El año si Desde/Hasta son exactamente ese año; si no, "". */
export function anioDeRango(desde: string, hasta: string): string {
  const a = desde.slice(0, 4);
  return desde === `${a}-01-01` && hasta === `${a}-12-31` ? a : "";
}

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Aplica los filtros. `retirados` son las cédulas retiradas del maestro; quien
 * no está en el maestro no entra con «activo» ni con «retirado».
 */
export function filtrarProcesos(
  procesos: readonly Proceso[],
  f: FiltrosProceso,
  situacion: { activos: ReadonlySet<string>; retirados: ReadonlySet<string> } = { activos: new Set(), retirados: new Set() }
): Proceso[] {
  const q = normalizar(f.q.trim());
  const cargo = normalizar(f.cargo);
  const por = normalizar(f.realizadoPor);
  return procesos.filter((p) => {
    if (f.desde && p.fechaHecho < f.desde) return false;
    if (f.hasta && p.fechaHecho > f.hasta) return false;
    if (f.tipo && p.tipo !== f.tipo) return false;
    if (f.motivo && p.motivo !== f.motivo) return false;
    if (f.norma && (p.normaIncumplida ?? "") !== f.norma) return false;
    if (f.medida && p.medida !== f.medida) return false;
    if (f.estado === "abiertos" && !estaAbierto(p)) return false;
    if (f.estado === "cerrados" && estaAbierto(p)) return false;
    if (f.descargos) {
      if (p.tipo !== "citacion_descargos") return false;
      const v = p.asistio === true ? "asistio" : p.asistio === false ? "no_asistio" : "sin_dato";
      if (v !== f.descargos) return false;
    }
    if (f.area && p.area !== f.area) return false;
    if (cargo && normalizar(p.cargo ?? "") !== cargo) return false;
    if (por && normalizar(p.realizadoPor ?? "") !== por) return false;
    if (f.origen && p.origen !== f.origen) return false;
    if (f.situacion === "activo" && !situacion.activos.has(p.cedula)) return false;
    if (f.situacion === "retirado" && !situacion.retirados.has(p.cedula)) return false;
    if (q) {
      const texto = [
        p.nombre, p.cedula, p.codigo ?? "", String(p.consecutivo), p.descripcion ?? "", p.motivoDetalle ?? "",
        p.medidaDetalle ?? "", p.resumenDescargos ?? "",
      ].join(" ");
      if (!normalizar(texto).includes(q)) return false;
    }
    return true;
  });
}

/** Valores distintos de un campo de texto (cargo, realizado por), para los selects. */
export function valoresDistintos(procesos: readonly Proceso[], campo: "cargo" | "realizadoPor"): string[] {
  const m = new Map<string, string>();
  for (const p of procesos) {
    const v = p[campo]?.trim();
    if (v && !m.has(normalizar(v))) m.set(normalizar(v), v);
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}
