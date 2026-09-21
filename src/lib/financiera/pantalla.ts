/**
 * Carga común de las pantallas analíticas de Gestión de flota: filtros desde
 * la URL, el año completo de la vista consolidada (para que la cascada de
 * filtros ofrezca todos los meses), dueños por vehículo-mes y umbrales. Solo
 * servidor.
 */

import {
  agruparPorVehiculo,
  aplicarFiltros,
  filtrosDesde,
  opcionesFiltro,
  periodosDelFiltro,
  resumenFlota,
  type FilaConsolidada,
  type Filtros,
  type OpcionesFiltro,
  type PropietariosPorFila,
  type ResumenFlota,
  type VehiculoAcumulado,
} from "./analisis";
import { aniosDisponibles, cargarConsolidado, cargarPropietarios, leerParametros } from "./consulta";
import type { IndicadorSemaforo, ParametroSemaforo } from "./motor";

export type SearchParams = Record<string, string | string[] | undefined>;

export interface Pantalla {
  filtros: Filtros;
  anios: number[];
  opciones: OpcionesFiltro;
  parametros: Record<IndicadorSemaforo, ParametroSemaforo>;
  /** Todo el año, sin filtrar (para la cascada y la comparación). */
  anio: FilaConsolidada[];
  /** Lo que cumple los filtros, ya acumulado al corte. */
  filas: FilaConsolidada[];
  vehiculos: VehiculoAcumulado[];
  resumen: ResumenFlota;
  owners: PropietariosPorFila;
}

export async function cargarPantalla(sp: SearchParams, opts: { anioAnterior?: boolean } = {}): Promise<Pantalla & { anterior: FilaConsolidada[] }> {
  const anios = await aniosDisponibles();
  const filtros = filtrosDesde(sp, anios[0] ?? new Date().getFullYear());
  const periodosAnio = periodosDelFiltro(filtros.anio, null);
  const periodosAnterior = opts.anioAnterior ? periodosDelFiltro(filtros.anio - 1, null) : [];
  const [anio, anterior, owners, parametros] = await Promise.all([
    cargarConsolidado(periodosAnio),
    periodosAnterior.length ? cargarConsolidado(periodosAnterior) : Promise.resolve([] as FilaConsolidada[]),
    cargarPropietarios([...periodosAnio, ...periodosAnterior]),
    leerParametros(),
  ]);
  const filas = aplicarFiltros(anio, filtros, owners);
  return {
    filtros,
    anios,
    opciones: opcionesFiltro(anio, filtros, owners),
    parametros,
    anio,
    anterior,
    filas,
    vehiculos: agruparPorVehiculo(filas),
    resumen: resumenFlota(filas),
    owners,
  };
}
