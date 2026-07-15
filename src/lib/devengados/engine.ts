/**
 * Motor de cálculo de "otros devengados" a conductores.
 *
 * Reglas de negocio (CSV "Consideraciones", v5):
 * - La base diaria es un parámetro de la empresa (app_settings), nunca fija.
 * - Solo se habilita excedente cuando producción neta del día > base diaria,
 *   y únicamente por la diferencia.
 * - Regla de oro (protección acumulada, corte a corte dentro de la quincena):
 *   el excedente de un día primero cubre el déficit acumulado de días
 *   anteriores; solo se libera lo que sobre. Si no alcanza, la entrega queda
 *   BLOQUEADA con alerta hasta que el acumulado se recupere.
 *
 * Supuesto: la base solo se exige en días con producción (> 0). Un día sin
 * viajes no suma base exigida ni genera déficit.
 *
 * Módulo puro: sin acceso a BD, calculable y testeable en aislamiento.
 */

export type EstadoDia =
  | "cumple"        // producción del día >= base y el acumulado permite liberar
  | "deficit"       // producción del día < base exigida
  | "retenido"      // el día tuvo excedente pero el acumulado lo retiene
  | "sin_produccion";

export interface DiaCalculado {
  fecha: string;              // 'YYYY-MM-DD'
  produccion: number;         // producción neta del día (salario neto día)
  baseExigida: number;        // base diaria si hubo producción, 0 si no
  excedenteDia: number;       // max(0, produccion - baseExigida)
  deficitDia: number;         // max(0, baseExigida - produccion)
  acumProduccion: number;
  acumBase: number;
  saldoAcumulado: number;     // acumProduccion - acumBase (negativo = déficit)
  // Columnas de la hoja Simulacion_Diaria del Excel:
  liberadoAcum: number;       // excedente ya liberado acumulado = max(0, saldo)
  entregarHoy: number;        // excedente a ENTREGAR HOY (incremento del liberado)
  estado: EstadoDia;
}

export interface ResumenQuincena {
  dias: DiaCalculado[];
  produccionAcum: number;
  baseAcum: number;
  saldoAcumulado: number;     // negativo = quincena en déficit
  excedenteAcum: number;      // max(0, saldoAcumulado)
  entregado: number;          // suma de entregas ya aprobadas en la quincena
  disponible: number;         // excedenteAcum - entregado (piso 0)
  enAlerta: boolean;          // hay excedentes de días retenidos por déficit acumulado
  diasConProduccion: number;
}

/** Redondeo a centavos para evitar arrastres de flotantes. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula la quincena corte a corte.
 * @param produccionPorDia producción neta por fecha (solo días con datos)
 * @param baseDiaria       parámetro vigente (app_settings)
 * @param entregado        total ya entregado en la quincena
 */
export function calcularQuincena(
  produccionPorDia: Array<{ fecha: string; produccion: number }>,
  baseDiaria: number,
  entregado: number
): ResumenQuincena {
  const ordenados = [...produccionPorDia].sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );

  const dias: DiaCalculado[] = [];
  let acumProduccion = 0;
  let acumBase = 0;
  let enAlerta = false;
  let diasConProduccion = 0;
  let liberadoPrevio = 0;

  for (const d of ordenados) {
    const produccion = round2(d.produccion);
    const conProduccion = produccion > 0;
    const baseExigida = conProduccion ? baseDiaria : 0;
    if (conProduccion) diasConProduccion += 1;

    acumProduccion = round2(acumProduccion + produccion);
    acumBase = round2(acumBase + baseExigida);
    const saldoAcumulado = round2(acumProduccion - acumBase);

    const excedenteDia = round2(Math.max(0, produccion - baseExigida));
    const deficitDia = round2(Math.max(0, baseExigida - produccion));

    // Como en la hoja Simulacion_Diaria: lo liberado acumulado es la
    // diferencia acumulada positiva, y lo a entregar HOY es su incremento
    // frente al día anterior (0 si el acumulado sigue en déficit).
    const liberadoAcum = round2(Math.max(0, saldoAcumulado));
    const entregarHoy = round2(Math.max(0, liberadoAcum - liberadoPrevio));
    liberadoPrevio = liberadoAcum;

    let estado: EstadoDia;
    if (!conProduccion) {
      estado = "sin_produccion";
    } else if (deficitDia > 0) {
      estado = "deficit";
    } else if (excedenteDia > 0 && saldoAcumulado < excedenteDia) {
      // El día generó excedente pero el acumulado retiene parte o todo.
      estado = "retenido";
      enAlerta = true;
    } else {
      estado = "cumple";
    }

    dias.push({
      fecha: d.fecha,
      produccion,
      baseExigida,
      excedenteDia,
      deficitDia,
      acumProduccion,
      acumBase,
      saldoAcumulado,
      liberadoAcum,
      entregarHoy,
      estado,
    });
  }

  const saldoAcumulado = round2(acumProduccion - acumBase);
  const excedenteAcum = round2(Math.max(0, saldoAcumulado));
  const disponible = round2(Math.max(0, excedenteAcum - entregado));
  // La quincena queda en alerta si el acumulado sigue en déficit.
  if (saldoAcumulado < 0 && diasConProduccion > 0) enAlerta = true;

  return {
    dias,
    produccionAcum: acumProduccion,
    baseAcum: acumBase,
    saldoAcumulado,
    excedenteAcum,
    entregado: round2(entregado),
    disponible,
    enAlerta,
    diasConProduccion,
  };
}

/** Rango de la quincena que contiene una fecha 'YYYY-MM-DD'. */
export function quincenaDe(fecha: string): {
  ini: string;
  fin: string;
  periodo: string;
  quincena: 1 | 2;
} {
  const periodo = fecha.slice(0, 7); // 'YYYY-MM'
  const dia = Number(fecha.slice(8, 10));
  if (dia <= 15) {
    return { ini: `${periodo}-01`, fin: `${periodo}-15`, periodo, quincena: 1 };
  }
  const [y, m] = periodo.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    ini: `${periodo}-16`,
    fin: `${periodo}-${String(ultimoDia).padStart(2, "0")}`,
    periodo,
    quincena: 2,
  };
}

/**
 * Cruce en caja de un valor a liquidar contra el día:
 * primero se cubre lo que falte de la base del día; el remanente queda como
 * "otros devengados". Lo realmente entregable lo limita además el acumulado
 * quincenal (disponible del resumen).
 */
export function cruceCaja(
  valorSeleccionado: number,
  produccionPreviaDia: number,
  baseDiaria: number
): { aBase: number; aExcedente: number; basePendiente: number } {
  const basePendiente = round2(Math.max(0, baseDiaria - produccionPreviaDia));
  const aBase = round2(Math.min(valorSeleccionado, basePendiente));
  const aExcedente = round2(Math.max(0, valorSeleccionado - aBase));
  return { aBase, aExcedente, basePendiente: round2(Math.max(0, basePendiente - aBase)) };
}
