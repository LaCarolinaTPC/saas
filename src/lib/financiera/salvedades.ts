// Salvedades por vehículo: hechos que cambian cómo se lee la cifra de un bus
// en un tramo de meses y que no se pueden corregir con los datos que hay.
// Se muestran en pantalla cuando el rango los toca y van al pie de los
// informes exportados.

/** Un tramo de meses de un vehículo cuya cifra hay que leer con cuidado. */
export interface Salvedad {
  codigoVehiculo: string;
  /** Primer y último período afectados, AAAA-MM, inclusive. */
  desde: string;
  hasta: string;
  /** Marca corta junto al código en las tablas. */
  etiqueta: string;
  titulo: string;
  texto: string;
}

export const SALVEDADES: readonly Salvedad[] = [
  {
    // Verificado el 2026-09-22: misma placa, modelo 2008, afiliado; el código
    // 903 no existe en el maestro de GEMA. En 2025-05 el aplicativo reporta 79
    // viajes y 18.678.750, y GEMA los dos dueños del 972 suman exactamente eso.
    // Desde 2026-05 el aplicativo ya usa el 972 y esos meses sí cargaron. Los
    // 15 meses del 903 se cargaron bajo el 972 el 2026-09-23 (carga 485c6bd1),
    // con viajes e ingresos cuadrando mes a mes contra GEMA.
    codigoVehiculo: "972",
    desde: "2025-01",
    hasta: "2026-03",
    etiqueta: "antes 903",
    titulo: "El vehículo 972 se numeraba 903 hasta marzo de 2026",
    texto:
      "Es el mismo bus (placa UYX584), renumerado 972. De enero de 2025 a marzo de 2026 el aplicativo contable lo " +
      "registraba como 903. Los costos contables de esos 15 meses (50.409.100) están cargados bajo el 972; en los " +
      "informes antiguos del aplicativo ese tramo aparece con el código 903.",
  },
];

/** Las salvedades que tocan las filas del rango (vehículo y período). */
export function salvedadesEnRango(
  filas: readonly { periodo: string; codigoVehiculo: string }[],
  lista: readonly Salvedad[] = SALVEDADES,
): Salvedad[] {
  return lista.filter((s) => filas.some((f) => f.codigoVehiculo === s.codigoVehiculo && f.periodo >= s.desde && f.periodo <= s.hasta));
}

/** El texto de la nota al pie de un informe exportado. */
export function notasSalvedades(salvedades: readonly Salvedad[]): string[] {
  return salvedades.map((s) => `${s.titulo}. ${s.texto}`);
}
