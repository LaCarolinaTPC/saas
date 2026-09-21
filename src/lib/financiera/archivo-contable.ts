/**
 * Archivo contable de Financiera — lectura y validación, funciones puras.
 *
 * Los rubros que no existen en GEMA (plan, sección 3.5) llegan por un archivo
 * CSV o Excel (sección 6.6, DECIDIDO 2026-09-18):
 *
 *   periodo, vehiculo, despacho, intereses, otros_gastos, repuestos,
 *   mano_de_obra, desc_fondo_conductor
 *   combustible_vehiculos_nuevos, poliza_vehiculos_nuevos   (opcionales)
 *
 * Reglas que este archivo fija:
 *   - La cabecera debe traer las ocho columnas obligatorias; las dos de
 *     vehículos nuevos pueden faltar (se toleran mayúsculas, tildes,
 *     espacios y los nombres del Excel original: DESPACHO, INTERESES,
 *     OTROS GASTOS, Repuestos, Mano de Obra, Desc. Fondo - conductor). Si
 *     falta una, se rechaza el archivo entero, nunca a medias.
 *   - CSV en UTF-8 con separador `,` o `;` detectado automáticamente y
 *     decimal `,` o `.`. Excel: primera hoja, cabecera en la fila 1.
 *   - Vacío es 0, igual que `Number(x) || 0` en excelParser.ts, y se cuenta
 *     cuántas celdas se interpretaron así. Un texto que no es número rechaza
 *     la fila.
 *   - El vehículo se coteja contra la operativa del MISMO período (lo que
 *     muestra ingreso_tercero), no contra el maestro: sin movimiento ese mes,
 *     la fila se rechaza y se reporta; el resto entra (punto 6-bis del acta).
 *   - Un período que no existe en el consolidado rechaza el archivo entero.
 *   - Período cerrado (6.4): el archivo entra si el mes AÚN NO tiene archivo
 *     contable (el cierre lo pone GEMA días después de terminar el mes y
 *     contabilidad entrega después; sin esto el módulo no podría recibir
 *     ningún mes). Reemplazar lo ya cargado en un mes cerrado sí exige que el
 *     administrador lo reabra: eso cambia una cifra ya reportada. Ver
 *     `REEMPLAZO_EN_CERRADO_EXIGE_REAPERTURA`.
 *   - Dos filas del mismo vehículo y período en el archivo: la segunda se
 *     rechaza (la carga es idempotente por esa llave y sumar a ciegas
 *     escondería un error del archivo).
 */

import * as XLSX from "xlsx";
import type { RubrosContables } from "./motor";
import { esPeriodoValido, gastosContables, type EstadoPeriodo } from "./motor";

// ── Contrato del archivo ─────────────────────────────────────────────────────

export const COLUMNAS_ARCHIVO = [
  "periodo",
  "vehiculo",
  "despacho",
  "intereses",
  "otros_gastos",
  "repuestos",
  "mano_de_obra",
  "desc_fondo_conductor",
  "combustible_vehiculos_nuevos",
  "poliza_vehiculos_nuevos",
] as const;

/**
 * Columnas que pueden faltar sin que el archivo se rechace. Se anadieron
 * despues (2026-09-21) y contabilidad sigue teniendo archivos con las ocho
 * originales: exigirlas romperia todos de golpe. Ausente vale 0, y NO cuenta
 * como celda vacia, porque ausente no es lo mismo que dejada en blanco.
 */
export const COLUMNAS_OPCIONALES: readonly ColumnaArchivo[] = [
  "combustible_vehiculos_nuevos",
  "poliza_vehiculos_nuevos",
];

export type ColumnaArchivo = (typeof COLUMNAS_ARCHIVO)[number];

export const RUBROS_ARCHIVO = [
  "despacho", "intereses", "otros_gastos", "repuestos", "mano_de_obra", "desc_fondo_conductor",
  "combustible_vehiculos_nuevos", "poliza_vehiculos_nuevos",
] as const satisfies readonly ColumnaArchivo[];

export const ETIQUETAS_COLUMNA: Record<ColumnaArchivo, string> = {
  periodo: "Período (AAAA-MM)",
  vehiculo: "Vehículo (código GEMA)",
  despacho: "Despacho",
  intereses: "Intereses",
  otros_gastos: "Otros gastos",
  repuestos: "Repuestos",
  mano_de_obra: "Mano de obra",
  desc_fondo_conductor: "Desc. fondo-conductor (se resta de repuestos)",
  combustible_vehiculos_nuevos: "Combustible de vehiculos nuevos (el que GEMA no registra)",
  poliza_vehiculos_nuevos: "Poliza de vehiculos nuevos (la que GEMA no registra)",
};

/** Nombres alternativos aceptados en la cabecera, ya normalizados. */
const ALIAS: Record<string, ColumnaArchivo> = {
  periodo: "periodo", mes: "periodo", fecha_ok: "periodo", fechas: "periodo",
  vehiculo: "vehiculo", vehi: "vehiculo", codigo: "vehiculo", codigo_vehiculo: "vehiculo", bus: "vehiculo",
  despacho: "despacho",
  intereses: "intereses", interes: "intereses",
  otros_gastos: "otros_gastos", otros: "otros_gastos",
  repuestos: "repuestos",
  mano_de_obra: "mano_de_obra", mano_obra: "mano_de_obra",
  desc_fondo_conductor: "desc_fondo_conductor", desc_fondo: "desc_fondo_conductor",
  descuento_fondo_conductor: "desc_fondo_conductor", fondo_conductor: "desc_fondo_conductor",
  combustible_vehiculos_nuevos: "combustible_vehiculos_nuevos",
  combustible_nuevos: "combustible_vehiculos_nuevos",
  combustible_vehiculo_nuevo: "combustible_vehiculos_nuevos",
  poliza_vehiculos_nuevos: "poliza_vehiculos_nuevos",
  poliza_nuevos: "poliza_vehiculos_nuevos",
  poliza_vehiculo_nuevo: "poliza_vehiculos_nuevos",
};

/** Si el mes está cerrado y ya tiene archivo, reemplazarlo exige reabrir. */
export const REEMPLAZO_EN_CERRADO_EXIGE_REAPERTURA = true;

/** Filas máximas por archivo: un año entero de la flota son ~1.900. */
export const MAX_FILAS = 20_000;

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface TablaCruda {
  /** Cabecera tal como venía. */
  encabezado: string[];
  /** Filas de datos; cada celda puede ser string, number, Date o null. */
  filas: unknown[][];
  /** Separador detectado (solo CSV). */
  separador?: "," | ";";
}

export interface FilaArchivo extends RubrosContables {
  /** Número de línea en el archivo (la cabecera es la 1). */
  linea: number;
  periodo: string;
  vehiculo: string;
  celdasVacias: number;
}

export interface FilaRechazada {
  linea: number;
  periodo: string | null;
  vehiculo: string | null;
  motivo: string;
}

export interface PeriodoContexto {
  periodo: string;
  estado: EstadoPeriodo;
  /** Vehículos con movimiento en el mes según la operativa consolidada. */
  vehiculos: ReadonlySet<string>;
  /** Rubros ya cargados por vehículo (vacío si el mes no tiene archivo). */
  existentes: ReadonlyMap<string, RubrosContables>;
  /** Ingresos y gastos GEMA del mes, para mostrar el efecto en la utilidad. */
  ingresos: number;
  gastosGema: number;
  /**
   * Lo que GEMA sí reporta de combustible y póliza por vehículo. Sirve para
   * avisar cuando alguien carga el concepto de «vehículos nuevos» en un
   * vehículo-mes que GEMA ya cubre: ahí el costo se contaría dos veces.
   */
  gemaPorVehiculo?: ReadonlyMap<string, { combustible: number; poliza: number }>;
}

export interface ResumenPeriodo {
  periodo: string;
  estado: EstadoPeriodo;
  validas: number;
  nuevas: number;
  reemplazadas: number;
  rechazadas: number;
  /** Vehículos del mes que quedarían sin archivo tras la carga. */
  sinArchivo: number;
  vehiculosMes: number;
  antes: { gastosContables: number; utilidad: number; vehiculosConArchivo: number };
  despues: { gastosContables: number; utilidad: number; vehiculosConArchivo: number };
}

/** Algo que conviene mirar, pero que no impide cargar. */
export interface AvisoFila {
  linea: number;
  periodo: string;
  vehiculo: string;
  mensaje: string;
}

export interface ResultadoValidacion {
  /** Si viene, el archivo entero se rechaza y `validas` está vacío. */
  errorArchivo: string | null;
  validas: FilaArchivo[];
  rechazadas: FilaRechazada[];
  /** No bloquean la carga; se muestran en la previsualización. */
  avisos: AvisoFila[];
  celdasVacias: number;
  porPeriodo: ResumenPeriodo[];
  totalFilas: number;
}

// ── Normalización ────────────────────────────────────────────────────────────

export function normalizarEncabezado(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Mapea la cabecera del archivo a sus columnas. Devuelve la posición de cada
 * una o el mensaje de error del archivo entero. Las de COLUMNAS_OPCIONALES
 * pueden faltar: quedan sin índice y valen 0.
 */
export function mapearEncabezado(encabezado: unknown[]): { indices: Record<ColumnaArchivo, number> } | { error: string } {
  const indices: Partial<Record<ColumnaArchivo, number>> = {};
  const sobrantes: string[] = [];
  encabezado.forEach((h, i) => {
    const n = normalizarEncabezado(h);
    if (!n) return;
    const col = ALIAS[n];
    if (col && indices[col] == null) indices[col] = i;
    else if (!col) sobrantes.push(String(h));
  });
  const faltan = COLUMNAS_ARCHIVO.filter((c) => indices[c] == null && !COLUMNAS_OPCIONALES.includes(c));
  if (faltan.length) {
    return {
      error:
        `La cabecera no coincide con la plantilla. Faltan: ${faltan.join(", ")}.` +
        (sobrantes.length ? ` Columnas no reconocidas: ${sobrantes.slice(0, 6).join(", ")}.` : "") +
        " Descarga la plantilla y conserva sus columnas.",
    };
  }
  return { indices: indices as Record<ColumnaArchivo, number> };
}

const MESES: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
};

/** AAAA-MM, AAAA-M, AAAA/MM, MM/AAAA, "marzo 2026", "mar-26", fecha Excel o Date → AAAA-MM. */
export function normalizarPeriodo(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // La librería xlsx entrega las fechas de celda en hora local (así las
    // escribió quien llenó el Excel), por eso getters locales y no UTC. Se
    // redondea al minuto porque el serial de Excel puede llegar como
    // 23:59:59.999 del día anterior por pérdida de precisión.
    const r = new Date(Math.round(v.getTime() / 60_000) * 60_000);
    return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const d = XLSX.SSF.parse_date_code(Math.round(v * 1440) / 1440);
      if (d) return `${d.y}-${String(d.m).padStart(2, "0")}`;
    }
    if (v >= 190001 && v <= 210012) return `${Math.floor(v / 100)}-${String(v % 100).padStart(2, "0")}`; // 202603
    return null;
  }
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:[t\s].*)?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // DD/MM/AAAA
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{6})$/);
  if (m) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  m = s.normalize("NFD").replace(/[̀-ͯ]/g, "").match(/^([a-z]+)[\s\-/]*(\d{2}|\d{4})$/);
  if (m && MESES[m[1]]) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${MESES[m[1]]}`;
  }
  return null;
}

/** Código de vehículo: texto sin espacios ni ceros a la izquierda; 500.0 de Excel → 500. */
export function normalizarVehiculo(v: unknown): string | null {
  if (v == null) return null;
  let s = typeof v === "number" ? String(Math.trunc(v)) : String(v).trim();
  if (!s) return null;
  s = s.replace(/\.0+$/, "").replace(/\s+/g, "");
  if (/^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, "");
  return s;
}

/**
 * Número en formato colombiano o anglosajón. `decimalCsv` fija el separador
 * decimal cuando el archivo es CSV (`;` ⇒ coma decimal; `,` ⇒ punto). Para
 * Excel, si la celda es texto se decide por la última marca que aparece.
 * Devuelve `vacio: true` cuando la celda está vacía (⇒ 0) y null si no es número.
 */
export function parsearNumero(v: unknown, decimalCsv?: "," | "."): { valor: number; vacio: boolean } | null {
  if (v == null) return { valor: 0, vacio: true };
  if (typeof v === "number") return Number.isFinite(v) ? { valor: v, vacio: false } : null;
  if (typeof v === "boolean") return null;
  let s = String(v).trim();
  if (s === "" || s === "-" || s === "—") return { valor: 0, vacio: true };
  s = s.replace(/[$\s ]/g, "").replace(/^COP/i, "");
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { negativo = !negativo; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;

  let decimal: "," | "." | null;
  const tieneComa = s.includes(",");
  const tienePunto = s.includes(".");
  if (decimalCsv) decimal = decimalCsv;
  else if (tieneComa && tienePunto) decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  else if (tieneComa) decimal = ",";
  else if (tienePunto) {
    // Un solo punto con exactamente tres dígitos detrás y algo delante (1.234) es miles en Colombia.
    decimal = /^\d{1,3}(\.\d{3})+$/.test(s) ? null : ".";
  } else decimal = null;

  let limpio: string;
  if (decimal === ",") limpio = s.replace(/\./g, "").replace(",", ".");
  else if (decimal === ".") limpio = s.replace(/,/g, "");
  else limpio = s.replace(/[.,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return { valor: negativo ? -n : n, vacio: false };
}

// ── Lectura ──────────────────────────────────────────────────────────────────

/** Detecta `;` o `,` por la cabecera: gana el que más veces aparece. */
export function detectarSeparador(primeraLinea: string): "," | ";" {
  const pc = (primeraLinea.match(/;/g) ?? []).length;
  const cc = (primeraLinea.match(/,/g) ?? []).length;
  return pc >= cc ? ";" : ",";
}

/** CSV mínimo con comillas dobles (RFC 4180): campos entre comillas pueden llevar el separador y saltos. */
export function leerCsv(texto: string): TablaCruda {
  const t = texto.replace(/^﻿/, "");
  const primera = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = detectarSeparador(primera);
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      filas.push(fila); fila = [];
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  const noVacias = filas.filter((f) => f.some((x) => x.trim() !== ""));
  const [encabezado = [], ...datos] = noVacias;
  return { encabezado: encabezado.map((h) => h.trim()), filas: datos, separador: sep };
}

/** Primera hoja del libro, cabecera en la fila 1; las fechas llegan como Date. */
export function leerXlsx(datos: ArrayBuffer | Uint8Array | Buffer): TablaCruda {
  const wb = XLSX.read(datos, { type: "buffer", cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  if (!hoja) return { encabezado: [], filas: [] };
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: null, blankrows: false });
  const [encabezado = [], ...filas] = matriz;
  return { encabezado: encabezado.map((h) => String(h ?? "").trim()), filas };
}

export function esExcel(nombre: string): boolean {
  return /\.xlsx?$/i.test(nombre);
}

export function esCsv(nombre: string): boolean {
  return /\.(csv|txt)$/i.test(nombre);
}

/** Elige el lector por la extensión. */
export function leerArchivo(nombre: string, datos: Buffer): TablaCruda | { error: string } {
  if (esExcel(nombre)) return leerXlsx(datos);
  if (esCsv(nombre)) return leerCsv(datos.toString("utf8"));
  return { error: "Solo se acepta CSV (.csv) o Excel (.xlsx)." };
}

// ── Interpretación de filas ──────────────────────────────────────────────────

export interface FilasInterpretadas {
  errorArchivo: string | null;
  filas: FilaArchivo[];
  rechazadas: FilaRechazada[];
  celdasVacias: number;
}

/** Pasa la tabla cruda a filas tipadas. Solo reglas de formato; nada de la base. */
export function interpretarFilas(tabla: TablaCruda): FilasInterpretadas {
  const mapa = mapearEncabezado(tabla.encabezado);
  if ("error" in mapa) return { errorArchivo: mapa.error, filas: [], rechazadas: [], celdasVacias: 0 };
  if (tabla.filas.length === 0) return { errorArchivo: "El archivo no tiene filas de datos debajo de la cabecera.", filas: [], rechazadas: [], celdasVacias: 0 };
  if (tabla.filas.length > MAX_FILAS) return { errorArchivo: `El archivo tiene ${tabla.filas.length} filas; el máximo es ${MAX_FILAS}.`, filas: [], rechazadas: [], celdasVacias: 0 };

  const { indices } = mapa;
  const decimalCsv = tabla.separador ? (tabla.separador === ";" ? "," : ".") : undefined;
  const filas: FilaArchivo[] = [];
  const rechazadas: FilaRechazada[] = [];
  const vistas = new Set<string>();
  let celdasVacias = 0;

  tabla.filas.forEach((cruda, i) => {
    const linea = i + 2;
    const celda = (c: ColumnaArchivo) => cruda[indices[c]];
    if (cruda.every((x) => x == null || String(x).trim() === "")) return;

    const periodo = normalizarPeriodo(celda("periodo"));
    const vehiculo = normalizarVehiculo(celda("vehiculo"));
    if (!periodo || !esPeriodoValido(periodo)) {
      rechazadas.push({ linea, periodo: periodo ?? textoCorto(celda("periodo")), vehiculo, motivo: "Período no válido: use AAAA-MM." });
      return;
    }
    if (!vehiculo) {
      rechazadas.push({ linea, periodo, vehiculo: null, motivo: "Falta el código del vehículo." });
      return;
    }
    const llave = `${periodo}|${vehiculo}`;
    if (vistas.has(llave)) {
      rechazadas.push({ linea, periodo, vehiculo, motivo: "Vehículo repetido en el mismo período dentro del archivo; se conserva la primera fila." });
      return;
    }

    const fila: FilaArchivo = {
      linea, periodo, vehiculo, celdasVacias: 0,
      despacho: 0, intereses: 0, otrosGastos: 0, repuestos: 0, manoDeObra: 0, descFondoConductor: 0,
      combustibleVehiculosNuevos: 0, polizaVehiculosNuevos: 0,
    };
    const destino: Record<(typeof RUBROS_ARCHIVO)[number], keyof RubrosContables> = {
      despacho: "despacho", intereses: "intereses", otros_gastos: "otrosGastos",
      repuestos: "repuestos", mano_de_obra: "manoDeObra", desc_fondo_conductor: "descFondoConductor",
      combustible_vehiculos_nuevos: "combustibleVehiculosNuevos",
      poliza_vehiculos_nuevos: "polizaVehiculosNuevos",
    };
    for (const col of RUBROS_ARCHIVO) {
      // Columna que el archivo no trae: vale 0 y no cuenta como celda vacia.
      if (indices[col] == null) continue;
      const n = parsearNumero(celda(col), decimalCsv);
      if (n == null) {
        rechazadas.push({ linea, periodo, vehiculo, motivo: `«${textoCorto(celda(col))}» en ${ETIQUETAS_COLUMNA[col]} no es un número.` });
        return;
      }
      if (n.vacio) fila.celdasVacias++;
      fila[destino[col]] = n.valor;
    }
    celdasVacias += fila.celdasVacias;
    vistas.add(llave);
    filas.push(fila);
  });

  return { errorArchivo: null, filas, rechazadas, celdasVacias };
}

function textoCorto(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.length > 30 ? `${s.slice(0, 27)}…` : s;
}

// ── Validación contra el consolidado ─────────────────────────────────────────

/**
 * Cruza las filas con el estado real de cada período. Devuelve qué entra, qué
 * se rechaza y con qué motivo, y el efecto en los totales de cada mes.
 */
export function validarContraConsolidado(
  interpretadas: FilasInterpretadas,
  contexto: ReadonlyMap<string, PeriodoContexto>
): ResultadoValidacion {
  const base: ResultadoValidacion = {
    errorArchivo: interpretadas.errorArchivo,
    validas: [],
    rechazadas: [...interpretadas.rechazadas],
    avisos: [],
    celdasVacias: interpretadas.celdasVacias,
    porPeriodo: [],
    totalFilas: interpretadas.filas.length + interpretadas.rechazadas.length,
  };
  if (base.errorArchivo) return base;

  const periodos = [...new Set(interpretadas.filas.map((f) => f.periodo))].sort();
  for (const p of periodos) {
    const ctx = contexto.get(p);
    if (!ctx) {
      return { ...base, errorArchivo: `El período ${p} no existe en el consolidado: consolide primero desde GEMA (o revise el período del archivo).` };
    }
    if (ctx.estado === "cerrado" && REEMPLAZO_EN_CERRADO_EXIGE_REAPERTURA && ctx.existentes.size > 0) {
      return {
        ...base,
        errorArchivo: `El período ${p} está cerrado y ya tiene archivo contable cargado. Reemplazarlo cambia una cifra ya reportada: pida al administrador que lo reabra (Parámetros) y vuelva a cargar.`,
      };
    }
  }

  const porPeriodo = new Map<string, FilaArchivo[]>();
  for (const f of interpretadas.filas) {
    const ctx = contexto.get(f.periodo)!;
    if (!ctx.vehiculos.has(f.vehiculo)) {
      base.rechazadas.push({
        linea: f.linea, periodo: f.periodo, vehiculo: f.vehiculo,
        motivo: `El vehículo ${f.vehiculo} no tuvo movimiento en ${f.periodo} según GEMA.`,
      });
      continue;
    }
    const gema = ctx.gemaPorVehiculo?.get(f.vehiculo);
    if (gema) {
      if (f.combustibleVehiculosNuevos !== 0 && gema.combustible !== 0) {
        base.avisos.push({
          linea: f.linea, periodo: f.periodo, vehiculo: f.vehiculo,
          mensaje:
            "GEMA ya reporta combustible para este vehiculo en " + f.periodo +
            ". Si ademas carga «combustible de vehiculos nuevos», el costo se cuenta dos veces.",
        });
      }
      if (f.polizaVehiculosNuevos !== 0 && gema.poliza !== 0) {
        base.avisos.push({
          linea: f.linea, periodo: f.periodo, vehiculo: f.vehiculo,
          mensaje:
            "GEMA ya reporta poliza para este vehiculo en " + f.periodo +
            ". Si ademas carga «poliza de vehiculos nuevos», el costo se cuenta dos veces.",
        });
      }
    }
    base.validas.push(f);
    const l = porPeriodo.get(f.periodo) ?? [];
    l.push(f);
    porPeriodo.set(f.periodo, l);
  }
  base.rechazadas.sort((a, b) => a.linea - b.linea);

  for (const p of periodos) {
    const ctx = contexto.get(p)!;
    const filas = porPeriodo.get(p) ?? [];
    const rechazadas = base.rechazadas.filter((r) => r.periodo === p).length;
    let nuevas = 0, reemplazadas = 0;
    const despues = new Map<string, RubrosContables>(ctx.existentes);
    for (const f of filas) {
      if (ctx.existentes.has(f.vehiculo)) reemplazadas++; else nuevas++;
      despues.set(f.vehiculo, f);
    }
    const suma = (m: ReadonlyMap<string, RubrosContables>) => [...m.values()].reduce((s, r) => s + gastosContables(r), 0);
    const antesGastos = suma(ctx.existentes);
    const despuesGastos = suma(despues);
    porPeriodo.get(p);
    base.porPeriodo.push({
      periodo: p,
      estado: ctx.estado,
      validas: filas.length,
      nuevas,
      reemplazadas,
      rechazadas,
      sinArchivo: [...ctx.vehiculos].filter((v) => !despues.has(v)).length,
      vehiculosMes: ctx.vehiculos.size,
      antes: {
        gastosContables: antesGastos,
        utilidad: ctx.ingresos - ctx.gastosGema - antesGastos,
        vehiculosConArchivo: [...ctx.existentes.keys()].filter((v) => ctx.vehiculos.has(v)).length,
      },
      despues: {
        gastosContables: despuesGastos,
        utilidad: ctx.ingresos - ctx.gastosGema - despuesGastos,
        vehiculosConArchivo: [...despues.keys()].filter((v) => ctx.vehiculos.has(v)).length,
      },
    });
  }

  return base;
}

// ── Plantilla ────────────────────────────────────────────────────────────────

export const FILA_EJEMPLO: Record<ColumnaArchivo, string | number> = {
  periodo: "2026-03",
  vehiculo: "500",
  despacho: 120000,
  intereses: 350000,
  otros_gastos: 80000,
  repuestos: 950000,
  mano_de_obra: 400000,
  desc_fondo_conductor: 150000,
  combustible_vehiculos_nuevos: 0,
  poliza_vehiculos_nuevos: 0,
};

/** CSV con `;` y coma decimal, que es lo que abre Excel en Colombia sin preguntar. */
export function plantillaCsv(): string {
  const cab = COLUMNAS_ARCHIVO.join(";");
  const fila = COLUMNAS_ARCHIVO.map((c) => String(FILA_EJEMPLO[c])).join(";");
  return `﻿${cab}\r\n${fila}\r\n`;
}
