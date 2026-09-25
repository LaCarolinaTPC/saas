/**
 * Calendario de pagos de afiliados: qué se le paga a quién en una fecha de
 * pago. Módulo puro; cruza el calendario (calendario-pago.ts) con la
 * liquidación (liquidacion-afiliados.ts).
 */
import {
  PLAZOS, estadoPago, pagosEntre, sumarDias, type EstadoPago, type PagoProgramado, type Plazo, type ReglaPago,
} from "./calendario-pago";
import { resumenPorAfiliado, type FilaResumenAfiliado, type FilaTercero } from "./liquidacion-afiliados";

/** Fechas de pago (de todos los plazos) entre ~4 meses atrás y 3 semanas adelante, de la más nueva a la más vieja. */
export function opcionesFechaPago(reglas: Record<Plazo, ReglaPago>, hoy: string): string[] {
  const desde = sumarDias(hoy, -120);
  const hasta = sumarDias(hoy, 21);
  const fechas = new Set<string>();
  for (const p of PLAZOS) for (const x of pagosEntre(reglas[p], desde, hasta)) fechas.add(x.pago.fecha);
  return [...fechas].sort().reverse();
}

/** La próxima fecha de pago desde hoy (incluido); si no hay, la más reciente. */
export function fechaPagoPorDefecto(opciones: string[], hoy: string): string | null {
  const futuras = opciones.filter((f) => f >= hoy);
  return futuras.length ? futuras[futuras.length - 1] : (opciones[0] ?? null);
}

/** Periodo de cada plazo que se paga en esa fecha (puede no haber de alguno). */
export function periodosQuePaganEl(reglas: Record<Plazo, ReglaPago>, fecha: string): Partial<Record<Plazo, PagoProgramado>> {
  const out: Partial<Record<Plazo, PagoProgramado>> = {};
  for (const p of PLAZOS) {
    const [x] = pagosEntre(reglas[p], fecha, fecha);
    if (x) out[p] = x;
  }
  return out;
}

/** Rango de fechas que hay que leer para cubrir todos los periodos. */
export function rangoDe(periodos: Partial<Record<Plazo, PagoProgramado>>): { desde: string; hasta: string } | null {
  const ps = Object.values(periodos);
  if (!ps.length) return null;
  return {
    desde: ps.map((p) => p.periodo.desde).sort()[0],
    hasta: ps.map((p) => p.periodo.hasta).sort().reverse()[0],
  };
}

export interface FilaPago extends FilaResumenAfiliado {
  codigo: string | null;
  plazo: Plazo;
  pago: PagoProgramado;
  estado: EstadoPago;
  /** GEMA aún no ha sincronizado todos los días del periodo. */
  incompleto: boolean;
}

/**
 * Una fila por afiliado cuyo plazo tiene periodo en esa fecha de pago y que
 * operó en ese periodo. Cada afiliado se mide en SU periodo: el semanal en su
 * semana y el quincenal en su quincena, aunque se lean juntos.
 */
export function armarPagos(d: {
  periodos: Partial<Record<Plazo, PagoProgramado>>;
  filas: FilaTercero[];
  propietarios: Map<string, { codigo: string | null; plazo: Plazo }>;
  hoy: string;
  ultimoSincronizado: string | null;
}): FilaPago[] {
  const porPlazo = new Map<Plazo, FilaTercero[]>();
  for (const f of d.filas) {
    const plazo = d.propietarios.get(f.cedula_propietario)?.plazo ?? "SEMANAL";
    const pp = d.periodos[plazo];
    if (!pp || f.fecha < pp.periodo.desde || f.fecha > pp.periodo.hasta) continue;
    const l = porPlazo.get(plazo);
    if (l) l.push(f);
    else porPlazo.set(plazo, [f]);
  }
  const out: FilaPago[] = [];
  for (const [plazo, fs] of porPlazo) {
    const pp = d.periodos[plazo]!;
    for (const r of resumenPorAfiliado(fs)) {
      out.push({
        ...r,
        codigo: d.propietarios.get(r.cedula)?.codigo ?? null,
        plazo,
        pago: pp,
        estado: estadoPago(pp.periodo, pp.pago, d.hoy),
        incompleto: !d.ultimoSincronizado || d.ultimoSincronizado < pp.periodo.hasta,
      });
    }
  }
  return out.sort((a, b) => (a.nombre ?? a.cedula).localeCompare(b.nombre ?? b.cedula, "es"));
}
