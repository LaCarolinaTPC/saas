/**
 * Otros devengados: cruce de la producción GEMA de una quincena contra los
 * conceptos de devengo de la nómina de conductores YA CERRADA en MGX.
 *
 * Es una opción aparte de Caja devengados (src/lib/devengados/): no usa la
 * base diaria ni el corte a corte, y no modifica nada de esa lógica.
 *
 *   producción     = Σ salario neto día de los cierres GEMA de la quincena
 *   nómina devengo = Σ conceptos de devengo del período MGX
 *                    (003, 010, 202, 208, 209)
 *   generado       = producción − nómina devengo
 *   otros dev.     = max(0, generado)
 *   disponible     = max(0, otros dev. − descuentos + devoluciones)
 *   por entregar   = max(0, disponible − entregado)
 *   anticipo       = déficit de producción (max(0, −generado))
 *                    + lo entregado de más (max(0, entregado − disponible))
 *
 * Descuentos: pérdida de viaje, pérdida de turno, casino y el saldo
 * trasladado del corte anterior. Devolución de viaje y el ajuste a cero
 * suman. Lo que los descuentos no alcanzan a cubrir queda como «descuento
 * pendiente» (no se convierte en anticipo de salario).
 *
 * Saldo negativo del corte = max(0, entregado − (otros dev. − descuentos +
 * devoluciones)): lo que el conductor queda debiendo sobre sus otros
 * devengados (descuento sin cubrir o entrega de más). Tesorería lo puede
 * llevar a cero con un «ajuste a cero» en el corte y un «saldo del corte
 * anterior» por el mismo valor en el corte siguiente. El déficit de
 * producción frente a la nómina NO entra: MGX ya lo descuenta como anticipo
 * de salario (546).
 *
 * El saldo no se arrastra a la quincena siguiente. Módulo puro: sin base.
 */

/**
 * Conceptos de devengo del cruce. Los ajustes 006 (auxilio de transporte) y
 * 013 (salario devengo) NO entran: Tesorería y MGX (216) no los descuentan
 * de la producción (decisión del 2026-11-04, conciliación de la 01043).
 */
export const CONCEPTOS_DEVENGO_DEFECTO = ["003", "010", "202", "208", "209"] as const;
/** Conceptos de MGX que sirven de referencia para revisar el cruce. */
export const CONCEPTO_OTROS_DEVENGADOS_MGX = "216";
export const CONCEPTO_ANTICIPO_SALARIO_MGX = "546";

/** Novedades que ajustan los otros devengados de la quincena. */
export const TIPOS_NOVEDAD = [
  "perdida_viaje",
  "perdida_turno",
  "casino",
  "devolucion_viaje",
  "saldo_anterior",
  "ajuste_saldo",
] as const;
export type TipoNovedad = (typeof TIPOS_NOVEDAD)[number];
export const NOMBRE_NOVEDAD: Record<TipoNovedad, string> = {
  perdida_viaje: "Pérdida de viaje",
  perdida_turno: "Pérdida de turno",
  casino: "Casino",
  devolucion_viaje: "Devolución de viaje",
  saldo_anterior: "Saldo del corte anterior",
  ajuste_saldo: "Ajuste a cero (pasa al corte siguiente)",
};
/** La devolución de viaje suma; las demás restan. */
export const novedadSuma = (t: TipoNovedad) => t === "devolucion_viaje" || t === "ajuste_saldo";
/** Las dos caras de un traslado de saldo: solo las crea Tesorería, en pareja. */
export const TIPOS_TRASLADO: readonly TipoNovedad[] = ["ajuste_saldo", "saldo_anterior"];

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
  return quincenaGema(periodo, subper === 1 ? 1 : 2);
}

export function quincenaGema(periodo: string, quincena: 1 | 2): QuincenaGema {
  if (quincena === 1) return { periodo, quincena: 1, ini: `${periodo}-01`, fin: `${periodo}-15` };
  const [y, m] = periodo.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { periodo, quincena: 2, ini: `${periodo}-16`, fin: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}

/** Quincena GEMA de un día ('YYYY-MM-DD'). */
export function quincenaDeFecha(fecha: string): QuincenaGema {
  return quincenaGema(fecha.slice(0, 7), Number(fecha.slice(8, 10)) <= 15 ? 1 : 2);
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
  /** Pérdida de viaje + pérdida de turno + casino (positivo). */
  descuentos?: number;
  /** Devolución de viaje (positivo, suma). */
  devoluciones?: number;
}

export interface ResultadoCruce {
  produccion: number;
  nominaDevengo: number;
  /** Con signo: negativo cuando la producción no cubre la nómina. */
  generado: number;
  /** max(0, generado): otros devengados de la quincena, antes de novedades. */
  otrosDevengados: number;
  descuentos: number;
  devoluciones: number;
  /** Lo que se puede entregar en la quincena después de las novedades. */
  disponible: number;
  /** Descuentos que los otros devengados no alcanzaron a cubrir. */
  descuentoPendiente: number;
  entregado: number;
  /** disponible − entregado (negativo si se entregó de más). */
  saldo: number;
  /** max(0, saldo): lo que falta por entregar. */
  porEntregar: number;
  /**
   * Lo que el conductor queda debiendo sobre sus otros devengados (descuento
   * sin cubrir + entregado de más). Es lo que se puede trasladar al corte
   * siguiente.
   */
  saldoNegativo: number;
  /**
   * Anticipo de salario del corte: déficit de producción frente a la nómina
   * más lo entregado de más.
   */
  anticipo: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function cruzarQuincena(e: EntradaCruce): ResultadoCruce {
  const produccion = r2(e.produccion);
  const nominaDevengo = r2(Object.values(e.conceptos).reduce((s, v) => s + v, 0));
  const generado = r2(produccion - nominaDevengo);
  const entregado = r2(e.entregado);
  const descuentos = r2(e.descuentos ?? 0);
  const devoluciones = r2(e.devoluciones ?? 0);
  // Si la producción no cubre la nómina no hay otros devengados, y el déficit
  // queda en el mismo corte como anticipo de salario (así lo registra MGX en
  // el 546, verificado en 01040 y 01043); no pasa a la quincena siguiente.
  const otrosDevengados = r2(Math.max(0, generado));
  const neto = r2(otrosDevengados - descuentos + devoluciones);
  const disponible = r2(Math.max(0, neto));
  const saldo = r2(disponible - entregado);
  return {
    produccion,
    nominaDevengo,
    generado,
    otrosDevengados,
    descuentos,
    devoluciones,
    disponible,
    descuentoPendiente: r2(Math.max(0, -neto)),
    entregado,
    saldo,
    porEntregar: r2(Math.max(0, saldo)),
    saldoNegativo: r2(Math.max(0, entregado - neto)),
    anticipo: r2(Math.max(0, -generado) + Math.max(0, -saldo)),
  };
}

/** Valor sugerido por unidad en el formulario de Operativo (planilla 01043). */
export const VALOR_UNITARIO_SUGERIDO: Partial<Record<TipoNovedad, number>> = {
  perdida_turno: 10_000,
  perdida_viaje: 80_000,
  devolucion_viaje: 80_000,
};

/**
 * Primer día del primer corte de Otros devengados: la operación arranca en
 * la 2.ª quincena de octubre de 2026 (nómina MGX 01045; decisión de
 * Tesorería del 2026-11-04, la 1.ª de octubre quedó como referencia de la
 * conciliación). Ese corte no tiene anterior que cerrar.
 */
export const INICIO_OTROS_DEVENGADOS = "2026-10-16";

/**
 * Cortes (quincenas GEMA) desde el inicio hasta el de `hoy`, el más reciente
 * primero. Antes del inicio devuelve solo el primer corte, para que las
 * pantallas tengan qué mostrar.
 */
export function cortesHasta(hoy: string): QuincenaGema[] {
  const todos = cortesDesdeMes(hoy, INICIO_OTROS_DEVENGADOS.slice(0, 7)).filter((c) => c.ini >= INICIO_OTROS_DEVENGADOS);
  return todos.length ? todos : [quincenaDeFecha(INICIO_OTROS_DEVENGADOS)];
}

function cortesDesdeMes(hoy: string, desde: string): QuincenaGema[] {
  const fin = quincenaDeFecha(hoy);
  const out: QuincenaGema[] = [];
  let [y, m] = desde.split("-").map(Number);
  for (;;) {
    const periodo = `${y}-${String(m).padStart(2, "0")}`;
    for (const q of [1, 2] as const) {
      if (`${periodo}-${q}` > `${fin.periodo}-${fin.quincena}`) return out.reverse();
      out.push(quincenaGema(periodo, q));
    }
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
}

/** Corte (quincena GEMA) que sigue a `q`. */
export function siguienteCorte(q: { periodo: string; quincena: number }): QuincenaGema {
  if (q.quincena === 1) return quincenaGema(q.periodo, 2);
  let [y, m] = q.periodo.split("-").map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return quincenaGema(`${y}-${String(m).padStart(2, "0")}`, 1);
}

/** Corte anterior a `q`, o null si `q` es el primero de la opción. */
export function corteAnterior(q: { periodo: string; quincena: number }): QuincenaGema | null {
  let ant: QuincenaGema;
  if (q.quincena === 2) ant = quincenaGema(q.periodo, 1);
  else {
    let [y, m] = q.periodo.split("-").map(Number);
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    ant = quincenaGema(`${y}-${String(m).padStart(2, "0")}`, 2);
  }
  return ant.ini < INICIO_OTROS_DEVENGADOS ? null : ant;
}

export const claveCorte = (q: { periodo: string; quincena: number }) => `${q.periodo}-${q.quincena}`;
