/**
 * Histórico del Excel de RRHH «PROCESOS DISCIPLINARIOS» (hojas 2025 y 2026)
 * — reglas PURAS para pasar cada fila a `procesos_disciplinarios`. La carga
 * (emparejar el nombre con el maestro y escribir) la hace
 * scripts/migrar-disciplinarios-historico.mts.
 *
 * El Excel no trae cédula y es texto libre con errores de tipeo. Además FALTA
 * y OBSERVACIÓN se usan al revés entre hojas (2025: FALTA = el hecho,
 * OBSERVACIÓN = la norma; 2026: FALTA = la norma, OBSERVACIÓN = el hecho o la
 * sanción), así que motivo y norma se deducen de ambas columnas juntas y el
 * texto original se guarda en la descripción.
 */

import type { AreaProceso, MedidaProceso, MotivoProceso, NormaIncumplida, TipoProceso } from "./reglas";

/** Una fila del Excel, ya ubicada por encabezado. */
export interface FilaExcel {
  hoja: string;
  /** Número de fila tal como se ve en Excel. */
  fila: number;
  mes: string;
  fechaReporte: unknown;
  empleado: string;
  cargo: string;
  area: string;
  fechaDescargo: unknown;
  realizadoPor: string;
  falta: string;
  observacion: string;
  sancion: string;
  diasSancion: string;
  llegadaTarde: string;
  cobroViaje: string;
}

/** Lo que se inserta (sin cédula, código ni nombre del maestro). */
export interface ProcesoHistorico {
  historico_ref: string;
  nombre_excel: string;
  tipo: TipoProceso;
  fecha_hecho: string;
  motivo: MotivoProceso;
  norma_incumplida: NormaIncumplida;
  descripcion: string;
  fecha_descargos: string | null;
  asistio: boolean | null;
  medida: MedidaProceso;
  dias_suspension: number | null;
  medida_detalle: string | null;
  cargo: string | null;
  area: AreaProceso | null;
  realizado_por: string | null;
}

export type ResultadoFila = { ok: true; proceso: ProcesoHistorico; avisos: string[] } | { ok: false; error: string };

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** Mayúsculas, sin tildes y con un solo espacio entre palabras (sin signos). */
export function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/g, " ")
    .trim();
}

const texto = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

// ── Lectura de la hoja ──────────────────────────────────────────────────────

const COLUMNAS: Record<Exclude<keyof FilaExcel, "hoja" | "fila">, string> = {
  mes: "MES",
  fechaReporte: "FECHA REPORTE",
  empleado: "EMPLEADO",
  cargo: "CARGO",
  area: "AREA",
  fechaDescargo: "FECHA DESCARGO",
  realizadoPor: "REALIZADO POR",
  falta: "FALTA",
  observacion: "OBSERVACION",
  sancion: "SANCION APLICADA",
  diasSancion: "DIAS DE SANCION",
  llegadaTarde: "LLEGADA TARDE",
  cobroViaje: "COBRO DE VIAJE",
};

/**
 * Filas de una hoja leída con `sheet_to_json(ws, { header: 1, raw: true,
 * defval: null, blankrows: true })` (índice 0 = fila 1 de Excel). Busca el
 * encabezado «MES» y ubica cada columna por su nombre; salta las filas sin
 * empleado.
 */
export function leerHoja(hoja: string, crudas: unknown[][]): FilaExcel[] {
  const iEnc = crudas.findIndex((r) => normalizar(r?.[0]) === "MES");
  if (iEnc < 0) throw new Error(`La hoja ${hoja} no tiene el encabezado «MES».`);
  const enc = (crudas[iEnc] ?? []).map(normalizar);
  const indice = {} as Record<keyof typeof COLUMNAS, number>;
  for (const [k, nombre] of Object.entries(COLUMNAS) as [keyof typeof COLUMNAS, string][]) {
    indice[k] = enc.indexOf(nombre);
    if (indice[k] < 0) throw new Error(`La hoja ${hoja} no tiene la columna «${nombre}».`);
  }
  const salida: FilaExcel[] = [];
  for (let i = iEnc + 1; i < crudas.length; i++) {
    const r = crudas[i] ?? [];
    const v = (k: keyof typeof COLUMNAS) => r[indice[k]];
    if (!texto(v("empleado"))) continue;
    salida.push({
      hoja,
      fila: i + 1,
      mes: texto(v("mes")),
      fechaReporte: v("fechaReporte"),
      empleado: texto(v("empleado")),
      cargo: texto(v("cargo")),
      area: texto(v("area")),
      fechaDescargo: v("fechaDescargo"),
      realizadoPor: texto(v("realizadoPor")),
      falta: texto(v("falta")),
      observacion: texto(v("observacion")),
      sancion: texto(v("sancion")),
      diasSancion: texto(v("diasSancion")),
      llegadaTarde: texto(v("llegadaTarde")),
      cobroViaje: texto(v("cobroViaje")),
    });
  }
  return salida;
}

// ── Fechas ──────────────────────────────────────────────────────────────────

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/**
 * Mes del Excel («MARZO », «JUILO») → 1–12, o null. Acepta letras cambiadas
 * de orden («JUILO») y abreviaturas de 4 letras o más («SEPT»).
 */
export function mesDeTexto(mes: string): number | null {
  const n = normalizar(mes);
  if (!n) return null;
  const letras = (s: string) => [...s].sort().join("");
  const i = MESES.findIndex((m) => m === n || letras(m) === letras(n) || (n.length >= 4 && m.startsWith(n)));
  return i < 0 ? null : i + 1;
}

/**
 * Fecha de una celda: número de serie de Excel o texto día/mes/año con errores
 * de tipeo («27/003/2025», «25/092025», «1/03//2026», «28/09/20026»). El año
 * vale si es el de la hoja, o el anterior en noviembre o diciembre (procesos
 * que se pasaron a la hoja nueva); si no, se toma el de la hoja y se avisa.
 * Si el mes no es válido se usa el de la columna MES.
 */
export function parsearFecha(v: unknown, anioHoja: number, mesTexto: string): { fecha: string | null; aviso: string | null } {
  if (v == null || v === "") return { fecha: null, aviso: null };
  let a: number, m: number, d: number;
  if (typeof v === "number" && Number.isFinite(v)) {
    const f = new Date(Math.round((v - 25569) * 86400000));
    [a, m, d] = [f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()];
  } else if (v instanceof Date && !Number.isNaN(v.getTime())) {
    [a, m, d] = [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()];
  } else {
    const s = String(v).trim();
    let partes = s.split(/\D+/).filter(Boolean);
    // «25/092025»: el mes y el año quedaron pegados.
    if (partes.length === 2 && partes[1].length >= 5) partes = [partes[0], partes[1].slice(0, -4), partes[1].slice(-4)];
    if (partes.length !== 3) return { fecha: null, aviso: `Fecha ilegible «${s}»` };
    [d, m, a] = partes.map(Number);
  }
  const avisos: string[] = [];
  const mesCol = mesDeTexto(mesTexto);
  if (!(m >= 1 && m <= 12)) {
    if (!mesCol) return { fecha: null, aviso: `Fecha sin mes válido «${String(v)}»` };
    avisos.push(`mes tomado de la columna MES (${mesTexto})`);
    m = mesCol;
  }
  const anioValido = a === anioHoja || (a === anioHoja - 1 && m >= 11);
  if (!anioValido) {
    avisos.push(`año ${a} corregido a ${anioHoja}`);
    a = anioHoja;
  }
  if (!(d >= 1 && d <= diasDelMes(a, m))) return { fecha: null, aviso: `Fecha con día inválido «${String(v)}»` };
  if (mesCol && mesCol !== m) avisos.push(`la columna MES dice ${mesTexto}`);
  const fecha = iso(a, m, d);
  return { fecha, aviso: avisos.length ? `Fecha «${typeof v === "number" ? fecha : String(v)}»: ${avisos.join("; ")}` : null };
}

// ── Sanción → tipo y medida ────────────────────────────────────────────────

export interface Clasificacion {
  tipo: TipoProceso;
  medida: MedidaProceso;
  asistio: boolean | null;
  diasSuspension: number | null;
  medidaDetalle: string | null;
  /** false si la sanción no se reconoció y se tomó el valor por defecto. */
  reconocida: boolean;
}

const LLAMADO = /\bLL\w*DO DE ATE/;

function clasificarTexto(n: string, diasSancion: string): Omit<Clasificacion, "reconocida"> | null {
  if (!n) return null;
  if (/RENUNCI|SE RETIR/.test(n)) {
    return { tipo: "citacion_descargos", medida: "otra", asistio: false, diasSuspension: null, medidaDetalle: "Renunció antes de los descargos" };
  }
  if (/SUSPENSI/.test(n)) {
    const dias = Number((diasSancion.match(/\d+/) ?? [])[0]);
    return { tipo: "citacion_descargos", medida: "suspension", asistio: null, diasSuspension: dias > 0 ? dias : null, medidaDetalle: null };
  }
  if (LLAMADO.test(n) && /DESCARGO/.test(n)) {
    return { tipo: "citacion_descargos", medida: "llamado_escrito", asistio: true, diasSuspension: null, medidaDetalle: null };
  }
  if (/ACTA DE DESCARGO/.test(n) || /^DESCARGOS?$/.test(n)) {
    return { tipo: "citacion_descargos", medida: "no_registrada", asistio: true, diasSuspension: null, medidaDetalle: null };
  }
  if (/CITACION/.test(n) || /PROCESO DISCIPLINARIO/.test(n) || /SANCION DIS/.test(n)) {
    return { tipo: "citacion_descargos", medida: "no_registrada", asistio: null, diasSuspension: null, medidaDetalle: null };
  }
  if (LLAMADO.test(n)) {
    return { tipo: "llamado_atencion", medida: "llamado_escrito", asistio: null, diasSuspension: null, medidaDetalle: null };
  }
  return null;
}

/**
 * Tipo de proceso y medida desde SANCIÓN APLICADA; si está vacía o no se
 * reconoce, desde OBSERVACIÓN (en 2026 a veces trae la sanción). Si ninguna
 * sirve: llamado de atención con medida «no registrada».
 */
export function clasificarSancion(sancion: string, observacion: string, diasSancion: string): Clasificacion {
  const c = clasificarTexto(normalizar(sancion), diasSancion) ?? clasificarTexto(normalizar(observacion), diasSancion);
  if (c) return { ...c, reconocida: true };
  return { tipo: "llamado_atencion", medida: "no_registrada", asistio: null, diasSuspension: null, medidaDetalle: null, reconocida: false };
}

// ── Motivo y norma ─────────────────────────────────────────────────────────

const REGLAS_MOTIVO: [RegExp, MotivoProceso][] = [
  [/VELOCIDAD/, "exceso_velocidad"],
  [/CELULAR|MANOS LIBRES|TELEFONO/, "uso_celular"],
  [/CINTURON/, "sin_cinturon"],
  [/ESTRIBO/, "usuario_estribo"],
  [/ACCIDENTE|GUARDAR DISTANCIA/, "accidente_transito"],
  [/NO VINO|NO ASISTIO A TRABAJAR/, "faltas_injustificadas"],
  [/LL\w*GADA TARDE|HORARIO/, "llegadas_tarde"],
  [/COBRO|PASAJE|DESPACHO DE VIAJES/, "cobro_viaje"],
  [/INCUMPLIMIENTO DE RUTA/, "incumplimiento_ruta"],
  [/DANO|AFECTACION/, "danos_vehiculo"],
  [/ATENCION AL USUARIO|QUEJA|IRRESPETUOSO|GRO[SC]ERIA|TRATO/, "maltrato"],
  [/COMPORTAMIENTO|CONDUCTA/, "comportamiento"],
  [/REGLAMENTO/, "reglamento"],
];

const MOTIVOS_VIALES = new Set<MotivoProceso>(["exceso_velocidad", "uso_celular", "sin_cinturon", "usuario_estribo", "accidente_transito"]);

/** Motivo desde el texto de FALTA, OBSERVACIÓN y las columnas de notas; por defecto, incumplimiento de funciones. */
export function deducirMotivo(textos: string[]): MotivoProceso {
  const n = normalizar(textos.join(" | "));
  return REGLAS_MOTIVO.find(([re]) => re.test(n))?.[1] ?? "incumplimiento_funciones";
}

/** Norma incumplida desde el texto; si no la nombra, se deduce del motivo. */
export function deducirNorma(textos: string[], motivo: MotivoProceso): NormaIncumplida {
  const n = normalizar(textos.join(" | "));
  if (/\bCST\b|\bC S T\b|CODIGO SUSTANTIVO/.test(n)) return "normas_cst";
  if (/SEGURIDAD VIAL/.test(n)) return "seguridad_vial";
  if (/REGLAMENTO/.test(n)) return "reglamento";
  if (/FUNCIONES|OBLIGACIONES/.test(n)) return "funciones";
  if (/COMPORTAMIENTO|CONDUCTA/.test(n)) return "comportamiento";
  if (MOTIVOS_VIALES.has(motivo)) return "seguridad_vial";
  if (motivo === "maltrato" || motivo === "comportamiento") return "comportamiento";
  return "funciones";
}

// ── Textos ──────────────────────────────────────────────────────────────────

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e"]);

/** «YENIFER PINZON» → «Yenifer Pinzon». */
export function comoNombre(s: string): string {
  return texto(s)
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** «CONDUCTOR-COBRADOR» → «Conductor-cobrador»; «AUXILIAR DE ALMACEN» → «Auxiliar de almacen». */
export function comoCargo(s: string): string {
  const t = texto(s).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function areaDeTexto(s: string): AreaProceso | null {
  const n = normalizar(s);
  if (n.startsWith("OPERATIV")) return "operativa";
  if (n.startsWith("ADMINIS")) return "administrativa";
  return null;
}

// ── Fila completa ───────────────────────────────────────────────────────────

/** Pasa una fila del Excel a un proceso histórico (sin el trabajador del maestro). */
export function mapearFila(f: FilaExcel): ResultadoFila {
  const anio = Number(f.hoja);
  if (!Number.isInteger(anio)) return { ok: false, error: `Hoja «${f.hoja}» no es un año` };
  const avisos: string[] = [];

  const hecho = parsearFecha(f.fechaReporte, anio, f.mes);
  if (!hecho.fecha) return { ok: false, error: hecho.aviso ?? "Sin fecha de reporte" };
  if (hecho.aviso) avisos.push(hecho.aviso);
  const descargo = parsearFecha(f.fechaDescargo, anio, f.mes);
  if (descargo.aviso) avisos.push(`Fecha de descargo: ${descargo.aviso}`);

  const c = clasificarSancion(f.sancion, f.observacion, f.diasSancion);
  if (!c.reconocida) avisos.push(`Sanción no reconocida «${f.sancion || "(vacía)"}»: llamado de atención sin medida registrada`);
  if (c.medida === "suspension" && !c.diasSuspension) avisos.push(`Suspensión sin días («${f.diasSancion || "vacío"}»)`);

  const notas = [f.falta, f.observacion, f.llegadaTarde, /\d/.test(f.diasSancion) ? "" : f.diasSancion, f.cobroViaje];
  const motivo = deducirMotivo(notas);
  const norma = deducirNorma([f.falta, f.observacion], motivo);

  const descripcion = [
    f.falta && `Falta: ${f.falta}`,
    f.observacion && `Observación: ${f.observacion}`,
    f.sancion && `Sanción: ${f.sancion}`,
    f.diasSancion && `Días de sanción: ${f.diasSancion}`,
    f.llegadaTarde && `Llegada tarde: ${f.llegadaTarde}`,
    f.cobroViaje && `Cobro de viaje: ${f.cobroViaje}`,
    hecho.aviso && `Fecha en el Excel: ${String(f.fechaReporte)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // La fecha del descargo no puede quedar antes de los hechos (CHECK de la pantalla).
  const fechaDescargos = c.tipo === "citacion_descargos" && descargo.fecha && descargo.fecha >= hecho.fecha ? descargo.fecha : null;
  if (c.tipo === "citacion_descargos" && descargo.fecha && !fechaDescargos) avisos.push(`Fecha de descargo ${descargo.fecha} anterior a los hechos: se omite`);

  return {
    ok: true,
    avisos,
    proceso: {
      historico_ref: `${f.hoja}:${f.fila}`,
      nombre_excel: f.empleado,
      tipo: c.tipo,
      fecha_hecho: hecho.fecha,
      motivo,
      norma_incumplida: norma,
      descripcion: `Histórico (Excel ${f.hoja}, fila ${f.fila}). ${descripcion}`.trim(),
      fecha_descargos: fechaDescargos,
      asistio: c.tipo === "citacion_descargos" ? c.asistio : null,
      medida: c.medida,
      dias_suspension: c.diasSuspension,
      medida_detalle: c.medidaDetalle,
      cargo: f.cargo ? comoCargo(f.cargo) : null,
      area: areaDeTexto(f.area),
      realizado_por: f.realizadoPor ? comoNombre(f.realizadoPor) : null,
    },
  };
}

// ── Trabajador: nombre del Excel → maestro de conductores ──────────────────

export type Trabajador = { cedula: string; nombre: string; codigo: string | null; estado: string | null };

export type Emparejamiento =
  | { tipo: "exacto" | "probable" | "parcial"; conductor: Trabajador }
  | { tipo: "ambiguo"; candidatos: Trabajador[] }
  | { tipo: "ninguno" };

const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y"]);

/** Palabras del nombre, sin tildes ni partículas («DE LA HOZ» → «HOZ»). */
export function palabrasNombre(nombre: string): string[] {
  return normalizar(nombre).replace(/\d/g, " ").split(/\s+/).filter((t) => t && !PARTICULAS.has(t));
}

/** Distancia de edición ≤ 1 (una letra cambiada, sobrante o faltante). */
function casiIgual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let cambios = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++cambios > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return cambios + (a.length - i) + (b.length - j) <= 1;
}

/** Cada palabra de `a` aparece (o casi) en `b`, sin usar dos veces la misma. */
function contenido(a: string[], b: string[]): boolean {
  const libres = [...b];
  return a.every((x) => {
    const k = libres.findIndex((y) => casiIgual(x, y));
    if (k < 0) return false;
    libres.splice(k, 1);
    return true;
  });
}

/**
 * Busca al trabajador por nombre. El Excel escribe «APELLIDOS NOMBRES» o
 * «NOMBRE APELLIDO», a veces incompleto y con errores de una letra.
 *  - exacto: mismas palabras en cualquier orden;
 *  - probable: uno contiene al otro (tolerando una letra por palabra) con 3+
 *    palabras en común y un único candidato;
 *  - parcial: igual pero con solo 2 palabras («EDGAR PUELLO») — más riesgoso:
 *    el script no lo carga salvo que se pida;
 *  - ambiguo: más de un candidato; ninguno: sin coincidencia.
 */
export function crearEmparejadorNombres(maestro: Trabajador[]) {
  const conPalabras = maestro.map((c) => ({ c, t: palabrasNombre(c.nombre) }));
  const porClave = new Map<string, Trabajador[]>();
  for (const { c, t } of conPalabras) {
    const k = [...t].sort().join(" ");
    porClave.set(k, [...(porClave.get(k) ?? []), c]);
  }
  return (nombre: string): Emparejamiento => {
    const t = palabrasNombre(nombre);
    if (t.length === 0) return { tipo: "ninguno" };
    const exactos = porClave.get([...t].sort().join(" ")) ?? [];
    if (exactos.length === 1) return { tipo: "exacto", conductor: exactos[0] };
    if (exactos.length > 1) return { tipo: "ambiguo", candidatos: exactos };

    const parecidos = conPalabras
      .filter(({ t: m }) => Math.min(m.length, t.length) >= 2 && (t.length <= m.length ? contenido(t, m) : contenido(m, t)))
      .map(({ c, t: m }) => ({ c, comunes: Math.min(m.length, t.length) }));
    if (parecidos.length === 1) return { tipo: parecidos[0].comunes >= 3 ? "probable" : "parcial", conductor: parecidos[0].c };
    if (parecidos.length > 1) return { tipo: "ambiguo", candidatos: parecidos.map((p) => p.c) };
    return { tipo: "ninguno" };
  };
}

/** Clave para no cargar dos veces el mismo proceso (p. ej. nov–dic en ambas hojas). */
export function claveDuplicado(cedula: string, p: Pick<ProcesoHistorico, "fecha_hecho" | "tipo" | "motivo">): string {
  return `${cedula}|${p.fecha_hecho}|${p.tipo}|${p.motivo}`;
}
