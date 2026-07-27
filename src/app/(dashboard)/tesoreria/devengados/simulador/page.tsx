import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { getCierreRango, getRendimientoDia } from "@/lib/devengados/rendimiento";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { SimuladorClient } from "./simulador-client";

export const dynamic = "force-dynamic";

type ConductorRow = {
  cedula: string;
  nombre: string;
  codigo: string | null;
  estado: string | null;
};

/**
 * Simulador de devengados, tres pestañas:
 * - Hipotético: cifras inventadas sobre el motor real (calcularQuincena).
 * - Rendimiento del día: si ya existe el cierre de GEMA para la fecha, es
 *   una CONSULTA (salario neto día liquidado − base, idéntico al análisis
 *   quincenal); si aún no hay cierre, estimado desde viajes_recaudados con
 *   la fórmula (TIMB. CU × tarifa × % − base − ahorro). Solo códigos.
 *   Admite rango desde/hasta (segmentación por corte, Nestor 24-jul-2026).
 * - Registro del corte: el registro diario de la caja (solo consulta).
 */
export default async function SimuladorPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; hasta?: string }>;
}) {
  await requireTesoreriaSub("simulador");
  const { fecha, hasta } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const valida = (f?: string) =>
    f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : null;
  const fechaSel = valida(fecha) ?? hoy;
  const hastaParam = valida(hasta);
  const fechaFin = hastaParam && hastaParam >= fechaSel ? hastaParam : fechaSel;

  // Maestro de conductores para la pestaña "Registro del corte" (el
  // simulador es solo de administradores; ver memoria del proyecto).
  const supabase = createAdminClient();
  const conductores: ConductorRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("conductores")
      .select("cedula, nombre, codigo, estado")
      .eq("estado", "ACTIVO")
      .order("nombre", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as ConductorRow[];
    conductores.push(...rows);
    if (rows.length < PAGE) break;
  }

  const [baseVigente, rendimiento, cierre] = await Promise.all([
    getBaseDiaria(),
    // El detalle por ruta/estimado es de un solo día; en rango no aplica.
    fechaFin === fechaSel ? getRendimientoDia(fechaSel) : Promise.resolve([]),
    getCierreRango(fechaSel, fechaFin),
  ]);

  return (
    <SimuladorClient
      baseVigente={baseVigente}
      rendimiento={rendimiento}
      cierre={cierre}
      fecha={fechaSel}
      fechaFin={fechaFin}
      hoy={hoy}
      conductores={conductores}
    />
  );
}
