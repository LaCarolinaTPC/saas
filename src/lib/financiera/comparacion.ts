/** Datos compactos y cálculos puros de la comparación libre de períodos. */
export interface FilaComparacion {
  periodo: string;
  codigo: string;
  placa: string | null;
  flotas: string[];
  marca: string | null;
  propietarios: { cedula: string; nombre: string }[];
  ingresos: number;
  gastosFinancieros: number;
  gastosOperativos: number;
  tieneContable: boolean;
}

export type VistaComparacion = "financiero" | "operativa";
export type ModoComparacion = "acumulado" | "mensual";
export interface CorteComparacion { anio: number; mes: number }

export interface ResumenComparacion {
  vehiculos: number;
  registros: number;
  ingresos: number;
  gastos: number;
  utilidad: number;
  rentabilidad: number;
  completo: boolean;
}

export interface VehiculoComparado {
  codigo: string;
  placa: string | null;
  utilidad1: number;
  rentabilidad1: number;
  utilidad2: number;
  rentabilidad2: number;
  diferencia: number;
  completo1: boolean;
  completo2: boolean;
  presente1: boolean;
  presente2: boolean;
}

export function filasDelCorte(filas: readonly FilaComparacion[], modo: ModoComparacion, corte: CorteComparacion): FilaComparacion[] {
  const inicio = `${corte.anio}-01`;
  const fin = `${corte.anio}-${String(corte.mes).padStart(2, "0")}`;
  return filas.filter((fila) => modo === "mensual" ? fila.periodo === fin : fila.periodo >= inicio && fila.periodo <= fin);
}

export function resumirComparacion(filas: readonly FilaComparacion[], vista: VistaComparacion): ResumenComparacion {
  const ingresos = filas.reduce((total, fila) => total + fila.ingresos, 0);
  const gastos = filas.reduce((total, fila) => total + (vista === "financiero" ? fila.gastosFinancieros : fila.gastosOperativos), 0);
  const utilidad = ingresos - gastos;
  return {
    vehiculos: new Set(filas.map((fila) => fila.codigo)).size,
    registros: filas.length,
    ingresos,
    gastos,
    utilidad,
    rentabilidad: ingresos > 0 ? utilidad / ingresos * 100 : 0,
    completo: filas.every((fila) => fila.tieneContable),
  };
}

export function compararVehiculos(base: readonly FilaComparacion[], comparacion: readonly FilaComparacion[], vista: VistaComparacion): VehiculoComparado[] {
  const agrupar = (filas: readonly FilaComparacion[]) => {
    const grupos = new Map<string, FilaComparacion[]>();
    for (const fila of filas) {
      const grupo = grupos.get(fila.codigo) ?? [];
      grupo.push(fila);
      grupos.set(fila.codigo, grupo);
    }
    return grupos;
  };
  const primero = agrupar(base);
  const segundo = agrupar(comparacion);
  const codigos = [...new Set([...primero.keys(), ...segundo.keys()])].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return codigos.map((codigo) => {
    const filas1 = primero.get(codigo) ?? [];
    const filas2 = segundo.get(codigo) ?? [];
    const r1 = resumirComparacion(filas1, vista);
    const r2 = resumirComparacion(filas2, vista);
    return {
      codigo,
      placa: filas2.at(-1)?.placa ?? filas1.at(-1)?.placa ?? null,
      utilidad1: r1.utilidad,
      rentabilidad1: r1.rentabilidad,
      utilidad2: r2.utilidad,
      rentabilidad2: r2.rentabilidad,
      diferencia: r2.utilidad - r1.utilidad,
      completo1: r1.completo,
      completo2: r2.completo,
      presente1: filas1.length > 0,
      presente2: filas2.length > 0,
    };
  });
}
