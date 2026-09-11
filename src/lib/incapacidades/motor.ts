/**
 * Motor de cálculo de recuperación de incapacidades — funciones puras, sin
 * acceso a datos. Lo comparten pantalla, exportación y pruebas.
 *
 * Reproduce las 13 fórmulas observadas en el libro `Incapacidades 2024_V1.xlsm`
 * (79 filas completas, anexo B de docs/Especificacion_aplicacion_incapacidades_2024.md)
 * como versiones de regla, y añade la regla operativa de GESTIVO decidida el
 * 2026-09-11 (Fase 0 del plan, docs/Plan_desarrollo_incapacidades_GESTIVO.md):
 *
 *   - `excel-2024-v1`        fórmula literal del libro (ARL SURA −1, otras −2)
 *   - `excel-2024-v1-round0` la variante Q70: Q redondeado a cero decimales
 *   - `gestivo-cobro-dias`   ARL todos los días; EPS inicial −2; prórroga todos
 *
 * Letras entre paréntesis = columna del libro, para poder cotejar con el anexo.
 * Nada aquí produce un desembolso: P (valor empresa) y M (días empresa) son
 * distribución histórica, no un pago.
 */

import { ORIGENES_ARL, DIAS_EMPLEADOR_EPS } from "../ausentismo/matriz-reglas";

// ── Reglas versionadas ───────────────────────────────────────────────────────

export type CodigoRegla = "excel-2024-v1" | "excel-2024-v1-round0" | "gestivo-cobro-dias";

export interface ParametrosRegla {
  /** F / divisor = salario diario. El libro usa 30 siempre. */
  divisorSalario: number;
  /** Factor por tipo de incapacidad (K). Clave en mayúsculas. */
  factorPorTipo: Record<string, number>;
  /** Factor para cualquier tipo no listado, incluido el vacío. El libro: 0.67 (no 2/3). */
  factorPorDefecto: number;
  /**
   * Días de una incapacidad INICIAL que asume el empleador.
   *  - porEntidad: por nombre literal de la entidad (J). El libro: { "ARL SURA": 1 }.
   *  - porClaseArl: si la entidad es una ARL (por clase, no por nombre). null = no distingue.
   *  - porDefecto: para todo lo demás.
   */
  diasEmpleador: {
    porEntidad: Record<string, number>;
    porClaseArl: number | null;
    porDefecto: number;
  };
  /** Decimales a los que se redondea Q (valor entidad). null = sin redondeo. */
  redondeoValorEntidad: number | null;
}

export interface ReglaMotor {
  codigo: CodigoRegla;
  descripcion: string;
  parametros: ParametrosRegla;
}

const PARAMETROS_EXCEL: ParametrosRegla = {
  divisorSalario: 30,
  factorPorTipo: { AT: 1, EG: 1 },
  factorPorDefecto: 0.67,
  diasEmpleador: { porEntidad: { "ARL SURA": 1 }, porClaseArl: null, porDefecto: 2 },
  redondeoValorEntidad: null,
};

export const REGLAS: Record<CodigoRegla, ReglaMotor> = {
  "excel-2024-v1": {
    codigo: "excel-2024-v1",
    descripcion:
      "Fórmulas literales del libro Incapacidades 2024_V1.xlsm (79 filas completas). Solo para compatibilidad y pruebas.",
    parametros: PARAMETROS_EXCEL,
  },
  "excel-2024-v1-round0": {
    codigo: "excel-2024-v1-round0",
    descripcion: "Variante observada en Q70: el valor entidad redondeado a cero decimales.",
    parametros: { ...PARAMETROS_EXCEL, redondeoValorEntidad: 0 },
  },
  "gestivo-cobro-dias": {
    codigo: "gestivo-cobro-dias",
    descripcion:
      "Regla operativa de GESTIVO (decisión 12.2 del 2026-09-11): la ARL responde por todos los días; la EPS reconoce una inicial desde el día 3 y una prórroga completa.",
    parametros: {
      ...PARAMETROS_EXCEL,
      diasEmpleador: { porEntidad: {}, porClaseArl: 0, porDefecto: DIAS_EMPLEADOR_EPS },
    },
  },
};

/** La regla con la que liquida GESTIVO. Las demás son de compatibilidad. */
export const REGLA_OPERATIVA: CodigoRegla = "gestivo-cobro-dias";

// ── Entradas y salidas ───────────────────────────────────────────────────────

/** Lo que el motor necesita para liquidar. Las letras son las columnas del libro. */
export interface EntradaLiquidacion {
  /** (F) Salario básico mensual. Vacío se toma como 0, igual que Excel; la aplicación exige diligenciarlo antes. */
  salarioBase: number | null;
  /** (G) Fecha de inicio, ISO AAAA-MM-DD. */
  fechaInicio: string | null;
  /** (H) Fecha de fin, ISO AAAA-MM-DD. */
  fechaFin: string | null;
  /** (J) Entidad pagadora, nombre tal como está en el catálogo. */
  entidad: string | null;
  /** (K) Tipo / origen: EG, AT, EL, LM, LP, EP… */
  tipo: string | null;
  /** (L) INICIAL o PRORROGA. Vacío o desconocido = todos los días a la entidad, como en el libro. */
  modalidad: string | null;
  /**
   * Días de incapacidad que trae la información inicial (la matriz EPS,
   * `dias_it_pagados`). Si viene, los días calculados desde las fechas tienen
   * que coincidir con este valor; si no coinciden, es incidencia y no se liquida.
   */
  diasInformados?: number | null;
  /**
   * Clase de la entidad para `gestivo-cobro-dias`. Si no viene, se deriva del
   * tipo con la misma regla de la matriz EPS (AT y EL pagan por ARL).
   */
  esArl?: boolean;
}

export interface Liquidacion {
  regla: CodigoRegla;
  /** (F/30) */
  salarioDiario: number;
  /** (I) Días de incapacidad, ambos extremos incluidos. */
  diasIncapacidad: number;
  /** (N) Días a cargo de la entidad. */
  diasEntidad: number;
  /** (M) Días a cargo de la empresa — distribución histórica, no un pago. */
  diasEmpresa: number;
  /** Factor aplicado por tipo. */
  factor: number;
  /** (O) Valor de la incapacidad completa. */
  valorTotal: number;
  /** (Q) Valor reconocido por la entidad: lo que se reclama. */
  valorEntidad: number;
  /** (P) Valor a cargo de la empresa — distribución histórica, no un desembolso. */
  valorEmpresa: number;
}

/** Entradas de los indicadores del legado (columnas B, R y X del libro). */
export interface EntradaLegado {
  /** (B) Cédula. En el libro solo importa si es > 0. */
  cedula: string | number | null;
  /** (R) Marca COBRADA: SI / NO / vacío. */
  cobrada: string | null;
  /** (X) Valor pagado por la entidad. Texto no convertible es incidencia, no cero. */
  valorPagado: number | string | null;
}

export type Conciliacion = "LO DEBIDO" | "A FAVOR" | "NO PAGADO";

/**
 * Indicadores tal como los calculaba el libro. Se conservan para las pruebas
 * de compatibilidad y para explicar diferencias; NO son el estado ni el saldo
 * del expediente en GESTIVO (sección 16 del plan).
 */
export interface IndicadoresLegado {
  /** (T) Valor cobrado: Q si R = SI; 0 en cualquier otro caso. Todo o nada. */
  valorCobrado: number;
  /** (U) Q − T. */
  valorNoCobrado: number;
  /** (S) PAGADA: SI si X > 1; NO si la cédula es > 0; vacío si no. */
  pagada: "SI" | "NO" | "";
  /** (V) Pendiente del legado: Q si S = NO. No resta X: oculta pagos parciales. */
  pendiente: number;
  /** (W) 1 si V > 0. */
  contador: 0 | 1;
  /** (Y) Compara X con T (no con Q), sin tolerancia. */
  conciliacion: Conciliacion;
  /** X ya convertido a número. */
  valorPagado: number;
}

/** Algo que el libro resolvía en silencio y GESTIVO no debe: se reporta, no se liquida. */
export class IncidenciaMotor extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "IncidenciaMotor";
    this.codigo = codigo;
  }
}

// ── Semántica de Excel que hay que respetar ──────────────────────────────────

/** Comparación de texto como la hace Excel: sin distinguir mayúsculas, pero un espacio de más sí cuenta. */
export function igualExcel(a: string | null | undefined, b: string): boolean {
  return (a ?? "").toUpperCase() === b.toUpperCase();
}

/** ROUND de Excel: la mitad se aleja de cero (Math.round la lleva hacia +∞). */
export function redondeoExcel(x: number, decimales: number): number {
  const m = 10 ** decimales;
  const s = x < 0 ? -1 : 1;
  return (s * Math.round(Math.abs(x) * m)) / m;
}

const DIA_MS = 86_400_000;

function fechaUTC(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) throw new IncidenciaMotor("fecha_invalida", `Fecha no válida: ${iso}`);
  return t;
}

// ── Las piezas del cálculo ───────────────────────────────────────────────────

/**
 * (I) `IF(G>0, H−G+1, 0)`: sin fecha de inicio no hay días. Con inicio y sin
 * fin el libro daba un número negativo sin sentido; aquí es incidencia.
 */
export function diasIncapacidad(fechaInicio: string | null, fechaFin: string | null): number {
  if (!fechaInicio) return 0;
  if (!fechaFin) throw new IncidenciaMotor("fecha_fin_faltante", "La incapacidad tiene inicio pero no fin.");
  return Math.round((fechaUTC(fechaFin) - fechaUTC(fechaInicio)) / DIA_MS) + 1;
}

/**
 * Los días calculados desde las fechas deben ser los mismos que trae la
 * información inicial. Devuelve los días validados o lanza la incidencia.
 * Si no hay dato inicial (null), no hay nada que cotejar.
 */
export function validarDiasContraInformados(diasCalculados: number, diasInformados: number | null | undefined): number {
  if (diasInformados == null) return diasCalculados;
  if (!Number.isInteger(diasInformados)) {
    throw new IncidenciaMotor("dias_informados_invalidos", `Los días informados (${diasInformados}) no son un entero.`);
  }
  if (diasCalculados !== diasInformados) {
    throw new IncidenciaMotor(
      "dias_no_coinciden",
      `Los días calculados desde las fechas (${diasCalculados}) no coinciden con los de la información inicial (${diasInformados}).`
    );
  }
  return diasCalculados;
}

/** Factor por tipo (K): 1 para AT y EG en todas las reglas; 0.67 para el resto, incluido el vacío. */
export function factor(tipo: string | null, regla: ReglaMotor = REGLAS[REGLA_OPERATIVA]): number {
  const k = (tipo ?? "").toUpperCase();
  return regla.parametros.factorPorTipo[k] ?? regla.parametros.factorPorDefecto;
}

/**
 * (N) Días a cargo de la entidad. Una modalidad distinta de INICIAL (prórroga,
 * vacía o desconocida) reconoce todos los días, como en el libro. En una
 * inicial, la entidad reconoce los días menos los que asume el empleador.
 */
export function diasEntidad(
  entrada: Pick<EntradaLiquidacion, "entidad" | "tipo" | "modalidad" | "esArl">,
  dias: number,
  regla: ReglaMotor = REGLAS[REGLA_OPERATIVA]
): number {
  if (!igualExcel(entrada.modalidad, "INICIAL")) return dias;
  const p = regla.parametros.diasEmpleador;
  const porNombre = Object.entries(p.porEntidad).find(([nombre]) => igualExcel(entrada.entidad, nombre));
  let empleador: number;
  if (porNombre) {
    empleador = porNombre[1];
  } else if (p.porClaseArl != null && (entrada.esArl ?? ORIGENES_ARL.has((entrada.tipo ?? "").toUpperCase()))) {
    empleador = p.porClaseArl;
  } else {
    empleador = p.porDefecto;
  }
  return Math.max(dias - empleador, 0);
}

/** Liquidación completa: I, N, M, factor, O, Q, P. Misma secuencia de operaciones que el libro. */
export function liquidar(entrada: EntradaLiquidacion, regla: ReglaMotor = REGLAS[REGLA_OPERATIVA]): Liquidacion {
  const p = regla.parametros;
  const dias = validarDiasContraInformados(
    diasIncapacidad(entrada.fechaInicio, entrada.fechaFin),
    entrada.diasInformados
  );
  const nEntidad = diasEntidad(entrada, dias, regla);
  const f = factor(entrada.tipo, regla);
  const salarioDiario = (entrada.salarioBase ?? 0) / p.divisorSalario;
  const valorTotal = salarioDiario * dias * f; // O = ((F/30)*I)*factor
  let valorEntidad = salarioDiario * nEntidad * f; // Q = ((F/30)*N)*factor
  if (p.redondeoValorEntidad != null) valorEntidad = redondeoExcel(valorEntidad, p.redondeoValorEntidad);
  return {
    regla: regla.codigo,
    salarioDiario,
    diasIncapacidad: dias,
    diasEntidad: nEntidad,
    diasEmpresa: dias - nEntidad,
    factor: f,
    valorTotal,
    valorEntidad,
    valorEmpresa: valorTotal - valorEntidad,
  };
}

/** (X) como número. Vacío = 0 como en Excel; texto no convertible = incidencia. */
export function valorPagadoNumerico(x: number | string | null | undefined): number {
  if (x == null) return 0;
  if (typeof x === "number") {
    if (!Number.isFinite(x)) throw new IncidenciaMotor("valor_pagado_no_numerico", "El valor pagado no es un número.");
    return x;
  }
  const s = x.trim();
  if (s === "") return 0;
  const n = Number(s.replace(/\s/g, ""));
  if (!Number.isFinite(n)) {
    throw new IncidenciaMotor("valor_pagado_no_numerico", `El valor pagado «${x}» no es un número.`);
  }
  return n;
}

/**
 * (B > 0) como lo evalúa Excel: un número positivo, o un texto no numérico
 * (Excel ordena cualquier texto por encima de cualquier número).
 */
function cedulaPositiva(cedula: string | number | null): boolean {
  if (cedula == null) return false;
  if (typeof cedula === "number") return cedula > 0;
  const s = cedula.trim();
  if (s === "") return false;
  const n = Number(s);
  return Number.isNaN(n) ? true : n > 0;
}

/** Indicadores del legado (S, T, U, V, W, Y) a partir de la liquidación y de B, R, X. */
export function indicadoresLegado(entrada: EntradaLegado, liq: Pick<Liquidacion, "valorEntidad">): IndicadoresLegado {
  const q = liq.valorEntidad;
  const x = valorPagadoNumerico(entrada.valorPagado);
  const valorCobrado = igualExcel(entrada.cobrada, "SI") ? q : 0;
  const pagada: "SI" | "NO" | "" = x > 1 ? "SI" : cedulaPositiva(entrada.cedula) ? "NO" : "";
  const pendiente = pagada === "NO" ? q : 0;
  const diferencia = x - valorCobrado;
  const conciliacion: Conciliacion = diferencia === 0 ? "LO DEBIDO" : diferencia > 0 ? "A FAVOR" : "NO PAGADO";
  return {
    valorCobrado,
    valorNoCobrado: q - valorCobrado,
    pagada,
    pendiente,
    contador: pendiente > 0 ? 1 : 0,
    conciliacion,
    valorPagado: x,
  };
}

// ── Nombre por cédula (C) ────────────────────────────────────────────────────

/** Catálogo de personas: cédula → nombre. Un Map o una función de búsqueda. */
export type CatalogoPersonas = Map<string, string> | ((cedula: string) => string | undefined);

/**
 * (C) `IFERROR(VLOOKUP(B, Personal!A:B, 2, 0), " ")`. GESTIVO devuelve si
 * encontró o no, para mostrar el error; `compat` es lo que dejaba el libro:
 * el nombre o un espacio en blanco.
 */
export function nombrePorCedula(
  cedula: string | number | null,
  catalogo: CatalogoPersonas
): { encontrado: boolean; nombre: string | null; compat: string } {
  const c = cedula == null ? "" : String(cedula).trim();
  const nombre = c === "" ? undefined : typeof catalogo === "function" ? catalogo(c) : catalogo.get(c);
  return nombre != null ? { encontrado: true, nombre, compat: nombre } : { encontrado: false, nombre: null, compat: " " };
}
