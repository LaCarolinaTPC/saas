import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { getCierreConDetalle, getRendimientoRango } from "@/lib/devengados/rendimiento";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { getCurrentPermissions } from "@/lib/permissions";
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
  // Los usuarios con permiso de simulador (no admin) solo ven la primera
  // pestaña, "Rendimiento del día" (pedido de Nestor, 29-jul-2026).
  const { isAdmin } = await getCurrentPermissions();
  const { fecha, hasta } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const valida = (f?: string) =>
    f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : null;
  const fechaSel = valida(fecha) ?? hoy;
  const hastaParam = valida(hasta);
  const fechaFin = hastaParam && hastaParam >= fechaSel ? hastaParam : fechaSel;

  // Maestro de conductores para la pestaña "Registro del corte" — solo el
  // admin la ve, así que a los demás ni se les envían nombres/cédulas.
  const supabase = createAdminClient();
  const conductores: ConductorRow[] = [];
  if (isAdmin) {
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
  }

  const [baseVigente, { conductores: cierre, detalle }] = await Promise.all([
    getBaseDiaria(),
    getCierreConDetalle(fechaSel, fechaFin),
  ]);
  // Con cierre, el detalle por ruta sale del MISMO cierre (coincide dígito a
  // dígito con la tabla principal); sin cierre, se estima desde los viajes.
  const rendimiento =
    cierre.length > 0 ? detalle : await getRendimientoRango(fechaSel, fechaFin);

  return (
    <SimuladorClient
      baseVigente={baseVigente}
      rendimiento={rendimiento}
      cierre={cierre}
      fecha={fechaSel}
      fechaFin={fechaFin}
      hoy={hoy}
      conductores={conductores}
      soloRendimiento={!isAdmin}
    />
  );
}
