/**
 * Motor de cálculo del módulo Financiera (Gestión de flota) — funciones puras,
 * sin acceso a datos. Lo comparten la vista SQL (que lo transcribe), las
 * pantallas, los exportes y las pruebas.
 *
 * Reproduce las fórmulas de `excelParser.ts` y `fleetUtils.ts` del aplicativo
 * `lacarolinagestionflota` (Lovable, commit 94c75e5), que son el oráculo de
 * las pruebas: docs/Plan_desarrollo_financiera_GESTIVO.md, secciones 3 y 12.
 *
 *   gastos_operativos_totales = despacho + fondo + poliza + prestamo + salario
 *       + intereses + estudio + sitra + combustible + rtica + admon
 *       + otros_gastos + (repuestos − desc_fondo_conductor) + mano_de_obra
 *   utilidad_neta       = ingresos − gastos_operativos_totales
 *   rentabilidad (%)    = ingresos > 0 ? utilidad_neta / ingresos × 100 : 0
 *   gastos_por_timbrada = timbradas > 0 ? gastos_operativos_totales / timbradas : 0
 *
 * Decisiones del acta del 2026-09-18 que este archivo fija:
 *   - Ingresos = bruto; ADMON = admon (2,5 % del bruto), NUNCA cartu_admon.
 *   - TIM. = timbradas, no timbradas_cu.
 *   - La utilidad resta solo las 15 partidas del Excel: fet, valor_camb,
 *     incentivo_c y valor_descuentos son informativos.
 *   - `liquido` no se usa para nada: no es reproducible.
 *   - Los KPIs de flota son promedio PONDERADO (Σutilidad / Σingresos), nunca
 *     el promedio de una columna.
 *   - Se guarda con 2 decimales, se muestra y exporta en pesos enteros;
 *     rentabilidad con 2 decimales.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Los 9 rubros de GEMA que SÍ entran en la utilidad. */
export interface RubrosGema {
  fondo: number;
  poliza: number;
  prestamo: number;
  estudio: number;
  salario: number;
  combustible: number;
  rtica: number;
  admon: number;
  sitra: number;
}

/** Los 6 rubros que no existen en GEMA y llegan por archivo. */
export interface RubrosContables {
  despacho: number;
  intereses: number;
  otrosGastos: number;
  repuestos: number;
  manoDeObra: number;
  descFondoConductor: number;
}

/** Producción del vehículo-mes. */
export interface Produccion {
  viajes: number;
  timbradas: number;
  ingresos: number;
}

/** Lo que necesita el motor para un vehículo-mes completo. */
export type VehiculoMes = Produccion & RubrosGema & RubrosContables;

/** Indicadores derivados de un vehículo-mes (o de un agregado). */
export interface Indicadores {
  gastosGema: number;
  gastosContables: number;
  repuestosNetos: number;
  /** Se repite aquí porque las vistas de rentabilidad lo separan del resto. */
  intereses: number;
  gastosOperativosTotales: number;
  utilidadNeta: number;
  rentabilidad: number;
  gastosPorTimbrada: number;
  /** Sin intereses: el único rubro tratado como financiero (fleetUtils.ts). */
  utilidadOperativa: number;
  rentabilidadOperativa: number;
  gastosPorTimbradaOperativo: number;
}

export const RUBROS_GEMA = [
  "fondo", "poliza", "prestamo", "estudio", "salario",
  "combustible", "rtica", "admon", "sitra",
] as const satisfies readonly (keyof RubrosGema)[];

export const RUBROS_CONTABLES = [
  "despacho", "intereses", "otrosGastos", "repuestos", "manoDeObra", "descFondoConductor",
] as const satisfies readonly (keyof RubrosContables)[];

export const RUBROS_CONTABLES_CERO: RubrosContables = {
  despacho: 0, intereses: 0, otrosGastos: 0, repuestos: 0, manoDeObra: 0, descFondoConductor: 0,
};

// ── Fórmulas ─────────────────────────────────────────────────────────────────

/** Suma de los 9 rubros de GEMA. */
export function gastosGema(r: RubrosGema): number {
  return r.fondo + r.poliza + r.prestamo + r.estudio + r.salario
    + r.combustible + r.rtica + r.admon + r.sitra;
}

/** `Desc. Fondo-conductor` se RESTA de Repuestos, no se suma como gasto. */
export function repuestosNetos(c: RubrosContables): number {
  return c.repuestos - c.descFondoConductor;
}

/** Suma de los 6 rubros del archivo, con repuestos ya netos. */
export function gastosContables(c: RubrosContables): number {
  return c.despacho + c.intereses + c.otrosGastos + repuestosNetos(c) + c.manoDeObra;
}

export function gastosOperativosTotales(v: RubrosGema & RubrosContables): number {
  return gastosGema(v) + gastosContables(v);
}

export function utilidadNeta(v: VehiculoMes): number {
  return v.ingresos - gastosOperativosTotales(v);
}

/** Rentabilidad en %: 0 cuando no hay ingresos (nunca división por cero). */
export function rentabilidad(ingresos: number, utilidad: number): number {
  return ingresos > 0 ? (utilidad / ingresos) * 100 : 0;
}

/** Gasto por timbrada: 0 cuando no hay timbradas. */
export function gastosPorTimbrada(timbradas: number, gastos: number): number {
  return timbradas > 0 ? gastos / timbradas : 0;
}

/** Todos los indicadores de un vehículo-mes (o de una suma de ellos). */
export function indicadores(v: VehiculoMes): Indicadores {
  const gema = gastosGema(v);
  const contables = gastosContables(v);
  const totales = gema + contables;
  const utilidad = v.ingresos - totales;
  const sinIntereses = totales - v.intereses;
  return {
    gastosGema: gema,
    gastosContables: contables,
    repuestosNetos: repuestosNetos(v),
    intereses: v.intereses,
    gastosOperativosTotales: totales,
    utilidadNeta: utilidad,
    rentabilidad: rentabilidad(v.ingresos, utilidad),
    gastosPorTimbrada: gastosPorTimbrada(v.timbradas, totales),
    utilidadOperativa: v.ingresos - sinIntereses,
    rentabilidadOperativa: rentabilidad(v.ingresos, v.ingresos - sinIntereses),
    gastosPorTimbradaOperativo: gastosPorTimbrada(v.timbradas, sinIntereses),
  };
}

// ── Vistas de rentabilidad (fleetUtils.ts) ───────────────────────────────────

export type VistaRentabilidad = "operativa" | "financiero" | "ambas";

export const VISTA_RENTABILIDAD_ETIQUETAS: Record<VistaRentabilidad, string> = {
  operativa: "Operativa (sin intereses)",
  financiero: "Después de financiero",
  ambas: "Ambas",
};

/** Costos según la vista. 'ambas' usa la operativa como principal. */
export function costosPorVista(i: Indicadores, vista: VistaRentabilidad): number {
  return vista === "financiero"
    ? i.gastosOperativosTotales
    : i.gastosOperativosTotales - i.intereses;
}

export function utilidadPorVista(i: Indicadores, vista: VistaRentabilidad): number {
  return vista === "financiero" ? i.utilidadNeta : i.utilidadOperativa;
}

export function rentabilidadPorVista(i: Indicadores, vista: VistaRentabilidad): number {
  return vista === "financiero" ? i.rentabilidad : i.rentabilidadOperativa;
}

export function gastoTimbradaPorVista(i: Indicadores, vista: VistaRentabilidad): number {
  return vista === "financiero" ? i.gastosPorTimbrada : i.gastosPorTimbradaOperativo;
}

// ── Agregación de flota (promedio ponderado) ─────────────────────────────────

export interface TotalesFlota extends VehiculoMes {
  vehiculos: number;
  /** Cuántos vehículos-mes tienen los rubros contables cargados. */
  conContable: number;
}

export interface KpisFlota extends Indicadores {
  vehiculos: number;
  conContable: number;
  cobertura: "completo" | "parcial" | "sin_dato";
  /** Viajes por vehículo-mes (el "objetivo 90/80" del aplicativo). */
  productividad: number;
  viajes: number;
  timbradas: number;
  ingresos: number;
}

const CERO: VehiculoMes = {
  viajes: 0, timbradas: 0, ingresos: 0,
  fondo: 0, poliza: 0, prestamo: 0, estudio: 0, salario: 0,
  combustible: 0, rtica: 0, admon: 0, sitra: 0,
  ...RUBROS_CONTABLES_CERO,
};

/** Suma campo a campo. Los indicadores se derivan DESPUÉS de sumar. */
export function sumarVehiculosMes(
  filas: readonly (VehiculoMes & { tieneContable?: boolean })[]
): TotalesFlota {
  const t: TotalesFlota = { ...CERO, vehiculos: 0, conContable: 0 };
  for (const f of filas) {
    for (const k of Object.keys(CERO) as (keyof VehiculoMes)[]) t[k] += f[k];
    t.vehiculos += 1;
    if (f.tieneContable) t.conContable += 1;
  }
  return t;
}

/** KPIs de flota: rentabilidad y gasto/timbrada ponderados, productividad media. */
export function kpisFlota(
  filas: readonly (VehiculoMes & { tieneContable?: boolean })[]
): KpisFlota {
  const t = sumarVehiculosMes(filas);
  const i = indicadores(t);
  return {
    ...i,
    vehiculos: t.vehiculos,
    conContable: t.conContable,
    cobertura: t.vehiculos === 0 || t.conContable === 0
      ? "sin_dato"
      : t.conContable === t.vehiculos ? "completo" : "parcial",
    productividad: t.vehiculos > 0 ? t.viajes / t.vehiculos : 0,
    viajes: t.viajes,
    timbradas: t.timbradas,
    ingresos: t.ingresos,
  };
}

// ── Semáforos ────────────────────────────────────────────────────────────────

export type NivelSemaforo = "excelente" | "aceptable" | "critico";

export type IndicadorSemaforo = "rentabilidad" | "gasto_timbrada" | "productividad";

export interface ParametroSemaforo {
  indicador: IndicadorSemaforo;
  etiqueta: string;
  unidad: string;
  mayorEsMejor: boolean;
  umbralExcelente: number;
  umbralAceptable: number;
}

/**
 * Semilla = los cortes quemados en fleetUtils.ts del aplicativo. La misma que
 * inserta la migración en `financiera_parametros`; en producción se leen de
 * la tabla, esto es el respaldo y el oráculo de las pruebas.
 */
export const PARAMETROS_SEMILLA: Record<IndicadorSemaforo, ParametroSemaforo> = {
  rentabilidad: {
    indicador: "rentabilidad", etiqueta: "Rentabilidad", unidad: "%",
    mayorEsMejor: true, umbralExcelente: 15, umbralAceptable: 5,
  },
  gasto_timbrada: {
    indicador: "gasto_timbrada", etiqueta: "Gasto por timbrada", unidad: "COP",
    mayorEsMejor: false, umbralExcelente: 2500, umbralAceptable: 3200,
  },
  productividad: {
    indicador: "productividad", etiqueta: "Productividad (viajes por vehículo-mes)", unidad: "viajes",
    mayorEsMejor: true, umbralExcelente: 90, umbralAceptable: 80,
  },
};

export const SEMAFORO_ETIQUETAS: Record<NivelSemaforo, { etiqueta: string; emoji: string }> = {
  excelente: { etiqueta: "Excelente", emoji: "🟢" },
  aceptable: { etiqueta: "Aceptable", emoji: "🟡" },
  critico: { etiqueta: "Crítico", emoji: "🔴" },
};

/**
 * Regla única de semáforo. Con mayorEsMejor: excelente si valor ≥ excelente,
 * aceptable si ≥ aceptable; al revés con ≤ cuando menor es mejor. Es la
 * misma comparación inclusiva de getRentabilidadStatus / getGastoTimbradaStatus
 * / getProductividadStatus.
 */
export function nivelSemaforo(valor: number, p: ParametroSemaforo): NivelSemaforo {
  if (p.mayorEsMejor) {
    if (valor >= p.umbralExcelente) return "excelente";
    if (valor >= p.umbralAceptable) return "aceptable";
    return "critico";
  }
  if (valor <= p.umbralExcelente) return "excelente";
  if (valor <= p.umbralAceptable) return "aceptable";
  return "critico";
}

/** Un parámetro es coherente si su dirección y sus umbrales no se contradicen. */
export function parametroValido(p: ParametroSemaforo): boolean {
  if (!Number.isFinite(p.umbralExcelente) || !Number.isFinite(p.umbralAceptable)) return false;
  return p.mayorEsMejor
    ? p.umbralExcelente >= p.umbralAceptable
    : p.umbralExcelente <= p.umbralAceptable;
}

export interface GrupoSemaforo {
  nivel: NivelSemaforo;
  cantidad: number;
  porcentaje: number;
  /** Promedio simple del valor dentro del grupo (calculateKPIGroups). */
  promedio: number;
  objetivo: number;
  brecha: number;
}

/**
 * Reparto de vehículos por nivel, como `calculateKPIGroups`: cantidad, % del
 * total, promedio simple del valor en el grupo y brecha contra el objetivo
 * (el umbral de excelente). Para KPIs de flota use kpisFlota, no esto.
 */
export function gruposSemaforo(valores: readonly number[], p: ParametroSemaforo): GrupoSemaforo[] {
  const grupos: Record<NivelSemaforo, number[]> = { excelente: [], aceptable: [], critico: [] };
  for (const v of valores) grupos[nivelSemaforo(v, p)].push(v);
  const total = valores.length;
  return (["excelente", "aceptable", "critico"] as const).map((nivel) => {
    const vs = grupos[nivel];
    const promedio = vs.length > 0 ? vs.reduce((s, x) => s + x, 0) / vs.length : 0;
    return {
      nivel,
      cantidad: vs.length,
      porcentaje: total > 0 ? (vs.length / total) * 100 : 0,
      promedio,
      objetivo: p.umbralExcelente,
      brecha: promedio - p.umbralExcelente,
    };
  });
}

// ── Consolidación día → mes (transcripción de financiera_consolidar_periodo) ─
// Sirve para probar la regla y para cotejar la vista SQL contra el espejo
// (work/fin-cotejar-consolidado.mts). Nunca filtra por estado del vehículo:
// los retirados entran (acta, punto 11).

/** Una fila de `ingreso_tercero` con lo que la consolidación necesita. */
export interface FilaDiaria {
  fecha: string; // YYYY-MM-DD
  codigo_vehiculo: string | null;
  cedula_propietario: string | null;
  propietario_nombre: string | null;
  tipo_propietario: string | null;
  placa: string | null;
  viajes: number | null;
  timbradas: number | null;
  bruto: number | null;
  cartu_fondo: number | null;
  cartu_poliza: number | null;
  cartu_presta: number | null;
  cartu_estudio: number | null;
  salario: number | null;
  combustible: number | null;
  rtica: number | null;
  admon: number | null;
  sitra: number | null;
  fet: number | null;
  valor_camb: number | null;
  incentivo_c: number | null;
  valor_descuentos: number | null;
}

export interface OperativoMes extends Produccion, RubrosGema {
  periodo: string;
  codigoVehiculo: string;
  cedulaPropietario: string;
  propietarioNombre: string | null;
  tipoPropietario: string | null;
  placa: string | null;
  placaCambio: boolean;
  diasConProduccion: number;
  fet: number;
  valorCamb: number;
  incentivoC: number;
  valorDescuentos: number;
  filasOrigen: number;
}

export function periodoDe(fecha: string): string {
  return fecha.slice(0, 7);
}

const n = (x: number | null | undefined): number => x ?? 0;

/**
 * Agrupa las filas diarias por (periodo, vehículo, propietario). El
 * propietario se conserva tal como venía: un bus con dos dueños en el mes da
 * dos filas. Placa, nombre y tipo son los del último día con producción.
 */
export function consolidarDias(filas: readonly FilaDiaria[]): OperativoMes[] {
  const grupos = new Map<string, { filas: FilaDiaria[] }>();
  for (const f of filas) {
    if (!f.codigo_vehiculo) continue;
    const key = `${periodoDe(f.fecha)}|${f.codigo_vehiculo}|${f.cedula_propietario ?? ""}`;
    const g = grupos.get(key);
    if (g) g.filas.push(f);
    else grupos.set(key, { filas: [f] });
  }
  const out: OperativoMes[] = [];
  for (const { filas: fs } of grupos.values()) {
    const ultima = [...fs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))[0];
    const placas = new Set(fs.map((f) => f.placa).filter((p): p is string => p != null));
    const fila: OperativoMes = {
      periodo: periodoDe(ultima.fecha),
      codigoVehiculo: ultima.codigo_vehiculo as string,
      cedulaPropietario: ultima.cedula_propietario ?? "",
      propietarioNombre: ultima.propietario_nombre,
      tipoPropietario: ultima.tipo_propietario,
      placa: ultima.placa,
      placaCambio: placas.size > 1,
      diasConProduccion: new Set(fs.map((f) => f.fecha)).size,
      viajes: 0, timbradas: 0, ingresos: 0,
      fondo: 0, poliza: 0, prestamo: 0, estudio: 0, salario: 0,
      combustible: 0, rtica: 0, admon: 0, sitra: 0,
      fet: 0, valorCamb: 0, incentivoC: 0, valorDescuentos: 0,
      filasOrigen: fs.length,
    };
    for (const f of fs) {
      fila.viajes += n(f.viajes);
      fila.timbradas += n(f.timbradas);
      fila.ingresos += n(f.bruto);
      fila.fondo += n(f.cartu_fondo);
      fila.poliza += n(f.cartu_poliza);
      fila.prestamo += n(f.cartu_presta);
      fila.estudio += n(f.cartu_estudio);
      fila.salario += n(f.salario);
      fila.combustible += n(f.combustible);
      fila.rtica += n(f.rtica);
      fila.admon += n(f.admon);
      fila.sitra += n(f.sitra);
      fila.fet += n(f.fet);
      fila.valorCamb += n(f.valor_camb);
      fila.incentivoC += n(f.incentivo_c);
      fila.valorDescuentos += n(f.valor_descuentos);
    }
    out.push(fila);
  }
  return out.sort((a, b) =>
    a.periodo.localeCompare(b.periodo)
    || a.codigoVehiculo.localeCompare(b.codigoVehiculo, "es", { numeric: true })
    || a.cedulaPropietario.localeCompare(b.cedulaPropietario)
  );
}

/**
 * Suma las filas operativas de todos los dueños de un bus en el mes (nivel
 * vehículo-mes de vw_financiera_consolidado) y les une la contable, que es
 * del vehículo. Sin contable ⇒ rubros en 0 y `tieneContable = false`.
 */
export function vehiculoMesDesde(
  operativo: readonly OperativoMes[],
  contable: RubrosContables | null
): VehiculoMes & { tieneContable: boolean; propietarios: number } {
  const v: VehiculoMes & { tieneContable: boolean; propietarios: number } = {
    ...CERO,
    ...(contable ?? RUBROS_CONTABLES_CERO),
    tieneContable: contable != null,
    propietarios: operativo.length,
  };
  for (const o of operativo) {
    v.viajes += o.viajes;
    v.timbradas += o.timbradas;
    v.ingresos += o.ingresos;
    for (const k of RUBROS_GEMA) v[k] += o[k];
  }
  return v;
}

// ── Cierre de período por el marcador de GEMA ────────────────────────────────

export type EstadoPeriodo = "abierto" | "cerrado" | "reabierto";

export function ultimoDiaDelPeriodo(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)); // día 0 del mes siguiente
  return ultimo.toISOString().slice(0, 10);
}

/**
 * Un período se cierra cuando el marcador del sync (`last_synced_date` de
 * ingreso_tercero) es >= su último día. Aplica a abiertos y reabiertos.
 */
export function debeCerrarse(periodo: string, estado: EstadoPeriodo, marcaGema: string | null): boolean {
  if (!marcaGema) return false;
  if (estado === "cerrado") return false;
  return ultimoDiaDelPeriodo(periodo) <= marcaGema;
}

export function esPeriodoValido(periodo: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
}

// ── Redondeo y presentación (acta, punto 8) ──────────────────────────────────

/** Pesos enteros para mostrar y exportar. */
export function aPesos(valor: number): number {
  return Math.round(valor);
}

/** Dos decimales para guardar importes y para la rentabilidad. */
export function aDosDecimales(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Tolerancia del cotejo contra el aplicativo: ±1 COP por partida y vehículo-mes. */
export const TOLERANCIA_COTEJO_COP = 1;
/** ±0,01 puntos en rentabilidad. */
export const TOLERANCIA_COTEJO_RENTABILIDAD = 0.01;

export function cuadra(a: number, b: number, tolerancia = TOLERANCIA_COTEJO_COP): boolean {
  return Math.abs(a - b) <= tolerancia + 1e-9;
}

/** Homologa el `Flota` del Excel a AFILIADO o EMPRESA (normalizeFlota de fleetUtils.ts). */
export function normalizarFlota(valor: unknown): string {
  const raw = String(valor ?? "").trim();
  if (!raw) return "";
  const k = raw.toLowerCase();
  if (["afiliado", "afiliados", "afiliada", "afiliadas"].includes(k)) return "AFILIADO";
  if (["propio", "propios", "propia", "propias", "empresa"].includes(k)) return "EMPRESA";
  return raw.toUpperCase();
}
