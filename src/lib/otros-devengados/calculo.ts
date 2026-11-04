/**
 * Otros devengados: cruce de la producción GEMA de una quincena contra los
 * conceptos de devengo de la nómina de conductores YA CERRADA en MGX.
 *
 * Es una opción aparte de Caja devengados (src/lib/devengados/): no usa la
 * base diaria ni el corte a corte, y no modifica nada de esa lógica.
 *
 *   producción     = Σ salario neto día de los cierres GEMA de la quincena
 *   nómina devengo = Σ conceptos de devengo del período MGX (003, 006, 010,
 *                    013, 202, 208, 209 por defecto)
 *   generado       = producción − nómina devengo
 *   otros dev.     = max(0, generado)
 *   saldo          = generado − entregado
 *     saldo > 0 → otros devengados por entregar
 *     saldo < 0 → anticipo de salario del corte (déficit o entregado de más)
 *
 * El saldo no se arrastra a la quincena siguiente. Módulo puro: sin base.
 */

export const CONCEPTOS_DEVENGO_DEFECTO = ["003", "006", "010", "013", "202", "208", "209"] as const;
/** Conceptos de MGX que sirven de referencia para revisar el cruce. */
export const CONCEPTO_OTROS_DEVENGADOS_MGX = "216";
export const CONCEPTO_ANTICIPO_SALARIO_MGX = "546";

export interface QuincenaGema {
  periodo: string; // 'YYYY-MM'
  quincena: 1 | 2;
  ini: string;
  fin: string;
}

/**
 * Rango GEMA de la quincena de un período MGX. MGX cierra la segunda quincena
 * el día 30 aunque el mes tenga 31: el día 31 se liquida en la segunda
 * quincena, así que el emparejamiento es por año, mes y número de quincena
 * (subper), nunca por las fechas del período.
 */
export function quincenaGemaDePeriodo(fecIni: string, subper: number): QuincenaGema {
  const periodo = fecIni.slice(0, 7);
  if (subper === 1) return { periodo, quincena: 1, ini: `${periodo}-01`, fin: `${periodo}-15` };
  const [y, m] = periodo.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { periodo, quincena: 2, ini: `${periodo}-16`, fin: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}

/**
 * La nómina de conductores está cerrada cuando el período tiene est_per = 2
 * (observado en MGX: los liquidados tienen 2, el abierto 01045 tenía 1) y
 * además ya hay líneas en la nómina. MGX no documenta est_per: por eso se
 * exigen las dos condiciones.
 */
export function nominaCerrada(estPer: number | null, lineas: number): boolean {
  return estPer === 2 && lineas > 0;
}

export interface EntradaCruce {
  produccion: number;
  /** Valor por código de concepto de devengo (solo los del cruce). */
  conceptos: Record<string, number>;
  entregado: number;
}

export interface ResultadoCruce {
  produccion: number;
  nominaDevengo: number;
  /** Con signo: negativo cuando la producción no cubre la nómina. */
  generado: number;
  /** max(0, generado): otros devengados de la quincena. */
  otrosDevengados: number;
  entregado: number;
  /** generado − entregado. */
  saldo: number;
  /** max(0, saldo): otros devengados que faltan por entregar. */
  porEntregar: number;
  /**
   * max(0, −saldo): anticipo de salario del corte. Es el déficit de
   * producción frente a la nómina más lo entregado de más.
   */
  anticipo: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function cruzarQuincena(e: EntradaCruce): ResultadoCruce {
  const produccion = r2(e.produccion);
  const nominaDevengo = r2(Object.values(e.conceptos).reduce((s, v) => s + v, 0));
  const generado = r2(produccion - nominaDevengo);
  const entregado = r2(e.entregado);
  // Si la producción no cubre la nómina no hay otros devengados, y el déficit
  // queda en el mismo corte como anticipo de salario (así lo registra MGX en
  // el 546, verificado en 01040 y 01043); no pasa a la quincena siguiente.
  const otrosDevengados = r2(Math.max(0, generado));
  const saldo = r2(generado - entregado);
  return {
    produccion,
    nominaDevengo,
    generado,
    otrosDevengados,
    entregado,
    saldo,
    porEntregar: r2(Math.max(0, saldo)),
    anticipo: r2(Math.max(0, -saldo)),
  };
}
