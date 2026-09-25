/**
 * Datos del detalle de un afiliado (solo servidor): los usan la pantalla de
 * Tesorería y el portal de afiliados, así los dos ven exactamente lo mismo.
 */
import {
  estadoPago, fechaPagoDe, periodoDe, periodosRecientes, sumarDias, ultimoPeriodoCerrado,
  type Plazo, type ReglaPago,
} from "./calendario-pago";
import { liquidar } from "./liquidacion-afiliados";
import { getFilasAfiliados, getPropietarios } from "./liquidacion-afiliados-data";
import { listarSoportes } from "./soportes";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Rango libre máximo: un año. Evita consultas enormes desde el portal. */
export const MAX_DIAS_RANGO = 366;

/** Normaliza el rango pedido: fechas válidas, en orden, sin futuro y a lo sumo un año. */
export function rangoPedido(
  desde: string | null | undefined, hasta: string | null | undefined, hoy: string, defecto: { desde: string; hasta: string },
): { desde: string; hasta: string } {
  let d = desde && FECHA_RE.test(desde) ? desde : defecto.desde;
  let h = hasta && FECHA_RE.test(hasta) ? hasta : defecto.hasta;
  if (h > hoy) h = hoy;
  if (d > h) d = h;
  const minimo = sumarDias(h, -(MAX_DIAS_RANGO - 1));
  if (d < minimo) d = minimo;
  return { desde: d, hasta: h };
}

export async function cargarDetalleAfiliado(p: {
  cedula: string;
  desde?: string | null;
  hasta?: string | null;
  hoy: string;
  reglas: Record<Plazo, ReglaPago>;
}) {
  const fichas = await getPropietarios([p.cedula]);
  const ficha = fichas.get(p.cedula) ?? null;
  const regla = p.reglas[ficha?.plazo ?? "SEMANAL"];
  const periodos = periodosRecientes(regla, p.hoy, 16).map((periodo) => {
    const pago = fechaPagoDe(regla, periodo);
    return { periodo, pago, estado: estadoPago(periodo, pago, p.hoy) };
  });
  const { desde, hasta } = rangoPedido(p.desde, p.hasta, p.hoy, ultimoPeriodoCerrado(regla, p.hoy));
  const [filas, soportes] = await Promise.all([
    getFilasAfiliados({ desde, hasta, cedula: p.cedula }),
    listarSoportes(p.cedula, desde, hasta),
  ]);
  // Si el rango coincide con un periodo del plazo, se muestra su fecha de pago.
  const delPlazo = periodoDe(regla, desde);
  const esPeriodo = delPlazo.desde === desde && delPlazo.hasta === hasta;
  return {
    ficha,
    desde,
    hasta,
    periodos,
    periodoActual: esPeriodo ? { periodo: delPlazo, pago: fechaPagoDe(regla, delPlazo) } : null,
    liquidacion: liquidar(p.cedula, filas),
    soportes: soportes.soportes,
    soportesDisponible: soportes.disponible,
  };
}
