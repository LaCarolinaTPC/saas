/**
 * Incapacidades de un conductor en un periodo: cuántas y cuántos días. Parte
 * PURA: se prueba sola (`incapacidades-conteo.test.ts`).
 *
 * Una incapacidad se registra UNA FILA POR DÍA (como todo el Registro del
 * día), y cada fila lleva anotado el rango completo de la incapacidad médica.
 * Antes se sumaba ese rango por cada fila: una de 2 días con sus 2 filas daba
 * 4 días y 2 incapacidades, y una de 15 días daba 225. Medido en 2026 hasta el
 * 2026-10-28: 4.830 días mostrados contra 1.313 reales, en 81 conductores
 * (el caso reportado fue 72246879).
 *
 * Ahora:
 *  · los días son los DISTINTOS que cubre alguna incapacidad, y solo los que
 *    caen dentro del periodo consultado;
 *  · una incapacidad es un mismo rango médico (inicio-fin); una fila sin rango
 *    anotado cuenta como una incapacidad aparte, como antes.
 */
import { diasEntre, sumarDias } from "./constants";

export interface FilaIncapacidad {
  fecha: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  incapacidad_inicio: string | null;
  incapacidad_fin: string | null;
}

/** Rango que cubre una fila: el de la incapacidad médica o, si no se anotó, el del reporte. */
function rangoDe(r: FilaIncapacidad): { ini: string; fin: string } {
  const ini = r.incapacidad_inicio ?? r.fecha_inicio ?? r.fecha;
  const fin = r.incapacidad_fin ?? r.fecha_fin ?? ini;
  // Rango al revés (error de digitación): la fila cubre al menos su día.
  return fin >= ini ? { ini, fin } : { ini: r.fecha, fin: r.fecha };
}

export function conteoIncapacidades(
  filas: readonly FilaIncapacidad[],
  desde: string,
  hasta: string
): { incapacidades: number; dias: number } {
  const dias = new Set<string>();
  const rangos = new Set<string>();
  let sinRango = 0;
  for (const r of filas) {
    if (r.incapacidad_inicio && r.incapacidad_fin) rangos.add(`${r.incapacidad_inicio}|${r.incapacidad_fin}`);
    else sinRango += 1;
    const { ini, fin } = rangoDe(r);
    const a = ini < desde ? desde : ini;
    const b = fin > hasta ? hasta : fin;
    for (let i = 0, n = diasEntre(a, b); i <= n; i++) dias.add(sumarDias(a, i));
  }
  return { incapacidades: rangos.size + sinRango, dias: dias.size };
}
