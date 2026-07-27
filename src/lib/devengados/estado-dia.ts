import type { DiaCalculado } from "@/lib/devengados/engine";

/**
 * Fila del estado de cuenta: el día calculado por el motor más el pago REAL
 * de esa fecha (entregas vigentes) y el saldo corriente (liberado acumulado
 * − entregado hasta ese día).
 */
export type FilaCuenta = DiaCalculado & { pago: number; saldo: number };

type EntregaMin = {
  fecha: string;
  valor_entregado: number;
  movimiento: string;
  estado?: string | null;
};

/**
 * Construye el estado de cuenta renglón por renglón: por cada día, el pago
 * real registrado ese día y el saldo corriente. El último saldo es el
 * pendiente por pagar de la quincena.
 */
export function construirCuenta(
  dias: DiaCalculado[],
  entregas: EntregaMin[]
): { filas: FilaCuenta[]; totalPago: number } {
  const pagoPorDia = new Map<string, number>();
  for (const e of entregas) {
    if (e.movimiento === "DEBITO" && (e.estado ?? "activa") === "activa") {
      pagoPorDia.set(e.fecha, (pagoPorDia.get(e.fecha) ?? 0) + e.valor_entregado);
    }
  }
  let entregadoAcum = 0;
  const filas = dias.map((d) => {
    const pago = pagoPorDia.get(d.fecha) ?? 0;
    entregadoAcum += pago;
    return { ...d, pago, saldo: Math.round((d.liberadoAcum - entregadoAcum) * 100) / 100 };
  });
  let totalPago = 0;
  for (const v of pagoPorDia.values()) totalPago += v;
  return { filas, totalPago };
}

/**
 * Etiqueta de estado/alerta del renglón, derivada del SALDO (no del pago
 * real ni del "entregar hoy" teórico — solicitud de Nestor, 25-jul-2026):
 * - saldo > 0  → hay plata liberada pendiente por entregar.
 * - saldo = 0 con liberado > 0 → todo lo liberado ya se entregó ("Total
 *   Entregado Q1/Q2", 27-jul-2026).
 * - sin nada liberado → retenido si el acumulado va en déficit; si no,
 *   simplemente no hubo excedente.
 */
export function estadoDia(
  d: FilaCuenta,
  quincena: 1 | 2
): { label: string; bg: string; color: string } {
  if (d.estado === "sin_produccion")
    return { label: "Sin producción", bg: "#F1F5F9", color: "#64748B" };
  if (d.saldo > 0)
    return { label: "Entrega autorizada", bg: "#D1FAE5", color: "#059669" };
  if (d.liberadoAcum > 0)
    return { label: `Total Entregado Q${quincena}`, bg: "#DBEAFE", color: "#1D4ED8" };
  if (d.saldoAcumulado < 0)
    return { label: "Retenido – déficit acumulado", bg: "#FEE2E2", color: "#EF4444" };
  return { label: "Sin excedente", bg: "#F1F5F9", color: "#64748B" };
}
