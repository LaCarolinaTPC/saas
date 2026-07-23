import { getBaseDiaria } from "@/lib/devengados/data";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { SimuladorClient } from "./simulador-client";

export const dynamic = "force-dynamic";

/**
 * Simulador de devengados: cifras hipotéticas sobre el motor real
 * (calcularQuincena). No consulta ni escribe datos de conductores — solo
 * precarga la base diaria vigente.
 */
export default async function SimuladorPage() {
  await requireTesoreriaSub("simulador");
  const baseVigente = await getBaseDiaria();
  return <SimuladorClient baseVigente={baseVigente} />;
}
