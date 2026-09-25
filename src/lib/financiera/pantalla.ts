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
import { aniosDisponibles, cargarConsolidado, cargarMarcasVehiculos, cargarPropietarios, leerParametros } from "./consulta";
import type { IndicadorSemaforo, ParametroSemaforo } from "./motor";
import { salvedadesEnRango, type Salvedad } from "./salvedades";

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
  /** Salvedades de vehículo que tocan el rango filtrado. */
  salvedades: Salvedad[];
}

export async function cargarPantalla(sp: SearchParams, opts: { anioAnterior?: boolean } = {}): Promise<Pantalla & { anterior: FilaConsolidada[] }> {
  const anios = await aniosDisponibles();
  const filtros = filtrosDesde(sp, anios[0] ?? new Date().getFullYear());
  const periodosAnio = periodosDelFiltro(filtros.anio, null);
  const periodosAnterior = opts.anioAnterior ? periodosDelFiltro(filtros.anio - 1, null) : [];
  const [anioCrudo, anteriorCrudo, owners, parametros, marcas] = await Promise.all([
    cargarConsolidado(periodosAnio),
    periodosAnterior.length ? cargarConsolidado(periodosAnterior) : Promise.resolve([] as FilaConsolidada[]),
    cargarPropietarios([...periodosAnio, ...periodosAnterior]),
    leerParametros(),
    cargarMarcasVehiculos(),
  ]);
  const conMarca = (filas: FilaConsolidada[]) => filas.map((fila) => ({ ...fila, marca: marcas.get(fila.codigoVehiculo) ?? null }));
  const anio = conMarca(anioCrudo);
  const anterior = conMarca(anteriorCrudo);
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
    salvedades: salvedadesEnRango(filas),
  };
}
