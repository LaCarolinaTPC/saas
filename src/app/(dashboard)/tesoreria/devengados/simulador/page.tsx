import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { getCierreDia, getRendimientoDia } from "@/lib/devengados/rendimiento";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { SimuladorClient } from "./simulador-client";

export const dynamic = "force-dynamic";

/**
 * Simulador de devengados, dos pestañas:
 * - Hipotético: cifras inventadas sobre el motor real (calcularQuincena).
 * - Rendimiento del día: si ya existe el cierre de GEMA para la fecha, es
 *   una CONSULTA (salario neto día liquidado − base, idéntico al análisis
 *   quincenal); si aún no hay cierre, estimado desde viajes_recaudados con
 *   la fórmula (TIMB. CU × tarifa × % − base − ahorro). Solo códigos.
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

  const [baseVigente, rendimiento, cierre] = await Promise.all([
    getBaseDiaria(),
    getRendimientoDia(fechaSel),
    getCierreDia(fechaSel),
  ]);

  return (
    <SimuladorClient
      baseVigente={baseVigente}
      rendimiento={rendimiento}
      cierre={cierre}
      fecha={fechaSel}
      hoy={hoy}
    />
  );
}
