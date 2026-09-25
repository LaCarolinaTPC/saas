/**
 * Análisis de Gestión de flota — funciones puras sobre las filas de
 * `vw_financiera_consolidado` (vehículo-mes). Filtros en cascada, acumulación
 * al corte, agrupación por código de vehículo (nunca por placa) y los
 * agregados de cada pantalla. Sin acceso a datos: lo alimenta consulta.ts.
 *
 * Reglas del aplicativo original que se conservan (plan, sección 8):
 *   - Filtros Año → Mes → Flota → Propietario → Vehículo, cada uno reduce las
 *     opciones del siguiente.
 *   - Elegir un mes ACUMULA desde enero hasta ese mes.
 *   - KPIs de flota ponderados (Σutilidad / Σingresos), nunca promedio de columna.
 *   - Vista de rentabilidad: operativa (sin intereses), después de financiero
 *     o ambas (punto 18 de la sección 14, conservado).
 */

import {
  indicadores,
  kpisFlota,
  nivelSemaforo,
  type EstadoPeriodo,
  type Indicadores,
  type KpisFlota,
  type NivelSemaforo,
  type ParametroSemaforo,
  type VehiculoMes,
  type VistaRentabilidad,
} from "./motor";

// ── Filas de entrada ─────────────────────────────────────────────────────────

/** Una fila de `vw_financiera_consolidado`, ya tipada. */
export interface FilaConsolidada extends VehiculoMes {
  periodo: string;
  codigoVehiculo: string;
  propietarios: number;
  cedulaPropietario: string | null;
  propietarioNombre: string | null;
  tipoPropietario: string | null;
  placa: string | null;
  /** Marca del maestro de vehículos, asociada por código. */
  marca?: string | null;
  modelo: string | null;
  vehiculoActivo: boolean | null;
  estadoPeriodo: EstadoPeriodo | null;
  diasConProduccion: number;
  fet: number;
  valorCamb: number;
  incentivoC: number;
  valorDescuentos: number;
  tieneContable: boolean;
  /**
   * El bus no tuvo fila en GEMA ese mes (no operó, p. ej. estuvo en el taller)
   * pero contabilidad le registró costo. Suma a la utilidad y no cuenta para
   * la productividad.
   */
  sinOperacion?: boolean;
}

/** Dueños de un vehículo en un mes, desde financiera_operativo_mes. */
export interface Propietario {
  cedula: string;
  nombre: string | null;
  tipo: string | null;
}

export type PropietariosPorFila = ReadonlyMap<string, readonly Propietario[]>;

export const llaveFila = (periodo: string, codigoVehiculo: string) => `${periodo}|${codigoVehiculo}`;

// ── Filtros ──────────────────────────────────────────────────────────────────

export interface Filtros {
  anio: number;
  /** 1..12 o null = todo el año. Con mes, se acumula enero → mes. */
  mes: number | null;
  flota: string | null;
  marca?: string | null;
  propietario: string | null;
  vehiculo: string | null;
  vista: VistaRentabilidad;
}

export const VISTAS: VistaRentabilidad[] = ["operativa", "financiero", "ambas"];

/** Lee los filtros de la URL. `anioPorDefecto` es el último año con datos. */
export function filtrosDesde(sp: Record<string, string | string[] | undefined>, anioPorDefecto: number): Filtros {
  const uno = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s == null || s === "" ? null : s;
  };
  const anio = Number(uno("anio"));
  const mes = Number(uno("mes"));
  const vista = uno("vista");
  return {
    anio: Number.isInteger(anio) && anio >= 2000 && anio <= 2100 ? anio : anioPorDefecto,
    mes: Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : null,
    flota: uno("flota"),
    marca: uno("marca"),
    propietario: uno("propietario"),
    vehiculo: uno("vehiculo"),
    vista: VISTAS.includes(vista as VistaRentabilidad) ? (vista as VistaRentabilidad) : "financiero",
  };
}

export function filtrosAQuery(f: Partial<Filtros>): string {
  const q = new URLSearchParams();
  if (f.anio != null) q.set("anio", String(f.anio));
  if (f.mes != null) q.set("mes", String(f.mes));
  if (f.flota) q.set("flota", f.flota);
  if (f.marca) q.set("marca", f.marca);
  if (f.propietario) q.set("propietario", f.propietario);
  if (f.vehiculo) q.set("vehiculo", f.vehiculo);
  if (f.vista && f.vista !== "financiero") q.set("vista", f.vista);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Períodos que cubre el filtro: enero → mes (acumulado al corte) o el año entero. */
export function periodosDelFiltro(anio: number, mes: number | null): string[] {
  const hasta = mes ?? 12;
  return Array.from({ length: hasta }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
}

/** ¿La fila pertenece al propietario? Directo o como uno de varios dueños del mes. */
export function esDelPropietario(f: FilaConsolidada, cedula: string, owners: PropietariosPorFila): boolean {
  if (f.cedulaPropietario === cedula) return true;
  const l = owners.get(llaveFila(f.periodo, f.codigoVehiculo));
  return !!l && l.some((p) => p.cedula === cedula);
}

export function aplicarFiltros(filas: readonly FilaConsolidada[], f: Filtros, owners: PropietariosPorFila): FilaConsolidada[] {
  const periodos = new Set(periodosDelFiltro(f.anio, f.mes));
  return filas.filter((r) => {
    if (!periodos.has(r.periodo)) return false;
    if (f.flota && r.tipoPropietario !== f.flota && !(r.tipoPropietario === "MIXTO" && tieneTipo(r, f.flota, owners))) return false;
    if (f.marca && r.marca !== f.marca) return false;
    if (f.propietario && !esDelPropietario(r, f.propietario, owners)) return false;
    if (f.vehiculo && r.codigoVehiculo !== f.vehiculo) return false;
    return true;
  });
}

function tieneTipo(f: FilaConsolidada, tipo: string, owners: PropietariosPorFila): boolean {
  const l = owners.get(llaveFila(f.periodo, f.codigoVehiculo));
  return !!l && l.some((p) => p.tipo === tipo);
}

export interface Opcion {
  valor: string;
  etiqueta: string;
}

export interface OpcionesFiltro {
  meses: number[];
  flotas: Opcion[];
  marcas: Opcion[];
  propietarios: Opcion[];
  vehiculos: Opcion[];
}

/**
 * Opciones de cada filtro dadas las anteriores (cascada). Los meses salen del
 * año; las flotas de lo que queda tras el año/mes; los propietarios tras la
 * flota; los vehículos tras el propietario.
 */
export function opcionesFiltro(filas: readonly FilaConsolidada[], f: Filtros, owners: PropietariosPorFila): OpcionesFiltro {
  const delAnio = filas.filter((r) => r.periodo.startsWith(`${f.anio}-`));
  const meses = [...new Set(delAnio.map((r) => Number(r.periodo.slice(5, 7))))].sort((a, b) => a - b);
  const base = aplicarFiltros(filas, { ...f, flota: null, marca: null, propietario: null, vehiculo: null }, owners);

  const flotas = new Map<string, string>();
  const marcas = new Map<string, string>();
  const props = new Map<string, string>();
  const vehs = new Map<string, string>();
  for (const r of base) {
    const duenos = owners.get(llaveFila(r.periodo, r.codigoVehiculo)) ?? [];
    const tipos = duenos.length ? duenos.map((d) => d.tipo) : [r.tipoPropietario];
    for (const t of tipos) if (t) flotas.set(t, t);
    if (f.flota && !tipos.includes(f.flota)) continue;
    if (r.marca) marcas.set(r.marca, r.marca);
    if (f.marca && r.marca !== f.marca) continue;
    for (const d of duenos.length ? duenos : r.cedulaPropietario ? [{ cedula: r.cedulaPropietario, nombre: r.propietarioNombre, tipo: r.tipoPropietario }] : []) {
      if (f.flota && d.tipo !== f.flota) continue;
      props.set(d.cedula, d.nombre ? `${d.cedula} — ${d.nombre}` : d.cedula);
    }
    if (f.propietario && !esDelPropietario(r, f.propietario, owners)) continue;
    vehs.set(r.codigoVehiculo, r.placa ? `${r.codigoVehiculo} · ${r.placa}` : r.codigoVehiculo);
  }
  const ordenar = (m: Map<string, string>) =>
    [...m.entries()].map(([valor, etiqueta]) => ({ valor, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true }));
  return { meses, flotas: ordenar(flotas), marcas: ordenar(marcas), propietarios: ordenar(props), vehiculos: ordenar(vehs) };
}

// ── Agrupación por vehículo ──────────────────────────────────────────────────

export interface VehiculoAcumulado extends VehiculoMes {
  codigoVehiculo: string;
  placa: string | null;
  marca?: string | null;
  modelo: string | null;
  tipoPropietario: string;
  propietarioNombre: string;
  cedulaPropietario: string | null;
  vehiculoActivo: boolean | null;
  /** Meses con cifra dentro del rango (con operación o solo con costo contable). */
  meses: number;
  /** Meses con fila en GEMA: el divisor de la productividad. */
  mesesConOperacion: number;
  /** Meses con costo contable y sin fila operativa de GEMA. */
  mesesSoloContable: number;
  mesesConContable: number;
  tieneContable: boolean;
  /** Viajes por mes con movimiento (la «productividad» del aplicativo). */
  productividad: number;
  /** Meses del rango con utilidad negativa. */
  mesesEnPerdida: number;
  /** Meses del rango con utilidad negativa en la vista operativa (sin intereses). */
  mesesEnPerdidaOperativa: number;
  indicadores: Indicadores;
}

const CERO_MES: VehiculoMes = {
  viajes: 0, timbradas: 0, ingresos: 0,
  fondo: 0, poliza: 0, prestamo: 0, estudio: 0, salario: 0, combustible: 0, rtica: 0, admon: 0, sitra: 0,
  despacho: 0, intereses: 0, otrosGastos: 0, repuestos: 0, manoDeObra: 0, descFondoConductor: 0,
  combustibleVehiculosNuevos: 0, polizaVehiculosNuevos: 0,
};

const CAMPOS_MES = Object.keys(CERO_MES) as (keyof VehiculoMes)[];

/** Suma los meses de cada vehículo. Placa, modelo y dueño: los del último mes. */
export function agruparPorVehiculo(filas: readonly FilaConsolidada[]): VehiculoAcumulado[] {
  const grupos = new Map<string, FilaConsolidada[]>();
  for (const f of filas) {
    const l = grupos.get(f.codigoVehiculo) ?? [];
    l.push(f);
    grupos.set(f.codigoVehiculo, l);
  }
  const out: VehiculoAcumulado[] = [];
  for (const [codigo, l] of grupos) {
    l.sort((a, b) => a.periodo.localeCompare(b.periodo));
    const ultimo = l[l.length - 1];
    const acc: VehiculoMes = { ...CERO_MES };
    let mesesConContable = 0, mesesEnPerdida = 0, mesesEnPerdidaOperativa = 0, mesesConOperacion = 0, mesesSoloContable = 0;
    for (const f of l) {
      if (f.viajes > 0) mesesConOperacion++;
      if (f.sinOperacion) mesesSoloContable++;
      for (const k of CAMPOS_MES) acc[k] += f[k];
      if (f.tieneContable) mesesConContable++;
      const i = indicadores(f);
      if (i.utilidadNeta < 0) mesesEnPerdida++;
      if (i.utilidadOperativa < 0) mesesEnPerdidaOperativa++;
    }
    const tipos = new Set(l.map((f) => f.tipoPropietario).filter(Boolean));
    const nombres = new Set(l.map((f) => f.propietarioNombre).filter(Boolean));
    out.push({
      ...acc,
      codigoVehiculo: codigo,
      placa: ultimo.placa,
      marca: ultimo.marca,
      modelo: ultimo.modelo,
      tipoPropietario: tipos.size === 1 ? [...tipos][0]! : tipos.size > 1 ? "MIXTO" : "—",
      propietarioNombre: nombres.size === 1 ? [...nombres][0]! : nombres.size > 1 ? "VARIOS" : "—",
      cedulaPropietario: nombres.size === 1 ? ultimo.cedulaPropietario : null,
      vehiculoActivo: ultimo.vehiculoActivo,
      meses: l.length,
      mesesConOperacion,
      mesesSoloContable,
      mesesConContable,
      tieneContable: mesesConContable === l.length,
      productividad: mesesConOperacion ? acc.viajes / mesesConOperacion : 0,
      mesesEnPerdida,
      mesesEnPerdidaOperativa,
      indicadores: indicadores(acc),
    });
  }
  return out.sort((a, b) => a.codigoVehiculo.localeCompare(b.codigoVehiculo, "es", { numeric: true }));
}

// ── Vistas de rentabilidad sobre un acumulado ────────────────────────────────

export interface ValoresVista {
  utilidad: number;
  rentabilidad: number;
  gastos: number;
  gastosPorTimbrada: number;
}

export function valoresVista(i: Indicadores, vista: Exclude<VistaRentabilidad, "ambas">): ValoresVista {
  return vista === "financiero"
    ? { utilidad: i.utilidadNeta, rentabilidad: i.rentabilidad, gastos: i.gastosOperativosTotales, gastosPorTimbrada: i.gastosPorTimbrada }
    : { utilidad: i.utilidadOperativa, rentabilidad: i.rentabilidadOperativa, gastos: i.gastosOperativosTotales - i.intereses, gastosPorTimbrada: i.gastosPorTimbradaOperativo };
}

/** La vista principal cuando se piden «ambas» es la operativa (fleetUtils.ts). */
export function vistaPrincipal(v: VistaRentabilidad): Exclude<VistaRentabilidad, "ambas"> {
  return v === "financiero" ? "financiero" : "operativa";
}

// ── Resúmenes de pantalla ────────────────────────────────────────────────────

export interface Cobertura {
  vehiculoMes: number;
  conContable: number;
  /** completo | parcial | sin_dato */
  estado: "completo" | "parcial" | "sin_dato";
}

export function cobertura(filas: readonly FilaConsolidada[]): Cobertura {
  const con = filas.filter((f) => f.tieneContable).length;
  return {
    vehiculoMes: filas.length,
    conContable: con,
    estado: filas.length === 0 || con === 0 ? "sin_dato" : con === filas.length ? "completo" : "parcial",
  };
}

export interface ResumenFlota extends KpisFlota {
  /** Vehículo-mes del rango (cada fila de la vista). */
  vehiculoMes: number;
  vehiculosDistintos: number;
  cobertura: Cobertura["estado"];
}

export function resumenFlota(filas: readonly FilaConsolidada[]): ResumenFlota {
  const k = kpisFlota(filas);
  const cob = cobertura(filas);
  return {
    ...k,
    vehiculoMes: filas.length,
    vehiculosDistintos: new Set(filas.map((f) => f.codigoVehiculo)).size,
    cobertura: cob.estado,
    // La productividad de flota es viajes por vehículo-mes, no por vehículo distinto.
    productividad: k.productividad,
  };
}

export interface FilaMes {
  periodo: string;
  estadoPeriodo: EstadoPeriodo | null;
  resumen: ResumenFlota;
}

/** Una fila por mes del rango, para comparación y gráficos. */
export function porMes(filas: readonly FilaConsolidada[]): FilaMes[] {
  const g = new Map<string, FilaConsolidada[]>();
  for (const f of filas) {
    const l = g.get(f.periodo) ?? [];
    l.push(f);
    g.set(f.periodo, l);
  }
  return [...g.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, l]) => ({ periodo, estadoPeriodo: l[0]?.estadoPeriodo ?? null, resumen: resumenFlota(l) }));
}

export interface GrupoVehiculos {
  nivel: NivelSemaforo;
  vehiculos: VehiculoAcumulado[];
  porcentaje: number;
  /** Promedio simple del indicador dentro del grupo (calculateKPIGroups). */
  promedio: number;
  brecha: number;
}

/**
 * ¿Se puede clasificar su gasto por timbrada? Sin timbradas el cociente vale
 * 0 y el semáforo lo pondría en «Excelente»: el 519 en 2025, siete meses sin
 * producir y 27,7 M de gasto, salía como el mejor. El aplicativo tenía el
 * mismo defecto (GastoTimbradaTab.tsx). Esos vehículos quedan fuera del
 * semáforo de este indicador y se rotulan «sin timbradas».
 */
export function tieneTimbradas(v: { timbradas: number }): boolean {
  return v.timbradas > 0;
}

export function agruparPorSemaforo(
  vehiculos: readonly VehiculoAcumulado[],
  valor: (v: VehiculoAcumulado) => number,
  p: ParametroSemaforo
): GrupoVehiculos[] {
  const g: Record<NivelSemaforo, VehiculoAcumulado[]> = { excelente: [], aceptable: [], critico: [] };
  for (const v of vehiculos) g[nivelSemaforo(valor(v), p)].push(v);
  return (["excelente", "aceptable", "critico"] as const).map((nivel) => {
    const l = g[nivel];
    const prom = l.length ? l.reduce((s, v) => s + valor(v), 0) / l.length : 0;
    return { nivel, vehiculos: l, porcentaje: vehiculos.length ? (l.length / vehiculos.length) * 100 : 0, promedio: prom, brecha: prom - p.umbralExcelente };
  });
}

/** Repuestos vs mano de obra: la pantalla Mantenimiento. */
export interface FilaMantenimiento {
  vehiculo: VehiculoAcumulado;
  repuestosNetos: number;
  manoDeObra: number;
  total: number;
  /** Mano de obra / total mantenimiento, en %. 0 si no hay mantenimiento. */
  pctManoDeObra: number;
  porTimbrada: number;
}

export function mantenimiento(vehiculos: readonly VehiculoAcumulado[]): FilaMantenimiento[] {
  return vehiculos
    .map((v) => {
      const repuestosNetos = v.repuestos - v.descFondoConductor;
      const total = repuestosNetos + v.manoDeObra;
      return {
        vehiculo: v,
        repuestosNetos,
        manoDeObra: v.manoDeObra,
        total,
        pctManoDeObra: total > 0 ? (v.manoDeObra / total) * 100 : 0,
        porTimbrada: v.timbradas > 0 ? total / v.timbradas : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}
