import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { getRendimientoDia } from "@/lib/devengados/rendimiento";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { SimuladorClient } from "./simulador-client";

export const dynamic = "force-dynamic";

/**
 * Simulador de devengados, dos pestañas:
 * - Hipotético: cifras inventadas sobre el motor real (calcularQuincena).
 * - Rendimiento del día: producción real de viajes_recaudados con la
 *   fórmula de pago (TIMB. CU × tarifa × % − base − ahorro), solo códigos.
 */
export default async function SimuladorPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  await requireTesoreriaSub("simulador");
  const { fecha } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const fechaSel =
    fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= hoy ? fecha : hoy;

  const [baseVigente, rendimiento] = await Promise.all([
    getBaseDiaria(),
    getRendimientoDia(fechaSel),
  ]);

  return (
    <SimuladorClient
      baseVigente={baseVigente}
      rendimiento={rendimiento}
      fecha={fechaSel}
      hoy={hoy}
    />
  );
}
